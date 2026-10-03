package com.mymap.app

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

data class TrackPoint(
    val id: Long = 0,
    val clientId: String,
    val ts: Long,
    val lat: Double,
    val lon: Double,
    val accuracy: Float?,
    val speed: Float?,
    val bearing: Float?,
    val altitude: Double?,
    val provider: String,
    val battery: Int,
)

/** Buffer locale dei punti: sopravvive a assenza di rete e riavvii, si svuota solo dopo sync riuscita. */
class PointStore(context: Context) : SQLiteOpenHelper(context, "points.db", null, 2) {

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            "CREATE TABLE points(" +
                "id INTEGER PRIMARY KEY AUTOINCREMENT," +
                "client_id TEXT NOT NULL UNIQUE," +
                "ts INTEGER NOT NULL, lat REAL NOT NULL, lon REAL NOT NULL," +
                "accuracy REAL, speed REAL, bearing REAL, altitude REAL," +
                "provider TEXT, battery INTEGER, synced INTEGER NOT NULL DEFAULT 0)"
        )
        db.execSQL("CREATE INDEX idx_synced ON points(synced, id)")
        db.execSQL(TOMBSTONES)
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        if (oldVersion < 2) db.execSQL(TOMBSTONES)
    }

    init { setWriteAheadLoggingEnabled(true) } // l'esportazione legge mentre il tracking continua a scrivere

    /** Scorre tutti i punti in ordine di tempo, senza tenerli in memoria (usato dall'esportazione). */
    fun forEachPoint(block: (TrackPoint) -> Unit) {
        readableDatabase.rawQuery("SELECT ts,lat,lon,accuracy,speed,bearing,altitude,provider,battery FROM points ORDER BY ts", null).use { c ->
            while (c.moveToNext()) {
                block(
                    TrackPoint(
                        0, "", c.getLong(0), c.getDouble(1), c.getDouble(2),
                        if (c.isNull(3)) null else c.getFloat(3), if (c.isNull(4)) null else c.getFloat(4),
                        if (c.isNull(5)) null else c.getFloat(5), if (c.isNull(6)) null else c.getDouble(6),
                        c.getString(7) ?: "", c.getInt(8),
                    )
                )
            }
        }
    }

    /** Svuota il buffer: si fa uscendo da un account, così i punti di un utente non finiscono in quello di un altro. */
    @Synchronized
    fun clear() { writableDatabase.delete("points", null, null); writableDatabase.delete("deleted", null, null) }

    @Synchronized
    fun insert(p: TrackPoint) {
        val v = ContentValues().apply {
            put("client_id", p.clientId); put("ts", p.ts); put("lat", p.lat); put("lon", p.lon)
            put("accuracy", p.accuracy); put("speed", p.speed); put("bearing", p.bearing)
            put("altitude", p.altitude); put("provider", p.provider); put("battery", p.battery)
        }
        writableDatabase.insertWithOnConflict("points", null, v, SQLiteDatabase.CONFLICT_IGNORE)
    }

    @Synchronized
    fun pending(limit: Int): List<TrackPoint> {
        val out = ArrayList<TrackPoint>()
        readableDatabase.rawQuery(
            "SELECT id,client_id,ts,lat,lon,accuracy,speed,bearing,altitude,provider,battery " +
                "FROM points WHERE synced=0 ORDER BY id LIMIT ?",
            arrayOf(limit.toString())
        ).use { c ->
            while (c.moveToNext()) {
                out += TrackPoint(
                    c.getLong(0), c.getString(1), c.getLong(2), c.getDouble(3), c.getDouble(4),
                    if (c.isNull(5)) null else c.getFloat(5),
                    if (c.isNull(6)) null else c.getFloat(6),
                    if (c.isNull(7)) null else c.getFloat(7),
                    if (c.isNull(8)) null else c.getDouble(8),
                    c.getString(9) ?: "", c.getInt(10),
                )
            }
        }
        return out
    }

    /** Tutti i punti come colonne intere (ts in secondi, lat e lon x1e6, accuratezza in metri, 0 se ignota), little-endian, in base64: 16 byte/punto. */
    @Synchronized
    fun allPacked(): String {
        readableDatabase.rawQuery("SELECT ts,lat,lon,accuracy FROM points ORDER BY ts", null).use { c ->
            val buf = java.nio.ByteBuffer.allocate(c.count * 16).order(java.nio.ByteOrder.LITTLE_ENDIAN)
            while (c.moveToNext()) {
                buf.putInt((c.getLong(0) / 1000).toInt()).putInt((c.getDouble(1) * 1e6).toInt()).putInt((c.getDouble(2) * 1e6).toInt()).putInt(Math.round(c.getDouble(3)).toInt())
            }
            return android.util.Base64.encodeToString(buf.array(), android.util.Base64.NO_WRAP)
        }
    }

    /** Ultimi punti registrati (ordinati per tempo) per disegnare la mappa, come JSON per l'interfaccia web. */
    @Synchronized
    fun recentJson(limit: Int): String {
        val sb = StringBuilder("[")
        readableDatabase.rawQuery(
            "SELECT ts,lat,lon,battery FROM (SELECT ts,lat,lon,battery FROM points ORDER BY ts DESC LIMIT ?) ORDER BY ts",
            arrayOf(limit.toString())
        ).use { c ->
            while (c.moveToNext()) {
                if (sb.length > 1) sb.append(',')
                sb.append("{\"ts\":").append(c.getLong(0)).append(",\"lat\":").append(c.getDouble(1))
                    .append(",\"lon\":").append(c.getDouble(2)).append(",\"battery\":").append(c.getInt(3)).append('}')
            }
        }
        return sb.append(']').toString()
    }

    /** Punti scaricati dal server: già sincronizzati, quindi synced=1. Gli esistenti restano invariati. */
    @Synchronized
    fun insertSynced(points: List<TrackPoint>) {
        val db = writableDatabase
        db.beginTransaction()
        try {
            for (p in points) {
                if (isDeleted(db, p.clientId)) continue // tolto con la pulizia: il server può averlo ancora
                val v = ContentValues().apply {
                    put("client_id", p.clientId); put("ts", p.ts); put("lat", p.lat); put("lon", p.lon)
                    put("accuracy", p.accuracy); put("speed", p.speed); put("bearing", p.bearing)
                    put("altitude", p.altitude); put("provider", p.provider); put("battery", p.battery)
                    put("synced", 1)
                }
                db.insertWithOnConflict("points", null, v, SQLiteDatabase.CONFLICT_IGNORE)
            }
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }

    @Synchronized
    fun markSynced(ids: List<Long>) {
        if (ids.isEmpty()) return
        writableDatabase.execSQL("UPDATE points SET synced=1 WHERE id IN (" + ids.joinToString(",") + ")")
    }

    /** Ora (ms) dell'ultimo punto registrato dal tracking di questo telefono, escludendo importazioni e punti scaricati; 0 se nessuno. */
    @Synchronized
    fun lastOwnTs(): Long {
        readableDatabase.rawQuery("SELECT COALESCE(MAX(ts), 0) FROM points WHERE provider IN ('gps','network','fused','passive')", null).use { c ->
            c.moveToFirst()
            return c.getLong(0)
        }
    }

    data class LastFix(val ts: Long, val lat: Double, val lon: Double, val moving: Boolean)

    /**
     * Ultima posizione registrata dal tracking di questo telefono (non importazioni) e se in quel momento si era in movimento:
     * velocità misurata dal punto di almeno 1 m/s, oppure spostamento dal punto precedente (entro 15 minuti) a più di 0,8 m/s.
     * null se non c'è nessun punto.
     */
    @Synchronized
    fun lastFix(): LastFix? {
        readableDatabase.rawQuery(
            "SELECT ts,lat,lon,speed FROM points WHERE provider IN ('gps','network','fused','passive') ORDER BY ts DESC LIMIT 2", null
        ).use { c ->
            if (!c.moveToFirst()) return null
            val ts = c.getLong(0); val lat = c.getDouble(1); val lon = c.getDouble(2)
            var moving = !c.isNull(3) && c.getFloat(3) >= 1.0f
            if (!moving && c.moveToNext()) {
                val dt = ts - c.getLong(0)
                if (dt in 1..(15 * 60_000L)) moving = haversineKm(c.getDouble(1), c.getDouble(2), lat, lon) * 1000 / (dt / 1000.0) >= 0.8
            }
            return LastFix(ts, lat, lon, moving)
        }
    }

    /** (totale, da sincronizzare) */
    @Synchronized
    fun counts(): Pair<Int, Int> {
        readableDatabase.rawQuery("SELECT COUNT(*), COALESCE(SUM(synced=0),0) FROM points", null).use { c ->
            c.moveToFirst()
            return c.getInt(0) to c.getInt(1)
        }
    }

    private fun isDeleted(db: SQLiteDatabase, clientId: String): Boolean =
        db.rawQuery("SELECT 1 FROM deleted WHERE client_id=?", arrayOf(clientId)).use { it.moveToFirst() }

    /**
     * Pulizia dei punti inutili (stesse regole di `clean`/`despike` in geo.js, più la sosta): (1) accuratezza peggiore di 120 m,
     * (2) picchi: un punto a più di 300 m dal precedente e dal successivo mentre questi due sono vicini (meno del 40%, entro 15 min),
     * (3) sosta: punti a meno di 10 m dall'ultimo tenuto, a meno di 10 minuti da esso e seguiti da un punto ancora fermo; restano
     * il primo, l'ultimo e uno ogni 10 minuti, quindi durata di soste e notti non cambiano. Le soste importate (accuratezza -1) non si toccano.
     * Con `apply` falso conta soltanto. I punti già sincronizzati tolti finiscono in `deleted`, così lo scarico dello storico non li riporta.
     * Restituisce (totale, accuratezza, picchi, soste).
     */
    @Synchronized
    fun cleanup(apply: Boolean, onlyPending: Boolean = false): IntArray {
        val ids = ArrayList<Long>(); val ts = ArrayList<Long>(); val lat = ArrayList<Double>(); val lon = ArrayList<Double>()
        val acc = ArrayList<Double>(); val synced = ArrayList<Boolean>()
        // onlyPending (filtro alla sincronizzazione): si guardano i punti da inviare più un po' di contesto precedente (anche già inviato), ma si cancellano solo quelli non ancora inviati
        val since = if (onlyPending) pendingSince() else 0L
        if (since == Long.MAX_VALUE) return intArrayOf(0, 0, 0, 0)
        readableDatabase.rawQuery("SELECT id,ts,lat,lon,COALESCE(accuracy,0),synced FROM points WHERE ts >= ? ORDER BY ts,id", arrayOf(since.toString())).use { c ->
            while (c.moveToNext()) {
                ids += c.getLong(0); ts += c.getLong(1); lat += c.getDouble(2); lon += c.getDouble(3); acc += c.getDouble(4); synced += c.getInt(5) == 1
            }
        }
        val n = ids.size
        val reason = IntArray(n) // 0 tenuto, 1 accuratezza, 2 picco, 3 sosta
        fun dist(i: Int, j: Int): Double { // km
            val p = Math.PI / 180
            val a = Math.sin((lat[j] - lat[i]) * p / 2).let { it * it } +
                Math.cos(lat[i] * p) * Math.cos(lat[j] * p) * Math.sin((lon[j] - lon[i]) * p / 2).let { it * it }
            return 12742 * Math.asin(Math.sqrt(a))
        }
        for (i in 0 until n) if (acc[i] > 120) reason[i] = 1
        // picchi, sui punti rimasti
        val kept = (0 until n).filter { reason[it] == 0 }
        var prev = -1
        for (k in kept.indices) {
            val b = kept[k]
            val c = if (k + 1 < kept.size) kept[k + 1] else -1
            if (prev >= 0 && c >= 0 && acc[b] != -1.0 && ts[c] - ts[prev] < 15 * 60_000) {
                val d1 = dist(prev, b); val d2 = dist(b, c)
                if (d1 > 0.3 && d2 > 0.3 && dist(prev, c) < 0.4 * minOf(d1, d2)) { reason[b] = 2; continue }
            }
            prev = b
        }
        // soste, sui punti rimasti
        val rest = (0 until n).filter { reason[it] == 0 }
        var anchor = -1
        for (k in rest.indices) {
            val p = rest[k]
            if (acc[p] == -1.0) { anchor = -1; continue }
            if (anchor < 0) { anchor = p; continue }
            val next = if (k + 1 < rest.size) rest[k + 1] else -1
            if (next >= 0 && acc[next] != -1.0 && ts[p] - ts[anchor] < 10 * 60_000 && dist(anchor, p) < 0.01 && dist(anchor, next) < 0.01) reason[p] = 3
            else anchor = p
        }
        val counts = IntArray(4)
        for (r in reason) counts[r]++
        if (apply && n > counts[0]) {
            val db = writableDatabase
            db.beginTransaction()
            try {
                for (i in 0 until n) if (reason[i] != 0 && (!onlyPending || !synced[i])) {
                    if (synced[i]) db.execSQL("INSERT OR IGNORE INTO deleted(client_id) SELECT client_id FROM points WHERE id=?", arrayOf<Any>(ids[i]))
                    db.execSQL("DELETE FROM points WHERE id=?", arrayOf<Any>(ids[i]))
                }
                db.setTransactionSuccessful()
            } finally { db.endTransaction() }
            if (!onlyPending) db.execSQL("VACUUM")
        }
        return intArrayOf(n, counts[1], counts[2], counts[3])
    }

    /** Ora del primo punto non ancora inviato meno 3 ore (contesto per il filtro); Long.MAX_VALUE se non ce ne sono. */
    private fun pendingSince(): Long {
        readableDatabase.rawQuery("SELECT MIN(ts) FROM points WHERE synced=0", null).use { c ->
            c.moveToFirst()
            return if (c.isNull(0)) Long.MAX_VALUE else c.getLong(0) - 3 * 3_600_000L
        }
    }

    data class DayStats(val km: Double, val moveMs: Long, val places: Int)

    /**
     * Numeri di oggi per il widget, con le stesse regole dell'interfaccia: scarta i fix oltre 120 m e i salti impossibili; i km sono
     * i passi tra punti consecutivi entro 20 minuti (da 10 m a 30 km, al massimo 250 km/h), il tempo in movimento la loro durata;
     * un posto è una sosta di almeno 20 minuti entro 150 m dal primo punto (buchi fino a 3 ore), con le soste entro 150 m unite.
     */
    @Synchronized
    fun dayStats(since: Long): DayStats {
        val ts = ArrayList<Long>(); val lat = ArrayList<Double>(); val lon = ArrayList<Double>()
        readableDatabase.rawQuery("SELECT ts,lat,lon,COALESCE(accuracy,0) FROM points WHERE ts >= ? ORDER BY ts", arrayOf(since.toString())).use { c ->
            var bad = 0
            while (c.moveToNext()) {
                if (c.getDouble(3) > 120) continue
                val t = c.getLong(0); val la = c.getDouble(1); val lo = c.getDouble(2)
                if (ts.isNotEmpty()) {
                    val h = (t - ts.last()) / 3_600_000.0; val d = haversineKm(lat.last(), lon.last(), la, lo)
                    if (h > 0 && d > 0.3 && d / h > 180 && bad < 3) { bad++; continue } // salto impossibile: fix sbagliato
                }
                bad = 0; ts += t; lat += la; lon += lo
            }
        }
        var km = 0.0; var moveMs = 0L
        for (i in 1 until ts.size) {
            val dt = ts[i] - ts[i - 1]
            if (dt <= 0 || dt > 20 * 60_000) continue
            val d = haversineKm(lat[i - 1], lon[i - 1], lat[i], lon[i])
            if (d < 0.01 || d > 30 || d / (dt / 3_600_000.0) > 250) continue
            km += d; moveMs += dt
        }
        // posti: soste di almeno 20 minuti, unite entro 150 m
        val places = ArrayList<DoubleArray>()
        var i = 0
        while (i < ts.size) {
            var j = i + 1; var sl = lat[i]; var so = lon[i]
            while (j < ts.size && ts[j] - ts[j - 1] <= 3 * 3_600_000L && haversineKm(lat[i], lon[i], lat[j], lon[j]) < 0.15) { sl += lat[j]; so += lon[j]; j++ }
            if (ts[j - 1] - ts[i] >= 20 * 60_000) {
                val cl = sl / (j - i); val co = so / (j - i)
                if (places.none { haversineKm(it[0], it[1], cl, co) < 0.15 }) places += doubleArrayOf(cl, co)
            }
            i = j
        }
        return DayStats(km, moveMs, places.size)
    }

    private fun haversineKm(la1: Double, lo1: Double, la2: Double, lo2: Double): Double {
        val p = Math.PI / 180
        val a = Math.sin((la2 - la1) * p / 2).let { it * it } + Math.cos(la1 * p) * Math.cos(la2 * p) * Math.sin((lo2 - lo1) * p / 2).let { it * it }
        return 12742 * Math.asin(Math.sqrt(a))
    }

    private companion object {
        const val TOMBSTONES = "CREATE TABLE IF NOT EXISTS deleted(client_id TEXT PRIMARY KEY)"
    }
}
