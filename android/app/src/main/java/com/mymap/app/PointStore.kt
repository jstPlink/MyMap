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
class PointStore(context: Context) : SQLiteOpenHelper(context, "points.db", null, 1) {

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
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {}

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

    @Synchronized
    fun markSynced(ids: List<Long>) {
        if (ids.isEmpty()) return
        writableDatabase.execSQL("UPDATE points SET synced=1 WHERE id IN (" + ids.joinToString(",") + ")")
    }

    /** (totale, da sincronizzare) */
    @Synchronized
    fun counts(): Pair<Int, Int> {
        readableDatabase.rawQuery("SELECT COUNT(*), COALESCE(SUM(synced=0),0) FROM points", null).use { c ->
            c.moveToFirst()
            return c.getInt(0) to c.getInt(1)
        }
    }
}
