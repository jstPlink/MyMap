package com.mymap.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Riavvia il tracking dopo un reboot se era attivo. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED && Prefs(context).tracking) {
            try {
                LocationService.start(context)
            } catch (_: Exception) {
                // Android 12+ può negare l'avvio di un foreground service da boot: l'utente riapre l'app
            }
        }
    }
}
