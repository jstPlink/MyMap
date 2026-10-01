package com.mymap.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Riavvia il tracking, se era attivo, dopo un reboot e dopo un aggiornamento dell'app (che la chiude). */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val restart = intent.action == Intent.ACTION_BOOT_COMPLETED || intent.action == Intent.ACTION_MY_PACKAGE_REPLACED
        if (restart && Prefs(context).tracking) {
            try {
                LocationService.start(context)
            } catch (_: Exception) {
                // Android 12+ può negare l'avvio di un foreground service da background: ci pensa il cane da guardia
            }
            TrackerWatchdog.schedule(context)
        }
    }
}
