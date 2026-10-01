package com.mymap.app

import java.io.OutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/** Esporta tutti i punti del buffer locale in CSV, GPX o JSON, scrivendoli in streaming (senza tenerli tutti in memoria). */
object Exporter {

    private fun iso(ts: Long): String =
        SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }.format(Date(ts))

    /** Ritorna il numero di punti scritti. */
    fun write(store: PointStore, format: String, out: OutputStream): Int {
        val w = out.bufferedWriter()
        var n = 0
        when (format) {
            "gpx" -> {
                w.write("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<gpx version=\"1.1\" creator=\"MyMap\" xmlns=\"http://www.topografix.com/GPX/1/1\">\n<trk><name>MyMap</name>\n")
                var last = 0L
                var open = false
                store.forEachPoint { p ->
                    // un nuovo segmento ogni volta che c'è un buco di più di 30 minuti
                    if (!open || p.ts - last > 30 * 60000) {
                        if (open) w.write("</trkseg>\n")
                        w.write("<trkseg>\n"); open = true
                    }
                    w.write("<trkpt lat=\"${p.lat}\" lon=\"${p.lon}\">")
                    if (p.altitude != null) w.write("<ele>${p.altitude}</ele>")
                    w.write("<time>${iso(p.ts)}</time></trkpt>\n")
                    last = p.ts; n++
                }
                if (open) w.write("</trkseg>\n")
                w.write("</trk>\n</gpx>\n")
            }
            "json" -> {
                w.write("[")
                store.forEachPoint { p ->
                    if (n > 0) w.write(",\n")
                    w.write(
                        "{\"time\":\"${iso(p.ts)}\",\"ts\":${p.ts},\"lat\":${p.lat},\"lon\":${p.lon}," +
                            "\"accuracy\":${p.accuracy ?: "null"},\"speed\":${p.speed ?: "null"},\"bearing\":${p.bearing ?: "null"}," +
                            "\"altitude\":${p.altitude ?: "null"},\"provider\":\"${p.provider}\",\"battery\":${p.battery}}"
                    )
                    n++
                }
                w.write("]\n")
            }
            else -> {
                w.write("time_iso,ts_ms,lat,lon,accuracy_m,speed_ms,bearing,altitude_m,provider,battery\n")
                store.forEachPoint { p ->
                    w.write("${iso(p.ts)},${p.ts},${p.lat},${p.lon},${p.accuracy ?: ""},${p.speed ?: ""},${p.bearing ?: ""},${p.altitude ?: ""},${p.provider},${p.battery}\n")
                    n++
                }
            }
        }
        w.flush()
        return n
    }
}
