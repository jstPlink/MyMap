package com.mymap.app

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.widget.RemoteViews

/**
 * Widget verticale 1x2, solo scuro: in alto il blocco tracker (come quello del widget 2x1: icona onde/passi, tempo "m:ss" dall'ultimo
 * punto, giallo oltre 6 minuti; il tocco salva subito un punto), sotto i km fatti oggi e negli ultimi 7 giorni (il tocco apre la vista
 * Percorsi con il filtro su oggi o su 7 giorni). Si aggiorna insieme agli altri widget ([TodayWidget.update], [TodayWidget.updateTracker]).
 */
class PointKmWidget : AppWidgetProvider() {

    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        render(context, manager, ids)
    }

    companion object {
        fun update(context: Context) {
            val m = AppWidgetManager.getInstance(context)
            val ids = m.getAppWidgetIds(ComponentName(context, PointKmWidget::class.java))
            if (ids.isNotEmpty()) render(context, m, ids)
        }

        /** Solo il blocco tracker (ogni 20 secondi a schermo acceso), senza ricalcolare i km. */
        fun updateTracker(context: Context, manager: AppWidgetManager, fix: PointStore.LastFix?) {
            val ids = manager.getAppWidgetIds(ComponentName(context, PointKmWidget::class.java))
            if (ids.isEmpty()) return
            val views = RemoteViews(context.packageName, R.layout.widget_point_km)
            TodayWidget.applyTracker(context, views, fix, true)
            manager.partiallyUpdateAppWidget(ids, views)
        }

        private fun render(context: Context, manager: AppWidgetManager, ids: IntArray) {
            val store = try { PointStore(context) } catch (_: Exception) { null }
            val day = try { store?.dayStats(TodayWidget.startOfDay(0)) } catch (_: Exception) { null }
            val week = try { store?.dayStats(TodayWidget.startOfDay(6)) } catch (_: Exception) { null } // oggi e i 6 giorni precedenti
            val fix = try { store?.lastFix() } catch (_: Exception) { null }
            val views = RemoteViews(context.packageName, R.layout.widget_point_km)
            val muted = TodayWidget.MUTED_DARK
            views.setTextViewText(R.id.w_km, if (day == null) "—" else TodayWidget.withUnit(TodayWidget.km(day.km), " km", muted))
            views.setTextViewText(R.id.w_km_week, if (week == null) "—" else TodayWidget.withUnit(TodayWidget.km(week.km), " km", muted))
            TodayWidget.applyTracker(context, views, fix, true)
            views.setOnClickPendingIntent(R.id.w_root, TodayWidget.openApp(context, null, null))
            views.setOnClickPendingIntent(R.id.w_panel, TodayWidget.openApp(context, null, null))
            views.setOnClickPendingIntent(R.id.w_day_box, TodayWidget.openApp(context, "routes", null))
            views.setOnClickPendingIntent(R.id.w_week_box, TodayWidget.openApp(context, "routes", "7"))
            views.setOnClickPendingIntent(R.id.w_col_pos, TodayWidget.fixPending(context))
            manager.updateAppWidget(ids, views)
        }
    }
}
