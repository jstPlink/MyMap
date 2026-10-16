package com.mymap.app

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.location.Location
import android.location.LocationManager
import android.os.BatteryManager
import android.os.Build
import android.os.CancellationSignal
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.widget.Toast
import java.util.UUID

/** Posizione "adesso" e salvataggio come punto, condivisi dall'app (Tracker → Registra la posizione adesso) e dal tocco sul widget. */
object FixNow {

    /**
     * Chiede al telefono la posizione adesso (GPS e rete in parallelo): si ferma al primo fix con precisione entro 100 m,
     * altrimenti dopo 20 secondi usa il migliore ottenuto. `onDone(null)` se nessun provider risponde.
     */
    fun request(context: Context, onDone: (Location?) -> Unit) {
        val lm = context.getSystemService(LocationManager::class.java)
        val providers = listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER).filter { lm.isProviderEnabled(it) }
        if (providers.isEmpty() || Build.VERSION.SDK_INT < 30) { onDone(null); return }
        val handler = Handler(Looper.getMainLooper())
        val signals = mutableListOf<CancellationSignal>()
        var best: Location? = null
        var finished = false
        var pending = providers.size
        fun finish() {
            if (finished) return
            finished = true
            handler.removeCallbacksAndMessages(null)
            signals.forEach { it.cancel() }
            onDone(best)
        }
        handler.postDelayed({ finish() }, 20_000)
        for (p in providers) {
            val cs = CancellationSignal().also { signals += it }
            @Suppress("MissingPermission")
            lm.getCurrentLocation(p, cs, context.mainExecutor) { loc ->
                handler.post {
                    pending--
                    val b = best
                    if (loc != null && (b == null || (loc.hasAccuracy() && loc.accuracy < b.accuracy))) best = loc
                    val now = best
                    if (pending <= 0 || (now != null && now.hasAccuracy() && now.accuracy <= 100f)) finish()
                }
            }
        }
    }

    /** Registra la posizione come punto (nel buffer, poi sincronizzato) e aggiorna i widget. */
    fun save(context: Context, loc: Location) {
        val bm = context.getSystemService(BatteryManager::class.java)
        PointStore(context).insert(
            TrackPoint(
                clientId = UUID.randomUUID().toString(), ts = loc.time, lat = loc.latitude, lon = loc.longitude,
                accuracy = if (loc.hasAccuracy()) loc.accuracy else null, speed = if (loc.hasSpeed()) loc.speed else null,
                bearing = if (loc.hasBearing()) loc.bearing else null, altitude = if (loc.hasAltitude()) loc.altitude else null,
                provider = loc.provider ?: "gps", battery = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY),
            )
        )
        SyncWorker.enqueue(context)
        LastPointWidget.update(context)
        TodayWidget.update(context)
    }
}

/**
 * Tocco sul blocco tracker del widget: cerca la posizione adesso e la salva come punto, senza aprire l'app. Servizio breve in primo piano: dura quanto la ricerca, al massimo 20 secondi. Serve il permesso di posizione (da background, "Consenti sempre").
 */
class FixNowService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    /** Dal widget Android permette solo un servizio in primo piano (si parte entro 5 secondi dalla chiamata): notifica a bassa priorità, sparisce a fine ricerca. */
    private fun startInForeground() {
        getSystemService(NotificationManager::class.java)
            .createNotificationChannel(NotificationChannel("fixnow", "Posizione adesso", NotificationManager.IMPORTANCE_LOW))
        val n = Notification.Builder(this, "fixnow")
            .setContentTitle("MyMap cerca la posizione")
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentIntent(PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE))
            .build()
        if (Build.VERSION.SDK_INT >= 29) startForeground(2, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION) else startForeground(2, n)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startInForeground()
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            Toast.makeText(this, "Manca il permesso di posizione", Toast.LENGTH_SHORT).show()
            stopSelf(startId)
            return START_NOT_STICKY
        }
        Toast.makeText(this, "Cerco la posizione…", Toast.LENGTH_SHORT).show()
        FixNow.request(this) { loc ->
            if (loc == null) {
                Toast.makeText(this, "Nessuna posizione: controlla che sia attiva", Toast.LENGTH_LONG).show()
            } else {
                try {
                    FixNow.save(this, loc)
                    val acc = if (loc.hasAccuracy()) " (±${Math.round(loc.accuracy)} m)" else ""
                    Toast.makeText(this, "Punto salvato$acc", Toast.LENGTH_SHORT).show()
                } catch (_: Exception) {
                    Toast.makeText(this, "Punto non salvato", Toast.LENGTH_SHORT).show()
                }
            }
            stopSelf(startId)
        }
        return START_NOT_STICKY
    }
}
