package com.mymap.app

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.view.View
import android.widget.RemoteViews
import java.util.Calendar
import java.util.Locale

/**
 * Widget 4x1 della schermata home, su una targhetta semitrasparente effetto plastificato (versione chiara qui, scura in
 * [TodayWidgetDark]). Due righe, "oggi" in alto e "7g" in basso, con la stessa dimensione: km percorsi, posti visitati e tempo in
 * movimento, con in mezzo il nome del dato; a destra la cella "tracker" con la sola icona animata (onde se si è fermi, passi se in movimento) e quanto tempo
 * fa, in minuti e secondi, è stato registrato l'ultimo punto (la cella si aggiorna ogni 20 secondi dal servizio di tracking).
 * Ogni dato si tocca: i km aprono la vista Percorsi, i posti la vista Posti e il tempo in movimento la Heatmap, con il filtro su oggi
 * (riga in alto) o sugli ultimi 7 giorni (riga in basso); la cella tracker apre le impostazioni dell'app (sezione Tracker); il resto apre l'app.
 * Si aggiorna a ogni punto salvato (al massimo una volta al minuto), ogni ~5 minuti dal servizio di tracking, dal controllo (~15 minuti)
 * e ogni 30 minuti.
 */
open class TodayWidget : AppWidgetProvider() {

    protected open val dark: Boolean get() = false

    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        render(context, manager, ids, dark)
    }

    companion object {
        /** Oltre questo tempo dall'ultimo punto la cella tracker diventa rossa. */
        private const val ALERT_MS = 6 * 60_000L

        /** Fotogrammi delle due icone animate (ViewFlipper): vanno colorati tutti insieme. */
        private val FRAMES = listOf(
            R.id.still_0, R.id.still_1, R.id.still_2, R.id.still_3,
            R.id.steps_0, R.id.steps_1, R.id.steps_2, R.id.steps_3,
        )

        /** Aggiorna tutte le istanze, chiare e scure. */
        fun update(context: Context) {
            val m = AppWidgetManager.getInstance(context)
            for ((cls, isDark) in listOf(TodayWidget::class.java to false, TodayWidgetDark::class.java to true)) {
                val ids = m.getAppWidgetIds(ComponentName(context, cls))
                if (ids.isNotEmpty()) render(context, m, ids, isDark)
            }
        }

        private fun render(context: Context, manager: AppWidgetManager, ids: IntArray, dark: Boolean) {
            val store = try { PointStore(context) } catch (_: Exception) { null }
            val day = try { store?.dayStats(startOfDay(0)) } catch (_: Exception) { null }
            val week = try { store?.dayStats(startOfDay(6)) } catch (_: Exception) { null } // oggi e i 6 giorni precedenti
            val fix = try { store?.lastFix() } catch (_: Exception) { null }
            val views = RemoteViews(context.packageName, if (dark) R.layout.widget_today_dark else R.layout.widget_today)

            views.setTextViewText(R.id.w_km, if (day == null) "—" else km(day.km))
            views.setTextViewText(R.id.w_places, if (day == null) "—" else places(day.places))
            views.setTextViewText(R.id.w_time, if (day == null) "—" else duration(day.moveMs))
            views.setTextViewText(R.id.w_km_week, if (week == null) "—" else km(week.km))
            views.setTextViewText(R.id.w_places_week, if (week == null) "—" else places(week.places))
            views.setTextViewText(R.id.w_time_week, if (week == null) "—" else duration(week.moveMs))

            applyTracker(views, fix, dark)

            views.setOnClickPendingIntent(R.id.w_root, openApp(context, null, null))
            for ((col, view) in listOf(R.id.w_col_km to "routes", R.id.w_col_places to "places", R.id.w_col_time to "heat")) {
                views.setOnClickPendingIntent(col, openApp(context, view, null))
            }
            // riga in alto = oggi, riga in basso = ultimi 7 giorni
            views.setOnClickPendingIntent(R.id.w_km, openApp(context, "routes", null))
            views.setOnClickPendingIntent(R.id.w_places, openApp(context, "places", null))
            views.setOnClickPendingIntent(R.id.w_time, openApp(context, "heat", null))
            views.setOnClickPendingIntent(R.id.w_km_week, openApp(context, "routes", "7"))
            views.setOnClickPendingIntent(R.id.w_places_week, openApp(context, "places", "7"))
            views.setOnClickPendingIntent(R.id.w_time_week, openApp(context, "heat", "7"))
            views.setOnClickPendingIntent(R.id.w_col_pos, openApp(context, "tracker", null))
            manager.updateAppWidget(ids, views)
        }

        /**
         * Cella tracker: solo l'icona animata, colorata come lo stato (onde se fermo, passi se in movimento), e da quanto tempo è stato
         * registrato l'ultimo punto ("3:20", minuti e secondi). Se l'ultimo punto ha più di 6 minuti (o non ce ne sono) la cella
         * diventa rossa, con icona e testi bianchi.
         */
        private fun applyTracker(views: RemoteViews, fix: PointStore.LastFix?, dark: Boolean) {
            val age = if (fix == null) 0L else System.currentTimeMillis() - fix.ts
            val stale = fix != null && age > StaleAlert.STALE_MS
            val alert = fix == null || age > ALERT_MS
            val moving = fix != null && !stale && fix.moving
            val white = 0xFFFFFFFF.toInt()
            val green = if (dark) 0xFF7DDC9C.toInt() else 0xFF1B7F3B.toInt()
            val plain = if (dark) 0xFFFFFFFF.toInt() else 0xFF1B1B1B.toInt()
            val labelColor = if (dark) 0xD9A8A8A8.toInt() else 0xD9707070.toInt() // lo stesso grigio dei dati dei 7 giorni
            val color = if (alert) white else if (moving) green else plain
            views.setInt(R.id.w_col_pos, "setBackgroundResource", if (alert) R.drawable.widget_alert_red else 0)
            views.setTextColor(R.id.w_lbl_pos, if (alert) white else labelColor)
            views.setTextViewText(R.id.w_ago, if (fix == null) "—" else clock(age))
            views.setTextColor(R.id.w_ago, color)
            views.setViewVisibility(R.id.w_flip_still, if (moving) View.GONE else View.VISIBLE)
            views.setViewVisibility(R.id.w_flip_steps, if (moving) View.VISIBLE else View.GONE)
            for (id in FRAMES) views.setInt(id, "setColorFilter", color)
        }

        /** Aggiorna soltanto la cella tracker (una query di due righe), così si può fare ogni 20 secondi senza ricalcolare i km. */
        fun updateTracker(context: Context) {
            val m = AppWidgetManager.getInstance(context)
            val fix = try { PointStore(context).lastFix() } catch (_: Exception) { return }
            for ((cls, isDark) in listOf(TodayWidget::class.java to false, TodayWidgetDark::class.java to true)) {
                val ids = m.getAppWidgetIds(ComponentName(context, cls))
                if (ids.isEmpty()) continue
                val views = RemoteViews(context.packageName, if (isDark) R.layout.widget_today_dark else R.layout.widget_today)
                applyTracker(views, fix, isDark)
                m.partiallyUpdateAppWidget(ids, views)
            }
        }

        /** Tempo trascorso: "0:45", "3:20" (minuti e secondi); oltre un'ora "1h 05m". */
        private fun clock(ms: Long): String {
            val s = maxOf(0L, ms) / 1000
            return if (s < 3600) String.format("%d:%02d", s / 60, s % 60) else "${s / 3600}h ${String.format("%02d", s % 3600 / 60)}m"
        }

        /**
         * Tocco su un widget: apre l'app. Con `view` ("routes", "places", "heat") l'app si apre su quella vista con il filtro su oggi o,
         * con `range` = "7", sugli ultimi 7 giorni; con "tracker" apre le impostazioni sulla sezione Tracker (extra letti da MainActivity).
         * Ogni combinazione ha il suo codice di richiesta, altrimenti Android riuserebbe lo stesso intent.
         */
        fun openApp(context: Context, view: String?, range: String?): PendingIntent {
            val code = (when (view) { "routes" -> 2; "places" -> 3; "heat" -> 4; "here" -> 5; "tracker" -> 6; else -> 1 }) + (if (range == "7") 10 else 0)
            val intent = Intent(context, MainActivity::class.java).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            if (view != null) intent.putExtra(MainActivity.EXTRA_OPEN, view)
            if (range != null) intent.putExtra(MainActivity.EXTRA_RANGE, range)
            return PendingIntent.getActivity(context, code, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        }

        /** Mezzanotte di oggi, o di `daysBack` giorni fa. */
        private fun startOfDay(daysBack: Int): Long = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
            add(Calendar.DAY_OF_YEAR, -daysBack)
        }.timeInMillis

        private fun km(v: Double): String = if (v < 10) String.format(Locale.ITALY, "%.1f", v) else Math.round(v).toString()

        private fun places(n: Int): String = n.toString()

        private fun duration(ms: Long): String {
            val m = ms / 60_000
            return if (m < 60) "$m min" else "${m / 60}h ${String.format("%02d", m % 60)}m"
        }
    }
}

/** Versione scura del widget. */
class TodayWidgetDark : TodayWidget() {
    override val dark: Boolean get() = true
}
