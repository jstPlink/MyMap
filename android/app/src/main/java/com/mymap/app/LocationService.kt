package com.mymap.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.BatteryManager
import android.os.Build
import android.os.IBinder
import android.os.Looper
import java.util.UUID

/**
 * Tracking in background con il solo LocationManager di Android (nessuna dipendenza da Google Play Services).
 * Frequenza adattiva: fermo = campionamento rado, in movimento = fitto. È il punto da cui partire
 * per gli esperimenti sul consumo batteria.
 */
class LocationService : Service(), LocationListener {

    private lateinit var lm: LocationManager
    private lateinit var store: PointStore
    private lateinit var prefs: Prefs

    private var fast = true
    private var stillCount = 0
    private var sinceSync = 0
    private var last: Location? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        lm = getSystemService(Context.LOCATION_SERVICE) as LocationManager
        store = PointStore(this)
        prefs = Prefs(this)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            prefs.tracking = false
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
            return START_NOT_STICKY
        }
        startInForeground()
        prefs.tracking = true
        request(fast = true)
        return START_STICKY
    }

    private fun startInForeground() {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL, "Tracking posizione", NotificationManager.IMPORTANCE_LOW)
        )
        val open = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE
        )
        val n = Notification.Builder(this, CHANNEL)
            .setContentTitle("MyMap sta registrando il percorso")
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentIntent(open)
            .setOngoing(true)
            .build()
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
        } else {
            startForeground(1, n)
        }
    }

    @Suppress("MissingPermission")
    private fun request(fast: Boolean) {
        this.fast = fast
        lm.removeUpdates(this)
        val interval = if (fast) 5_000L else 60_000L
        val minDist = if (fast) 5f else 25f
        try {
            if (lm.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, interval, minDist, this, Looper.getMainLooper())
            }
        } catch (_: SecurityException) {
            stopSelf()
        }
    }

    override fun onLocationChanged(loc: Location) {
        // scarta fix troppo imprecisi: sporcherebbero il map matching
        if (loc.hasAccuracy() && loc.accuracy > MAX_ACCURACY_M) return

        store.insert(
            TrackPoint(
                clientId = UUID.randomUUID().toString(),
                ts = loc.time,
                lat = loc.latitude,
                lon = loc.longitude,
                accuracy = if (loc.hasAccuracy()) loc.accuracy else null,
                speed = if (loc.hasSpeed()) loc.speed else null,
                bearing = if (loc.hasBearing()) loc.bearing else null,
                altitude = if (loc.hasAltitude()) loc.altitude else null,
                provider = loc.provider ?: "gps",
                battery = battery(),
            )
        )

        adapt(loc)
        last = loc

        if (++sinceSync >= SYNC_EVERY) {
            sinceSync = 0
            SyncWorker.enqueue(this)
        }
    }

    /** Dopo 6 fix quasi fermi passa a campionamento lento; al primo movimento torna veloce. */
    private fun adapt(loc: Location) {
        val speed = if (loc.hasSpeed()) loc.speed else 0f
        if (speed < 0.5f) {
            stillCount++
            if (fast && stillCount >= 6) request(fast = false)
        } else {
            stillCount = 0
            if (!fast) request(fast = true)
        }
    }

    private fun battery(): Int {
        val bm = getSystemService(Context.BATTERY_SERVICE) as BatteryManager
        return bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
    }

    override fun onDestroy() {
        lm.removeUpdates(this)
        SyncWorker.enqueue(this)
        super.onDestroy()
    }

    companion object {
        const val ACTION_STOP = "com.mymap.app.STOP"
        private const val CHANNEL = "tracking"
        private const val MAX_ACCURACY_M = 60f
        private const val SYNC_EVERY = 20

        fun start(ctx: Context) {
            ctx.startForegroundService(Intent(ctx, LocationService::class.java))
        }

        fun stop(ctx: Context) {
            ctx.startService(Intent(ctx, LocationService::class.java).setAction(ACTION_STOP))
        }
    }
}
