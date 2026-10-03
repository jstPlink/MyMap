package com.mymap.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.Worker
import androidx.work.WorkerParameters
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

/**
 * Cane da guardia: ogni ~15 minuti controlla che il tracking, se dovrebbe essere attivo, stia girando. Se Android ha ucciso il
 * servizio prova a riavviarlo; se non può (da background Android 12+ lo vieta in alcuni casi) manda una notifica da toccare.
 */
class TrackerWatchdog(ctx: Context, params: WorkerParameters) : Worker(ctx, params) {

    override fun doWork(): Result {
        val prefs = Prefs(applicationContext)
        if (prefs.tracking && !LocationService.running) {
            try {
                LocationService.start(applicationContext)
            } catch (_: Exception) {
                alert()
            }
        }
        StaleAlert.check(applicationContext)
        LastPointWidget.update(applicationContext)
        TodayWidget.update(applicationContext)
        return Result.success()
    }

    private fun alert() {
        val nm = applicationContext.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(ALERT_CHANNEL, "Avvisi tracking", NotificationManager.IMPORTANCE_DEFAULT))
        val open = PendingIntent.getActivity(
            applicationContext, 0, Intent(applicationContext, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE
        )
        val n = Notification.Builder(applicationContext, ALERT_CHANNEL)
            .setContentTitle("Tracking fermo")
            .setContentText("Android ha fermato la registrazione dei percorsi. Tocca per riavviarla.")
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setContentIntent(open)
            .setAutoCancel(true)
            .build()
        nm.notify(ALERT_ID, n)
    }

    companion object {
        const val ALERT_ID = 2
        private const val ALERT_CHANNEL = "alerts"
        private const val NAME = "watchdog"

        fun schedule(ctx: Context) {
            WorkManager.getInstance(ctx).enqueueUniquePeriodicWork(
                NAME, ExistingPeriodicWorkPolicy.KEEP, PeriodicWorkRequestBuilder<TrackerWatchdog>(15, TimeUnit.MINUTES).build()
            )
        }

        fun cancel(ctx: Context) {
            WorkManager.getInstance(ctx).cancelUniqueWork(NAME)
        }
    }
}
