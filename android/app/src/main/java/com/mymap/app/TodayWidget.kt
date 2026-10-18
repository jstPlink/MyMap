package com.mymap.app

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Typeface
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.ForegroundColorSpan
import android.text.style.RelativeSizeSpan
import android.text.style.StyleSpan
import android.view.View
import android.widget.RemoteViews
import java.util.Calendar
import java.util.Locale

/**
 * Widget 4x1 della schermata home nello stile dell'app (versione chiara qui, scura in [TodayWidgetDark]). A sinistra un blocco con due
 * righe: "oggi" in alto (km, posti, tempo in movimento, valore grande e unità piccola) e "7g" in basso, in grigio; a destra il blocco
 * "tracker" con l'icona animata (onde se si è fermi, passi se in movimento, secondo il modo del tracker) e quanto tempo
 * fa, in minuti e secondi, è stato registrato l'ultimo punto (il blocco si aggiorna ogni 20 secondi dal servizio di tracking).
 * Il blocco tracker è neutro; solo se l'ultimo punto ha più di 6 minuti diventa giallo (avviso).
 * Ogni dato si tocca: i km aprono la vista Percorsi, i posti la vista Posti e il tempo in movimento la Heatmap, con il filtro su oggi
 * (riga in alto) o sugli ultimi 7 giorni (riga in basso); il resto apre l'app.
 * Si aggiorna a ogni punto salvato (al massimo una volta al minuto), ogni ~5 minuti dal servizio di tracking, dal controllo (~15 minuti)
 * e ogni 30 minuti.
 */
open class TodayWidget : AppWidgetProvider() {

    protected open val dark: Boolean get() = false

    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        render(context, manager, ids, dark)
    }

    companion object {
        /** Oltre questo tempo dall'ultimo punto il blocco tracker diventa giallo (avviso). */
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
            PointKmWidget.update(context)
        }

        private fun render(context: Context, manager: AppWidgetManager, ids: IntArray, dark: Boolean) {
            val store = try { PointStore(context) } catch (_: Exception) { null }
            val day = try { store?.dayStats(startOfDay(0)) } catch (_: Exception) { null }
            val week = try { store?.dayStats(startOfDay(6)) } catch (_: Exception) { null } // oggi e i 6 giorni precedenti
            val fix = try { store?.lastFix() } catch (_: Exception) { null }
            val views = RemoteViews(context.packageName, if (dark) R.layout.widget_today_dark else R.layout.widget_today)

            val muted = if (dark) MUTED_DARK else MUTED_LIGHT
            // riga in alto: valore in grande e unità più piccola e in grigio; riga in basso: 7 giorni, tutta in grigio
            views.setTextViewText(R.id.w_km, if (day == null) "—" else withUnit(km(day.km), " km", muted))
            views.setTextViewText(R.id.w_places, if (day == null) "—" else withUnit(places(day.places), if (day.places == 1) " posto" else " posti", muted))
            views.setTextViewText(R.id.w_time, if (day == null) "—" else duration(day.moveMs))
            views.setTextViewText(R.id.w_km_week, if (week == null) "—" else "7g · ${km(week.km)} km")
            views.setTextViewText(R.id.w_places_week, if (week == null) "—" else "${places(week.places)} ${if (week.places == 1) "posto" else "posti"}")
            views.setTextViewText(R.id.w_time_week, if (week == null) "—" else duration(week.moveMs))

            applyTracker(context, views, fix, dark)

            views.setOnClickPendingIntent(R.id.w_root, openApp(context, null, null))
            views.setOnClickPendingIntent(R.id.w_panel, openApp(context, null, null))
            // riga in alto = oggi, riga in basso = ultimi 7 giorni
            views.setOnClickPendingIntent(R.id.w_km, openApp(context, "routes", null))
            views.setOnClickPendingIntent(R.id.w_places, openApp(context, "places", null))
            views.setOnClickPendingIntent(R.id.w_time, openApp(context, "heat", null))
            views.setOnClickPendingIntent(R.id.w_km_week, openApp(context, "routes", "7"))
            views.setOnClickPendingIntent(R.id.w_places_week, openApp(context, "places", "7"))
            views.setOnClickPendingIntent(R.id.w_time_week, openApp(context, "heat", "7"))
            // il blocco tracker salva subito un punto (non apre l'app)
            views.setOnClickPendingIntent(R.id.w_col_pos, fixPending(context))
            manager.updateAppWidget(ids, views)
        }

        /**
         * Cella tracker: solo l'icona animata, colorata come lo stato (onde se fermo, passi se in movimento), e da quanto tempo è stato
         * registrato l'ultimo punto ("3:20", minuti e secondi). Se l'ultimo punto ha più di 6 minuti (o non ce ne sono) la cella
         * diventa ambra, con icona e testi in teal scuro.
         */
        internal fun applyTracker(context: Context, views: RemoteViews, fix: PointStore.LastFix?, dark: Boolean) {
            val age = if (fix == null) 0L else System.currentTimeMillis() - fix.ts
            val stale = fix != null && age > StaleAlert.STALE_MS
            val alert = fix == null || age > ALERT_MS
            val moving = fix != null && !stale && Prefs(context).fastMode // stesso modo del tracker (LocationService.adapt)
            // nessun colore se non ci sono avvisi: il blocco resta neutro; con l'avviso diventa giallo con testi scuri
            val onAlert = 0xFF1B1E24.toInt()
            val plain = if (dark) TEXT_DARK else TEXT_LIGHT
            val labelColor = if (dark) MUTED_DARK else MUTED_LIGHT
            val color = if (alert) onAlert else plain
            val calm = if (dark) R.drawable.widget_tracker_dark else R.drawable.widget_tracker_light
            views.setInt(R.id.w_col_pos, "setBackgroundResource", if (alert) R.drawable.widget_warn else calm)
            views.setTextColor(R.id.w_lbl_pos, if (alert) onAlert else labelColor)
            views.setTextViewText(R.id.w_ago, if (fix == null) "—" else clock(age))
            views.setTextColor(R.id.w_ago, color)
            views.setViewVisibility(R.id.w_flip_still, if (moving) View.GONE else View.VISIBLE)
            views.setViewVisibility(R.id.w_flip_steps, if (moving) View.VISIBLE else View.GONE)
            for (id in FRAMES) views.setInt(id, "setColorFilter", color)
        }

        /** Tocco sul blocco tracker (anche del widget 2x1): cerca la posizione adesso e la salva come punto. */
        fun fixPending(context: Context): PendingIntent =
            PendingIntent.getForegroundService(context, 20, Intent(context, FixNowService::class.java), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)

        /** Aggiorna soltanto la cella tracker (una query di due righe), così si può fare ogni 20 secondi senza ricalcolare i km. */
        fun updateTracker(context: Context) {
            val m = AppWidgetManager.getInstance(context)
            val fix = try { PointStore(context).lastFix() } catch (_: Exception) { return }
            for ((cls, isDark) in listOf(TodayWidget::class.java to false, TodayWidgetDark::class.java to true)) {
                val ids = m.getAppWidgetIds(ComponentName(context, cls))
                if (ids.isEmpty()) continue
                val views = RemoteViews(context.packageName, if (isDark) R.layout.widget_today_dark else R.layout.widget_today)
                applyTracker(context, views, fix, isDark)
                m.partiallyUpdateAppWidget(ids, views)
            }
            LastPointWidget.updateTracker(context, m, fix)
            PointKmWidget.updateTracker(context, m, fix)
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
        internal fun startOfDay(daysBack: Int): Long = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
            add(Calendar.DAY_OF_YEAR, -daysBack)
        }.timeInMillis

        internal fun km(v: Double): String = if (v < 10) String.format(Locale.ITALY, "%.1f", v) else Math.round(v).toString()

        private fun places(n: Int): String = n.toString()

        /** Valore con l'unità accanto, più piccola e in grigio (le parti con stile passano nei RemoteViews). */
        internal fun withUnit(value: String, unit: String, color: Int): CharSequence = SpannableStringBuilder(value).apply {
            val s = length
            append(unit)
            setSpan(RelativeSizeSpan(0.7f), s, length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            setSpan(ForegroundColorSpan(color), s, length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            setSpan(StyleSpan(Typeface.NORMAL), s, length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        }

        // colori dei temi dell'app (web/style.css)
        private val TEXT_DARK = 0xFFECECEC.toInt()
        internal val MUTED_DARK = 0xFF9B9B9B.toInt()
        private val TEXT_LIGHT = 0xFF2B3548.toInt()
        private val MUTED_LIGHT = 0xFF7B879B.toInt()

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
