package com.mymap.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.os.CancellationSignal
import android.os.Handler
import android.os.Looper
import android.view.HapticFeedbackConstants
import android.location.Location
import android.os.PowerManager
import android.provider.Settings
import android.view.WindowInsets
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.widget.FrameLayout
import android.widget.Toast
import org.json.JSONObject

/**
 * Contenitore dell'interfaccia web (cartella web/ del repository, inclusa negli asset).
 * Qui restano solo i permessi Android e il ponte verso il motore nativo: tracking, buffer e sync.
 */
class MainActivity : Activity() {

    private lateinit var prefs: Prefs
    private lateinit var store: PointStore
    private lateinit var web: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = Prefs(this)
        store = PointStore(this)
        SyncWorker.enqueue(this) // invia il buffer e, la prima volta, scarica lo storico dal server
        resumeTracking()

        web = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            addJavascriptInterface(Bridge(), "MyMapNative")
            loadUrl("file:///android_asset/index.html?sys=" + (if (systemNight()) 1 else 0))
        }
        // da Android 15 l'app disegna sotto barra di stato, notch e barra di navigazione: lasciamo lo spazio
        val root = FrameLayout(this).apply {
            addView(web)
            setOnApplyWindowInsetsListener { v, insets ->
                if (Build.VERSION.SDK_INT >= 30) {
                    val b = insets.getInsets(
                        WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout() or WindowInsets.Type.ime()
                    )
                    v.setPadding(b.left, b.top, b.right, b.bottom)
                    WindowInsets.CONSUMED
                } else {
                    v.setPadding(insets.systemWindowInsetLeft, insets.systemWindowInsetTop, insets.systemWindowInsetRight, insets.systemWindowInsetBottom)
                    insets.consumeSystemWindowInsets()
                }
            }
        }
        rootView = root
        applyBars()
        setContentView(root)
        root.requestApplyInsets()
    }

    private lateinit var rootView: FrameLayout

    override fun onResume() {
        super.onResume()
        resumeTracking()
    }

    /** Se il tracking doveva essere attivo ma il servizio non gira (aggiornamento, kill di Android), lo riavvia. */
    private fun resumeTracking() {
        if (!prefs.tracking) return
        TrackerWatchdog.schedule(this)
        if (!LocationService.running && checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
            try {
                LocationService.start(this)
            } catch (_: Exception) {
            }
        }
    }

    private fun systemNight() =
        resources.configuration.uiMode and android.content.res.Configuration.UI_MODE_NIGHT_MASK == android.content.res.Configuration.UI_MODE_NIGHT_YES

    /** Tema effettivo: la scelta dell'utente oppure quello del telefono. */
    private fun night() = when (prefs.theme) { "dark" -> true; "light" -> false; else -> systemNight() }

    /** Dietro le barre di sistema e prima che la pagina si disegni: stesso colore di fondo dell'interfaccia (chiaro o scuro). */
    private fun applyBars() {
        val night = night()
        val bg = android.graphics.Color.parseColor(if (night) "#121212" else "#E9EDF3")
        rootView.setBackgroundColor(bg)
        web.setBackgroundColor(bg)
        if (Build.VERSION.SDK_INT >= 23) window.decorView.systemUiVisibility = if (night) 0 else android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
    }

    /** Android impone i permessi a gradini: prima posizione precisa, poi "sempre", poi notifiche. */
    private fun startTracking() {
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION), REQ_FG)
            return
        }
        if (Build.VERSION.SDK_INT >= 29 &&
            checkSelfPermission(Manifest.permission.ACCESS_BACKGROUND_LOCATION) != PackageManager.PERMISSION_GRANTED
        ) {
            Toast.makeText(this, "Scegli \"Consenti sempre\" nella schermata successiva", Toast.LENGTH_LONG).show()
            requestPermissions(arrayOf(Manifest.permission.ACCESS_BACKGROUND_LOCATION), REQ_BG)
            return
        }
        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), REQ_NOTIF)
            return
        }
        LocationService.start(this)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED || requestCode == REQ_NOTIF) startTracking()
        else Toast.makeText(this, "Permesso negato: il tracking non può partire", Toast.LENGTH_LONG).show()
    }

    private fun requestIgnoreBattery() {
        val pm = getSystemService(PowerManager::class.java)
        if (pm.isIgnoringBatteryOptimizations(packageName)) {
            Toast.makeText(this, "Già escluso", Toast.LENGTH_SHORT).show()
            return
        }
        startActivity(
            Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName"))
        )
    }

    /**
     * Chiede al telefono la posizione adesso (GPS e rete in parallelo): si ferma al primo fix con precisione entro 100 m,
     * altrimenti dopo 20 secondi usa il migliore ottenuto. `onDone(null)` se nessun provider risponde.
     */
    private fun fixNow(onDone: (Location?) -> Unit) {
        val lm = getSystemService(LocationManager::class.java)
        val providers = listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER).filter { lm.isProviderEnabled(it) }
        if (providers.isEmpty() || Build.VERSION.SDK_INT < 30) { onDone(null); return }
        val handler = Handler(Looper.getMainLooper())
        val signals = mutableListOf<CancellationSignal>()
        var best: Location? = null
        var finished = false
        var pending = providers.size
        fun finish() {
            if (finished) return
            finished = true
            handler.removeCallbacksAndMessages(null)
            signals.forEach { it.cancel() }
            onDone(best)
        }
        handler.postDelayed({ finish() }, 20_000)
        for (p in providers) {
            val cs = CancellationSignal().also { signals += it }
            @Suppress("MissingPermission")
            lm.getCurrentLocation(p, cs, mainExecutor) { loc ->
                handler.post {
                    pending--
                    val b = best
                    if (loc != null && (b == null || (loc.hasAccuracy() && loc.accuracy < b.accuracy))) best = loc
                    val now = best
                    if (pending <= 0 || (now != null && now.hasAccuracy() && now.accuracy <= 100f)) finish()
                }
            }
        }
    }

    /** API esposta all'interfaccia web come window.MyMapNative (vedi web/native.js). */
    private inner class Bridge {
        @JavascriptInterface
        fun getStatus(): String {
            val (total, pending) = store.counts()
            val info = packageManager.getPackageInfo(packageName, 0)
            return JSONObject()
                .put("version", info.versionName).put("build", info.longVersionCode)
                .put("total", total).put("pending", pending)
                .put("lastSync", prefs.lastSync).put("tracking", prefs.tracking)
                .toString()
        }

        @JavascriptInterface
        fun getConfig(): String = JSONObject()
            .put("url", prefs.serverUrl).put("email", prefs.email).put("hasPassword", prefs.password.isNotEmpty())
            .toString()

        @JavascriptInterface
        fun getPoints(): String = store.allPacked()

        /** Ultima posizione nota del telefono (la più recente tra i provider), o stringa vuota. */
        @JavascriptInterface
        fun getLocation(): String {
            if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) return ""
            val lm = getSystemService(LocationManager::class.java)
            val best = lm.getProviders(true).mapNotNull { try { lm.getLastKnownLocation(it) } catch (e: SecurityException) { null } }
                .maxByOrNull { it.time } ?: return ""
            return JSONObject().put("lat", best.latitude).put("lon", best.longitude).toString()
        }

        @JavascriptInterface
        fun startTracking() { runOnUiThread { this@MainActivity.startTracking() } }

        @JavascriptInterface
        fun stopTracking() { runOnUiThread { LocationService.stop(this@MainActivity) } }

        @JavascriptInterface
        fun syncNow() { SyncWorker.enqueue(this@MainActivity) }

        /** Rilegge dal server tutto lo storico (i punti già presenti restano, i nuovi si aggiungono). */
        /** Pulizia dei punti inutili: con `apply` falso conta soltanto. Risposta: {total, accuracy, spikes, stays}. */
        @JavascriptInterface
        fun cleanPoints(apply: Boolean): String {
            val r = store.cleanup(apply)
            return JSONObject().put("total", r[0]).put("accuracy", r[1]).put("spikes", r[2]).put("stays", r[3]).toString()
        }

        @JavascriptInterface
        fun repullHistory() { prefs.historyPulled = false; SyncWorker.enqueue(this@MainActivity) }

        @JavascriptInterface
        fun requestIgnoreBattery() { runOnUiThread { this@MainActivity.requestIgnoreBattery() } }

        /** Stato dell'accesso: modalità (none/server/local), server, email. */
        @JavascriptInterface
        fun getSession(): String = JSONObject()
            .put("mode", prefs.mode).put("url", prefs.serverUrl).put("email", prefs.email).put("oauth", prefs.oauth)
            .toString()

        /**
         * Accesso (o creazione dell'account) con email e password su un server PocketBase. Le credenziali sono quelle con cui
         * l'app fa poi login: i punti registrati vengono associati a questo account. Risultato in window.__authResult({ok, error}).
         */
        @JavascriptInterface
        fun loginEmail(json: String) {
            val c = JSONObject(json)
            val before = prefs.mode
            val old = listOf(prefs.serverUrl, prefs.email, prefs.password, prefs.token, prefs.userId)
            Thread {
                var err: String?
                try {
                    prefs.serverUrl = c.getString("url"); prefs.email = c.getString("email"); prefs.password = c.getString("password")
                    prefs.token = ""; prefs.oauth = false
                    val api = Api(prefs)
                    err = if (!api.health()) "Server non raggiungibile" else null
                    if (err == null && c.optBoolean("create")) err = api.register()
                    if (err == null) err = api.loginMessage()
                } catch (e: Exception) {
                    err = "Errore di rete: ${e.message}"
                }
                if (err != null && before == "server") { // un tentativo fallito non deve cancellare l'account già collegato
                    prefs.serverUrl = old[0]; prefs.email = old[1]; prefs.password = old[2]; prefs.token = old[3]; prefs.userId = old[4]
                }
                finishAuth(err)
            }.start()
        }

        /** Feedback aptico a ogni tocco (se il telefono ha attiva la vibrazione al tocco): kind = tap | ok | error. */
        @JavascriptInterface
        fun haptic(kind: String) {
            runOnUiThread {
                val c = when (kind) {
                    "ok" -> if (Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.VIRTUAL_KEY
                    "error" -> if (Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.REJECT else HapticFeedbackConstants.LONG_PRESS
                    else -> HapticFeedbackConstants.VIRTUAL_KEY
                }
                web.performHapticFeedback(c)
            }
        }

        /**
         * Richiede la posizione adesso; con `save` la registra anche come punto (nel buffer, poi sincronizzato).
         * Risposta in window.__nativeResult(id, {ok, lat, lon, acc, provider, saved, error}).
         */
        @JavascriptInterface
        fun requestFix(id: Int, save: Boolean) {
            runOnUiThread {
                fun reply(r: JSONObject) = web.evaluateJavascript("window.__nativeResult($id, $r)", null)
                if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                    reply(JSONObject().put("ok", false).put("error", "Manca il permesso di posizione"))
                    return@runOnUiThread
                }
                fixNow { loc ->
                    if (loc == null) {
                        reply(JSONObject().put("ok", false).put("error", "Nessuna posizione: controlla che la posizione del telefono sia attiva e prova all'aperto"))
                    } else {
                        if (save) {
                            val bm = getSystemService(android.os.BatteryManager::class.java)
                            store.insert(
                                TrackPoint(
                                    clientId = java.util.UUID.randomUUID().toString(), ts = loc.time, lat = loc.latitude, lon = loc.longitude,
                                    accuracy = if (loc.hasAccuracy()) loc.accuracy else null, speed = if (loc.hasSpeed()) loc.speed else null,
                                    bearing = if (loc.hasBearing()) loc.bearing else null, altitude = if (loc.hasAltitude()) loc.altitude else null,
                                    provider = loc.provider ?: "gps", battery = bm.getIntProperty(android.os.BatteryManager.BATTERY_PROPERTY_CAPACITY),
                                )
                            )
                            SyncWorker.enqueue(this@MainActivity)
                            LastPointWidget.update(this@MainActivity)
                        }
                        reply(
                            JSONObject().put("ok", true).put("lat", loc.latitude).put("lon", loc.longitude)
                                .put("acc", if (loc.hasAccuracy()) loc.accuracy.toDouble() else JSONObject.NULL)
                                .put("provider", loc.provider ?: "").put("saved", save)
                        )
                    }
                }
            }
        }

        /** Stato di salute del tracking: servizio, ultimo punto, permessi, risparmio batteria, notifiche. */
        @JavascriptInterface
        fun getHealth(): String {
            val pm = getSystemService(PowerManager::class.java)
            val nm = getSystemService(android.app.NotificationManager::class.java)
            return JSONObject()
                .put("tracking", prefs.tracking).put("running", LocationService.running).put("lastTs", store.lastOwnTs())
                .put("fine", checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED)
                .put("bg", Build.VERSION.SDK_INT < 29 || checkSelfPermission(Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED)
                .put("battery", pm.isIgnoringBatteryOptimizations(packageName))
                .put("notif", nm.areNotificationsEnabled())
                .toString()
        }

        /** Frequenza dei punti: in movimento (secondi) e da fermo (punti ogni minuti). */
        @JavascriptInterface
        fun getTrackerConfig(): String = JSONObject()
            .put("movingSec", prefs.movingSec).put("stillPoints", prefs.stillPoints).put("stillMinutes", prefs.stillMinutes)
            .toString()

        @JavascriptInterface
        fun setTrackerConfig(json: String) {
            val c = JSONObject(json)
            prefs.movingSec = c.optInt("movingSec", prefs.movingSec)
            prefs.stillPoints = c.optInt("stillPoints", prefs.stillPoints)
            prefs.stillMinutes = c.optInt("stillMinutes", prefs.stillMinutes)
            runOnUiThread { LocationService.reload(this@MainActivity) }
        }

        /** Apre la pagina di sistema dell'app (permessi, batteria, notifiche). */
        @JavascriptInterface
        fun openAppSettings() {
            runOnUiThread {
                startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName")))
            }
        }

        /** Impostazioni del profilo: lettura. Risposta in window.__nativeResult(id, {ok, supported, settings, error}). */
        @JavascriptInterface
        fun pullSettings(id: Int) {
            Thread {
                val r = JSONObject()
                try {
                    if (prefs.mode != "server") error("non collegato a un server")
                    val (supported, s) = Api(prefs).fetchSettings()
                    r.put("ok", true).put("supported", supported).put("settings", s ?: JSONObject.NULL)
                } catch (e: Exception) {
                    r.put("ok", false).put("error", e.message ?: "errore")
                }
                runOnUiThread { web.evaluateJavascript("window.__nativeResult($id, $r)", null) }
            }.start()
        }

        /** Impostazioni del profilo: scrittura. Risposta in window.__nativeResult(id, {ok, error}). */
        @JavascriptInterface
        fun pushSettings(id: Int, json: String) {
            Thread {
                val r = JSONObject()
                try {
                    if (prefs.mode != "server") error("non collegato a un server")
                    val err = Api(prefs).saveSettings(json)
                    r.put("ok", err == null).put("error", err ?: "")
                } catch (e: Exception) {
                    r.put("ok", false).put("error", e.message ?: "errore")
                }
                runOnUiThread { web.evaluateJavascript("window.__nativeResult($id, $r)", null) }
            }.start()
        }

        /** Cambio password dalle impostazioni (serve quella attuale). Risultato in window.__authResult({ok, error}). */
        @JavascriptInterface
        fun changePassword(json: String) {
            val c = JSONObject(json)
            Thread {
                val err = try {
                    if (prefs.oauth || prefs.mode != "server") "Il cambio password è disponibile solo per gli account con email"
                    else Api(prefs).changePassword(c.getString("old"), c.getString("new"))
                } catch (e: Exception) {
                    "Errore di rete: ${e.message}"
                }
                val r = JSONObject().put("ok", err == null).put("error", err ?: "")
                runOnUiThread { web.evaluateJavascript("window.__authResult($r)", null) }
            }.start()
        }

        /** "Password dimenticata": il server manda l'email con il link di reimpostazione. Risultato in window.__authResult({ok, error}). */
        @JavascriptInterface
        fun resetPassword(json: String) {
            val c = JSONObject(json)
            Thread {
                val old = prefs.serverUrl
                val err = try {
                    prefs.serverUrl = c.getString("url") // l'utente può non aver ancora fatto accesso: si usa l'URL scritto nel modulo
                    val api = Api(prefs)
                    if (!api.health()) "Server non raggiungibile" else api.requestPasswordReset(c.getString("email"))
                } catch (e: Exception) {
                    "Errore di rete: ${e.message}"
                } finally {
                    if (prefs.mode == "server") prefs.serverUrl = old
                }
                val r = JSONObject().put("ok", err == null).put("error", err ?: "")
                runOnUiThread { web.evaluateJavascript("window.__authResult($r)", null) }
            }.start()
        }

        private var google: Api? = null

        /** Accesso con Google tramite il server PocketBase: apre il browser e attende il ritorno. */
        @JavascriptInterface
        fun loginGoogle(url: String) {
            prefs.serverUrl = url
            val api = Api(prefs).also { google = it }
            Thread {
                var err: String? = try {
                    api.googleLogin { u -> runOnUiThread { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(u))) } }
                } catch (e: Exception) { "Errore: ${e.message}" }
                if (err != null) prefs.oauth = false
                finishAuth(err)
            }.start()
        }

        @JavascriptInterface
        fun cancelGoogle() { google?.cancelOAuth() }

        /** Solo database locale: nessun account, i punti restano nel telefono (e si caricano se poi ci si collega a un server). */
        @JavascriptInterface
        fun useLocal() { prefs.clearAccount(); prefs.mode = "local" }

        /** Esce dall'account. Con `wipe` svuota anche i punti locali, che appartengono all'account che si lascia. */
        @JavascriptInterface
        fun logout(wipe: Boolean) {
            if (wipe) store.clear()
            prefs.clearAccount()
            prefs.mode = "none"
        }

        /** Tema scelto nelle impostazioni (system | light | dark): si ricorda e si aggiornano le barre di sistema. */
        @JavascriptInterface
        fun setTheme(theme: String) {
            if (theme !in listOf("system", "light", "dark")) return
            prefs.theme = theme
            runOnUiThread { applyBars() }
        }

        /** Esporta i punti in un file scelto dall'utente: format = csv | gpx | json. */
        @JavascriptInterface
        fun exportData(format: String) {
            runOnUiThread {
                exportFormat = format
                val (mime, ext) = when (format) {
                    "gpx" -> "application/gpx+xml" to "gpx"
                    "json" -> "application/json" to "json"
                    else -> "text/csv" to "csv"
                }
                val name = "mymap-" + java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US).format(java.util.Date()) + "." + ext
                startActivityForResult(
                    Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(mime).putExtra(Intent.EXTRA_TITLE, name),
                    REQ_EXPORT,
                )
            }
        }
    }

    private var exportFormat = "csv"

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != REQ_EXPORT || resultCode != RESULT_OK) return
        val uri = data?.data ?: return
        Thread {
            val msg = try {
                val n = contentResolver.openOutputStream(uri)!!.use { Exporter.write(store, exportFormat, it) }
                "Esportati $n punti"
            } catch (e: Exception) {
                "Esportazione non riuscita: ${e.message}"
            }
            runOnUiThread { Toast.makeText(this, msg, Toast.LENGTH_LONG).show() }
        }.start()
    }

    /** Risultato dell'accesso verso l'interfaccia: window.__authResult({ok, error}). */
    private fun finishAuth(err: String?) {
        if (err == null) {
            prefs.mode = "server"; prefs.historyPulled = false
            SyncWorker.enqueue(this) // carica i punti locali non ancora inviati e scarica lo storico dell'account
        }
        val r = JSONObject().put("ok", err == null).put("error", err ?: "")
        runOnUiThread { web.evaluateJavascript("window.__authResult($r)", null) }
    }

    companion object {
        private const val REQ_FG = 1
        private const val REQ_BG = 2
        private const val REQ_NOTIF = 3
        private const val REQ_EXPORT = 4
    }
}
