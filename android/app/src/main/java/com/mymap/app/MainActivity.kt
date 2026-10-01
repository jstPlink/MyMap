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

        web = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            addJavascriptInterface(Bridge(), "MyMapNative")
            loadUrl("file:///android_asset/index.html?night=" + (if (resources.configuration.uiMode and android.content.res.Configuration.UI_MODE_NIGHT_MASK == android.content.res.Configuration.UI_MODE_NIGHT_YES) 1 else 0))
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
        // dietro le barre di sistema e prima che la pagina si disegni: stesso colore di fondo dell'interfaccia (chiaro o scuro)
        val night = resources.configuration.uiMode and android.content.res.Configuration.UI_MODE_NIGHT_MASK == android.content.res.Configuration.UI_MODE_NIGHT_YES
        val bg = android.graphics.Color.parseColor(if (night) "#0B1120" else "#F3F5F9")
        root.setBackgroundColor(bg)
        web.setBackgroundColor(bg)
        if (Build.VERSION.SDK_INT >= 23) window.decorView.systemUiVisibility = if (night) 0 else android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
        setContentView(root)
        root.requestApplyInsets()
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
