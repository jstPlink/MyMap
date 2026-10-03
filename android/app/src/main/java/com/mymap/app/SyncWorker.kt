package com.mymap.app

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.TimeUnit

/** Svuota il buffer verso il server. WorkManager la rilancia da solo quando torna la rete. */
class SyncWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {

    override suspend fun doWork(): Result {
        val prefs = Prefs(applicationContext)
        if (prefs.mode != "server" || prefs.serverUrl.isEmpty()) return Result.success() // in modalità locale non c'è nulla da sincronizzare
        val store = PointStore(applicationContext)
        val api = Api(prefs)
        return try {
            // Filtro prima dell'invio: dai punti ancora da inviare si tolgono quelli inutili (fix troppo imprecisi, picchi, punti ripetuti
            // da fermo) e non si mandano al server. Stesse regole della pulizia manuale (Tracker → Pulizia dei punti).
            try { store.cleanup(true, true) } catch (_: Exception) {}
            while (true) {
                val batch = store.pending(200)
                if (batch.isEmpty()) break
                val done = api.sendBatch(batch)
                if (done.isEmpty()) return Result.retry()
                store.markSynced(done)
            }
            if (!prefs.historyPulled) {
                var page = 1
                while (true) {
                    val (items, pages) = api.fetchPage(page)
                    store.insertSynced(items)
                    if (page >= pages) break
                    page++
                }
                prefs.historyPulled = true
            }
            prefs.lastSync = SimpleDateFormat("dd/MM HH:mm:ss", Locale.ITALY).format(Date())
            Result.success()
        } catch (e: Exception) {
            Result.retry()
        }
    }

    companion object {
        fun enqueue(ctx: Context) {
            val req = OneTimeWorkRequestBuilder<SyncWorker>()
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build()
            WorkManager.getInstance(ctx).enqueueUniqueWork("sync", ExistingWorkPolicy.REPLACE, req)
        }
    }
}
