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
        if (prefs.serverUrl.isEmpty()) return Result.success()
        val store = PointStore(applicationContext)
        val api = Api(prefs)
        return try {
            while (true) {
                val batch = store.pending(200)
                if (batch.isEmpty()) break
                val done = api.sendBatch(batch)
                if (done.isEmpty()) return Result.retry()
                store.markSynced(done)
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
