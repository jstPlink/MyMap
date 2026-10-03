package com.mymap.app

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews

/** Widget della schermata home: da quanto tempo è stato salvato l'ultimo punto. Si aggiorna a ogni punto (al massimo una volta al minuto) e ogni ~15 minuti dal cane da guardia; al tocco apre l'app. */
class LastPointWidget : AppWidgetProvider() {

    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        render(context, manager, ids)
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == ACTION_REFRESH) update(context)
    }

    companion object {
        private const val ACTION_REFRESH = "com.mymap.app.REFRESH_WIDGET"

        fun update(context: Context) {
            val m = AppWidgetManager.getInstance(context)
            val ids = m.getAppWidgetIds(ComponentName(context, LastPointWidget::class.java))
            if (ids.isNotEmpty()) render(context, m, ids)
        }

        private fun render(context: Context, manager: AppWidgetManager, ids: IntArray) {
            val ts = try { PointStore(context).lastOwnTs() } catch (_: Exception) { 0L }
            val age = System.currentTimeMillis() - ts
            val views = RemoteViews(context.packageName, R.layout.widget_last_point)
            views.setTextViewText(R.id.w_value, if (ts == 0L) "—" else ago(age))
            views.setTextViewText(R.id.w_label, if (ts == 0L) "nessun punto salvato" else "dall'ultimo punto")
            views.setTextColor(R.id.w_value, if (ts != 0L && age > STALE_MS) 0xFFD32F2F.toInt() else 0xFF212121.toInt())
            views.setOnClickPendingIntent(R.id.w_root, TodayWidget.openApp(context, null, null)) // il tocco apre l'app
            manager.updateAppWidget(ids, views)
        }

        // oltre mezz'ora senza punti il valore diventa rosso (da fermo il telefono ne salva uno ogni 10 minuti)
        private const val STALE_MS = 30 * 60_000L

        fun ago(ms: Long): String {
            val s = maxOf(0L, ms) / 1000
            val m = s / 60
            val h = m / 60
            val d = h / 24
            return when {
                s < 60 -> "$s s fa"
                m < 60 -> "$m min fa"
                h < 24 -> "$h h ${m % 60} min fa"
                else -> "$d g ${h % 24} h fa"
            }
        }
    }
}
