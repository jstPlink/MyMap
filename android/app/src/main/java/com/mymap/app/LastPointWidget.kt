package com.mymap.app

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews

/**
 * Widget 2x1 "tracker": è il blocco tracker del widget lungo da solo (icona onde/passi, tempo dall'ultimo punto in m:ss, neutro; giallo se
 * l'ultimo punto ha più di 6 minuti). Il tocco salva subito un punto. Si aggiorna come il blocco del widget lungo (ogni 20 secondi a
 * schermo acceso, a ogni punto, ogni ~5 e ~15 minuti dal servizio e dal controllo).
 */
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
            val fix = try { PointStore(context).lastFix() } catch (_: Exception) { null }
            manager.updateAppWidget(ids, build(context, fix))
        }

        /** Solo il blocco (aggiornamento frequente, senza rifare il resto): usato da TodayWidget.updateTracker. */
        fun updateTracker(context: Context, manager: AppWidgetManager, fix: PointStore.LastFix?) {
            val ids = manager.getAppWidgetIds(ComponentName(context, LastPointWidget::class.java))
            if (ids.isEmpty()) return
            val views = RemoteViews(context.packageName, R.layout.widget_last_point)
            TodayWidget.applyTracker(context, views, fix, true)
            manager.partiallyUpdateAppWidget(ids, views)
        }

        private fun build(context: Context, fix: PointStore.LastFix?): RemoteViews {
            val views = RemoteViews(context.packageName, R.layout.widget_last_point)
            TodayWidget.applyTracker(context, views, fix, true)
            val tap = TodayWidget.fixPending(context)
            views.setOnClickPendingIntent(R.id.w_root, tap)
            views.setOnClickPendingIntent(R.id.w_col_pos, tap)
            return views
        }
    }
}
