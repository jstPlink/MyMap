package com.mymap.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager

/**
 * Avviso sonoro "nessun punto da più di 20 minuti": se il tracking dovrebbe essere attivo ma l'ultimo punto registrato dal telefono
 * è più vecchio di 20 minuti, parte una notifica con suono e vibrazione. Avvisa una sola volta per ogni buco (si riarma da solo
 * quando arriva un nuovo punto) e sparisce quando il tracking riprende. Con il tracking fermato dall'utente non avvisa.
 * Il controllo gira ogni ~5 minuti dal servizio di tracking e ogni ~15 minuti dal cane da guardia.
 */
object StaleAlert {
    const val STALE_MS = 20 * 60_000L
    private const val CHANNEL = "stale"
    private const val ID = 3

    fun check(context: Context) {
        val prefs = Prefs(context)
        val nm = context.getSystemService(NotificationManager::class.java)
        if (!prefs.tracking) { nm.cancel(ID); return }
        val last = try { PointStore(context).lastFix() } catch (_: Exception) { return } ?: return
        val age = System.currentTimeMillis() - last.ts
        if (age <= STALE_MS) {
            if (prefs.staleAlertFor != 0L) { prefs.staleAlertFor = 0L; nm.cancel(ID) } // il tracking è ripreso
            return
        }
        if (prefs.staleAlertFor == last.ts) return // già avvisato per questo buco
        prefs.staleAlertFor = last.ts

        // un canale con suono (i canali non si modificano dopo la creazione, per questo ha un identificativo suo)
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL, "Nessun punto da 20 minuti", NotificationManager.IMPORTANCE_HIGH).apply {
                setSound(
                    RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
                    AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build()
                )
                enableVibration(true)
            }
        )
        val open = PendingIntent.getActivity(context, 5, Intent(context, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        val n = Notification.Builder(context, CHANNEL)
            .setContentTitle("Nessun punto da ${age / 60_000} minuti")
            .setContentText("Il tracking potrebbe essere fermo. Ultima posizione: ${String.format(java.util.Locale.US, "%.4f, %.4f", last.lat, last.lon)}. Tocca per aprire l'app.")
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setContentIntent(open)
            .setAutoCancel(true)
            .build()
        nm.notify(ID, n)
    }
}
