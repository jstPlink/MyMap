package com.mymap.app

import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/** Client minimale per PocketBase: login e invio batch di punti. Nessuna libreria esterna. */
class Api(private val prefs: Prefs) {

    private fun call(method: String, path: String, body: JSONObject?, auth: Boolean): Pair<Int, String> {
        val conn = URL(prefs.serverUrl + path).openConnection() as HttpURLConnection
        conn.requestMethod = method
        conn.connectTimeout = 15000
        conn.readTimeout = 30000
        conn.setRequestProperty("Content-Type", "application/json")
        if (auth && prefs.token.isNotEmpty()) conn.setRequestProperty("Authorization", prefs.token)
        if (body != null) {
            conn.doOutput = true
            conn.outputStream.use { it.write(body.toString().toByteArray()) }
        }
        val code = conn.responseCode
        val text = (if (code < 400) conn.inputStream else conn.errorStream)?.bufferedReader()?.readText() ?: ""
        conn.disconnect()
        return code to text
    }

    fun login(): Boolean {
        val (code, text) = call(
            "POST", "/api/collections/users/auth-with-password",
            JSONObject().put("identity", prefs.email).put("password", prefs.password), false,
        )
        if (code != 200) return false
        val j = JSONObject(text)
        prefs.token = j.getString("token")
        prefs.userId = j.getJSONObject("record").getString("id")
        return true
    }

    /** Ritorna gli id locali dei punti confermati dal server (inclusi i duplicati già presenti). */
    fun sendBatch(points: List<TrackPoint>): List<Long> {
        if (prefs.token.isEmpty() && !login()) error("login fallito")
        var ok = trySend(points)
        if (ok == null && login()) ok = trySend(points) // token scaduto
        return ok ?: error("invio fallito")
    }

    private fun body(p: TrackPoint) = JSONObject()
        .put("user", prefs.userId).put("client_id", p.clientId).put("ts", p.ts)
        .put("lat", p.lat).put("lon", p.lon)
        .put("accuracy", p.accuracy ?: JSONObject.NULL).put("speed", p.speed ?: JSONObject.NULL)
        .put("bearing", p.bearing ?: JSONObject.NULL).put("altitude", p.altitude ?: JSONObject.NULL)
        .put("provider", p.provider).put("battery", p.battery).put("device_id", prefs.deviceId)

    private fun trySend(points: List<TrackPoint>): List<Long>? {
        val requests = JSONArray()
        for (p in points) {
            requests.put(
                JSONObject().put("method", "POST").put("url", "/api/collections/points/records")
                    .put("body", body(p))
            )
        }
        val (code, _) = call("POST", "/api/batch", JSONObject().put("requests", requests), true)
        if (code == 401 || code == 403) return null
        if (code == 200) return points.map { it.id }
        // il batch è transazionale: un duplicato lo fa fallire, quindi reinvio punto per punto
        return points.filter { sendOne(it) }.map { it.id }
    }

    private fun sendOne(p: TrackPoint): Boolean {
        val (code, text) = call("POST", "/api/collections/points/records", body(p), true)
        // 400 su client_id = già presente sul server, conta come sincronizzato
        return code in 200..299 || (code == 400 && text.contains("client_id"))
    }
}
