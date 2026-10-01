package com.mymap.app

import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/** Client minimale per PocketBase: invio batch di punti e scarico dello storico, con login utente. Nessuna libreria esterna. */
class Api(private val prefs: Prefs) {

    private fun call(method: String, path: String, body: JSONObject?, auth: Boolean = true): Pair<Int, String> {
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

    fun health(): Boolean = try { call("GET", "/api/health", null, false).first == 200 } catch (e: Exception) { false }

    /** Messaggio leggibile da una risposta d'errore di PocketBase ("campo: messaggio"). */
    private fun errorText(code: Int, text: String): String = try {
        val j = JSONObject(text)
        val data = j.optJSONObject("data")
        val detail = data?.keys()?.asSequence()?.mapNotNull { k -> data.optJSONObject(k)?.optString("message")?.let { "$k: $it" } }?.joinToString("; ")
        if (!detail.isNullOrEmpty()) detail else j.optString("message", "errore $code")
    } catch (e: Exception) { "errore $code" }

    /** Login con email e password già nelle preferenze. Ritorna null se ok, altrimenti il motivo. */
    fun loginMessage(): String? {
        val (code, text) = call(
            "POST", "/api/collections/users/auth-with-password",
            JSONObject().put("identity", prefs.email).put("password", prefs.password), false,
        )
        if (code != 200) return if (code == 400) "Email o password non corrette" else errorText(code, text)
        val j = JSONObject(text)
        prefs.token = j.getString("token")
        prefs.userId = j.getJSONObject("record").getString("id")
        return null
    }

    fun login(): Boolean = loginMessage() == null

    /** Rinnova il token (accesso con Google, senza password). */
    private fun refresh(): Boolean {
        val (code, text) = call("POST", "/api/collections/users/auth-refresh", null)
        if (code != 200) return false
        val j = JSONObject(text)
        prefs.token = j.getString("token")
        return true
    }

    /** Token scaduto: con la password si rifà il login, con Google si rinnova il token. */
    private fun relogin(): Boolean = if (prefs.oauth) refresh() else login()

    /** Crea un nuovo account con email e password nelle preferenze (le stesse che userà l'app per il login). */
    fun register(): String? {
        val (code, text) = call(
            "POST", "/api/collections/users/records",
            JSONObject().put("email", prefs.email).put("password", prefs.password).put("passwordConfirm", prefs.password), false,
        )
        return if (code in 200..299) null else errorText(code, text)
    }

    /**
     * Impostazioni salvate nel profilo (campo JSON `settings` della collection users).
     * Ritorna (supportato, json): `supportato` è false se il server non ha ancora il campo.
     */
    fun fetchSettings(): Pair<Boolean, String?> {
        if (prefs.token.isEmpty() && !relogin()) error("accesso scaduto")
        val path = "/api/collections/users/records/${prefs.userId}"
        var (code, text) = call("GET", path, null)
        if ((code == 401 || code == 404) && relogin()) call("GET", path, null).also { code = it.first; text = it.second }
        if (code !in 200..299) error(errorText(code, text))
        val j = JSONObject(text)
        if (!j.has("settings")) return false to null
        val s = j.opt("settings")
        return true to (if (s == null || s == JSONObject.NULL || s.toString().isEmpty()) null else s.toString())
    }

    /** Salva le impostazioni nel profilo. Ritorna null se ok, altrimenti il motivo. */
    fun saveSettings(json: String): String? {
        if (prefs.token.isEmpty() && !relogin()) return "accesso scaduto"
        val path = "/api/collections/users/records/${prefs.userId}"
        val body = JSONObject().put("settings", JSONObject(json))
        var (code, text) = call("PATCH", path, body, true)
        if ((code == 401 || code == 404) && relogin()) call("PATCH", path, body, true).also { code = it.first; text = it.second }
        return if (code in 200..299) null else errorText(code, text)
    }

    /**
     * Cambia la password dell'utente collegato (serve quella attuale). PocketBase invalida i token precedenti,
     * quindi si memorizza la nuova password e si rifà il login. Ritorna null se ok, altrimenti il motivo.
     */
    fun changePassword(old: String, new: String): String? {
        if (prefs.token.isEmpty() && !relogin()) return "Accesso scaduto: esci e accedi di nuovo"
        val body = JSONObject().put("oldPassword", old).put("password", new).put("passwordConfirm", new)
        var (code, text) = call("PATCH", "/api/collections/users/records/${prefs.userId}", body, true)
        if ((code == 401 || code == 404) && relogin()) call("PATCH", "/api/collections/users/records/${prefs.userId}", body, true).also { code = it.first; text = it.second }
        if (code !in 200..299) return if (code == 400 && text.contains("oldPassword")) "La password attuale non è corretta" else errorText(code, text)
        prefs.password = new
        return loginMessage()
    }

    /**
     * "Password dimenticata": chiede a PocketBase di mandare all'email il link per sceglierne una nuova.
     * Serve un server di posta (SMTP) configurato in PocketBase. Ritorna null se la richiesta è partita, altrimenti il motivo.
     */
    fun requestPasswordReset(email: String): String? {
        val (code, text) = call("POST", "/api/collections/users/request-password-reset", JSONObject().put("email", email), false)
        if (code in 200..299) return null
        return if (code == 400) "Il server non riesce a inviare email: controlla le impostazioni di posta (SMTP) in PocketBase" else errorText(code, text)
    }

    @Volatile private var sse: HttpURLConnection? = null
    fun cancelOAuth() { sse?.disconnect() }

    /**
     * Accesso con Google tramite PocketBase (serve il provider Google attivo nel server):
     * si ascolta il canale realtime "@oauth2", si apre il browser sulla pagina di Google e, quando PocketBase riceve il
     * codice dal reindirizzamento, lo si scambia con il token. `openUrl` apre il browser. Ritorna null se ok, altrimenti il motivo.
     */
    fun googleLogin(openUrl: (String) -> Unit): String? {
        val (c, t) = call("GET", "/api/collections/users/auth-methods", null, false)
        if (c != 200) return "Server non raggiungibile"
        val m = JSONObject(t)
        val list = m.optJSONObject("oauth2")?.optJSONArray("providers") ?: m.optJSONArray("authProviders")
        var prov: JSONObject? = null
        for (i in 0 until (list?.length() ?: 0)) if (list!!.getJSONObject(i).optString("name") == "google") prov = list.getJSONObject(i)
        if (prov == null) return "Google non è attivo su questo server (si abilita da PocketBase: collection users, opzioni OAuth2)"
        val redirect = prefs.serverUrl + "/api/oauth2-redirect"
        val base = prov.optString("authURL", prov.optString("authUrl"))
        val url = base + URLEncoder.encode(redirect, "UTF-8")

        val conn = URL(prefs.serverUrl + "/api/realtime").openConnection() as HttpURLConnection
        conn.connectTimeout = 15000
        conn.readTimeout = 180000 // tempo massimo per completare l'accesso nel browser
        sse = conn
        try {
            val reader = conn.inputStream.bufferedReader()
            var event = ""
            var data = ""
            var clientId = ""
            var code = ""
            while (true) {
                val line = reader.readLine() ?: return "Connessione chiusa dal server"
                when {
                    line.startsWith("event:") -> event = line.substring(6).trim()
                    line.startsWith("data:") -> data = line.substring(5).trim()
                    line.isEmpty() && event.isNotEmpty() -> {
                        if (event == "PB_CONNECT" && clientId.isEmpty()) {
                            clientId = JSONObject(data).getString("clientId")
                            val (sc, _) = call("POST", "/api/realtime", JSONObject().put("clientId", clientId).put("subscriptions", org.json.JSONArray().put("@oauth2")), false)
                            if (sc !in 200..299) return "Impossibile avviare l'accesso con Google"
                            openUrl(url)
                        } else if (event == "@oauth2") {
                            val d = JSONObject(data)
                            if (d.optString("state") != prov.optString("state")) return "Risposta di accesso non valida"
                            if (d.optString("error").isNotEmpty()) return "Accesso rifiutato: ${d.optString("error")}"
                            code = d.optString("code")
                            break
                        }
                        event = ""; data = ""
                    }
                }
            }
            val (ac, at) = call(
                "POST", "/api/collections/users/auth-with-oauth2",
                JSONObject().put("provider", "google").put("code", code).put("codeVerifier", prov.optString("codeVerifier")).put("redirectUrl", redirect), false,
            )
            if (ac != 200) return errorText(ac, at)
            val j = JSONObject(at)
            prefs.token = j.getString("token")
            prefs.userId = j.getJSONObject("record").getString("id")
            prefs.email = j.getJSONObject("record").optString("email")
            prefs.oauth = true
            return null
        } catch (e: java.net.SocketTimeoutException) {
            return "Tempo scaduto: accesso con Google non completato"
        } catch (e: java.io.IOException) {
            return "Accesso annullato"
        } finally {
            conn.disconnect(); sse = null
        }
    }

    /** Ritorna gli id locali dei punti confermati dal server (inclusi i duplicati già presenti). */
    fun sendBatch(points: List<TrackPoint>): List<Long> {
        if (prefs.token.isEmpty() && !relogin()) error("login fallito")
        var ok = trySend(points)
        if (ok == null && relogin()) ok = trySend(points) // token scaduto
        return ok ?: error("invio fallito")
    }

    /** Una pagina dello storico dal server (ordinato per tempo). Ritorna i punti e il numero di pagine totali. */
    fun fetchPage(page: Int): Pair<List<TrackPoint>, Int> {
        if (prefs.token.isEmpty() && !relogin()) error("login fallito")
        val path = "/api/collections/points/records?perPage=500&page=$page&sort=ts" +
            "&fields=client_id,ts,lat,lon,accuracy,speed,bearing,altitude,provider,battery"
        var (code, text) = call("GET", path, null)
        if ((code == 401 || code == 403) && relogin()) { val r = call("GET", path, null); code = r.first; text = r.second }
        if (code != 200) error("scarico fallito: $code")
        val j = JSONObject(text)
        val items = j.getJSONArray("items")
        fun JSONObject.f(k: String): Float? = if (isNull(k)) null else getDouble(k).toFloat()
        val out = (0 until items.length()).map { i ->
            val o = items.getJSONObject(i)
            TrackPoint(
                0, o.getString("client_id"), o.getLong("ts"), o.getDouble("lat"), o.getDouble("lon"),
                o.f("accuracy"), o.f("speed"), o.f("bearing"),
                if (o.isNull("altitude")) null else o.getDouble("altitude"),
                o.optString("provider", ""), o.optInt("battery", 0),
            )
        }
        return out to j.getInt("totalPages")
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
        val (code, _) = call("POST", "/api/batch", JSONObject().put("requests", requests))
        if (code == 401 || code == 403) return null
        if (code == 200) return points.map { it.id }
        // il batch è transazionale: un duplicato lo fa fallire, quindi reinvio punto per punto
        return points.filter { sendOne(it) }.map { it.id }
    }

    private fun sendOne(p: TrackPoint): Boolean {
        val (code, text) = call("POST", "/api/collections/points/records", body(p))
        // 400 su client_id = già presente sul server, conta come sincronizzato
        return code in 200..299 || (code == 400 && text.contains("client_id"))
    }
}
