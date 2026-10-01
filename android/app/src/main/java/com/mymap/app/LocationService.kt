package com.mymap.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.hardware.Sensor
import android.hardware.SensorManager
import android.hardware.TriggerEvent
import android.hardware.TriggerEventListener
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.BatteryManager
import android.os.Build
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import java.util.UUID

/**
 * Tracking in background con il solo LocationManager di Android (nessuna dipendenza da Google Play Services).
 *
 * Frequenza adattiva, regolabile dalle impostazioni del Tracker:
 *  - in movimento: un punto ogni `movingSec` secondi;
 *  - da fermo: `stillPoints` punti ogni `stillMinutes` minuti ("battito"), senza filtro sulla distanza, così anche di notte
 *    ci sono sempre punti. Da fermo si usa anche il provider di rete come riserva (dentro casa il GPS spesso non aggancia).
 * Per accorgersi subito che si riparte, da fermo si arma il sensore "movimento significativo".
 * Un wake lock breve copre solo il salvataggio di ogni punto: tenere la CPU sempre sveglia scaricherebbe la batteria.
 */
class LocationService : Service(), LocationListener {

    private lateinit var lm: LocationManager
    private lateinit var store: PointStore
    private lateinit var prefs: Prefs
    private lateinit var wake: PowerManager.WakeLock
    private var sensors: SensorManager? = null
    private var motion: Sensor? = null

    private var fast = true
    private var stillCount = 0
    private var sinceSync = 0
    private var lastSavedMs = 0L

    private val motionTrigger = object : TriggerEventListener() {
        override fun onTrigger(event: TriggerEvent?) {
            // il telefono si è mosso davvero: si torna subito al campionamento fitto, senza aspettare il prossimo battito
            stillCount = 0
            if (!fast) request(fast = true)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        lm = getSystemService(Context.LOCATION_SERVICE) as LocationManager
        store = PointStore(this)
        prefs = Prefs(this)
        wake = (getSystemService(Context.POWER_SERVICE) as PowerManager)
            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "mymap:location").apply { setReferenceCounted(false) }
        sensors = getSystemService(Context.SENSOR_SERVICE) as? SensorManager
        motion = sensors?.getDefaultSensor(Sensor.TYPE_SIGNIFICANT_MOTION)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                prefs.tracking = false
                running = false
                TrackerWatchdog.cancel(this)
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
                return START_NOT_STICKY
            }
            ACTION_RELOAD -> { // parametri cambiati: si riapplicano senza riavviare il servizio
                request(fast)
                return START_STICKY
            }
        }
        startInForeground()
        prefs.tracking = true
        running = true
        getSystemService(NotificationManager::class.java).cancel(TrackerWatchdog.ALERT_ID)
        TrackerWatchdog.schedule(this)
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

    /** Intervallo del battito da fermo: `stillPoints` punti ogni `stillMinutes` minuti. */
    private fun stillIntervalMs() = (prefs.stillMinutes * 60_000L / prefs.stillPoints.coerceAtLeast(1)).coerceAtLeast(5_000L)

    @Suppress("MissingPermission")
    private fun request(fast: Boolean) {
        this.fast = fast
        lm.removeUpdates(this)
        val interval = if (fast) prefs.movingSec.coerceAtLeast(1) * 1000L else stillIntervalMs()
        try {
            if (lm.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, interval, 0f, this, Looper.getMainLooper())
            }
            // da fermo il provider di rete (Wi-Fi e celle) fa da riserva quando il GPS non aggancia, ad esempio in casa
            if (!fast && lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                lm.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, interval, 0f, this, Looper.getMainLooper())
            }
        } catch (_: SecurityException) {
            stopSelf()
        }
        armMotion(!fast)
    }

    /** Da fermo si arma il sensore di movimento significativo (scatta una volta sola e sveglia la CPU). */
    private fun armMotion(on: Boolean) {
        val s = sensors ?: return
        val m = motion ?: return
        try {
            if (on) s.requestTriggerSensor(motionTrigger, m) else s.cancelTriggerSensor(motionTrigger, m)
        } catch (_: Exception) {
        }
    }

    override fun onLocationChanged(loc: Location) {
        // il wake lock copre solo il tempo di salvare il punto
        wake.acquire(15_000L)
        try {
            handle(loc)
        } finally {
            if (wake.isHeld) wake.release()
        }
    }

    private fun handle(loc: Location) {
        // scarta fix troppo imprecisi: sporcherebbero il map matching
        if (loc.hasAccuracy() && loc.accuracy > MAX_ACCURACY_M) return
        val isGps = loc.provider == LocationManager.GPS_PROVIDER

        // da fermo GPS e rete possono rispondere insieme: un punto solo per intervallo
        val minGap = if (fast) 0L else stillIntervalMs() / 2
        if (lastSavedMs != 0L && loc.time - lastSavedMs in 0 until minGap) {
            if (isGps) adapt(loc)
            return
        }

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
        lastSavedMs = loc.time

        if (isGps) adapt(loc)

        if (++sinceSync >= SYNC_EVERY) {
            sinceSync = 0
            SyncWorker.enqueue(this)
        }
    }

    /**
     * Sei fix quasi fermi di fila (< 0,6 m/s) portano al battito lento; un fix a più di 1 m/s riporta al campionamento fitto.
     * La zona tra 0,6 e 1 m/s non cambia nulla, così il rumore del GPS non fa oscillare tra i due modi.
     */
    private fun adapt(loc: Location) {
        val speed = if (loc.hasSpeed()) loc.speed else 0f
        if (speed < 0.6f) {
            stillCount++
            if (fast && stillCount >= 6) request(fast = false)
        } else if (speed >= 1.0f) {
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
        armMotion(false)
        if (wake.isHeld) wake.release()
        running = false
        SyncWorker.enqueue(this)
        super.onDestroy()
    }

    companion object {
        const val ACTION_STOP = "com.mymap.app.STOP"
        const val ACTION_RELOAD = "com.mymap.app.RELOAD"
        private const val CHANNEL = "tracking"
        private const val MAX_ACCURACY_M = 60f
        private const val SYNC_EVERY = 20

        /** true mentre il servizio di tracking è vivo in questo processo (si azzera se Android lo uccide). */
        @Volatile var running = false

        fun start(ctx: Context) {
            ctx.startForegroundService(Intent(ctx, LocationService::class.java))
        }

        fun stop(ctx: Context) {
            ctx.startService(Intent(ctx, LocationService::class.java).setAction(ACTION_STOP))
        }

        /** Riapplica frequenze e provider dopo una modifica dei parametri. */
        fun reload(ctx: Context) {
            if (running) ctx.startService(Intent(ctx, LocationService::class.java).setAction(ACTION_RELOAD))
        }
    }
}
