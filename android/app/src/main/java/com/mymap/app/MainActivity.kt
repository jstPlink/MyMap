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
            loadUrl("file:///android_asset/index.html")
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
        root.setBackgroundColor(android.graphics.Color.WHITE)
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
        fun getPoints(): String = store.recentJson(1_000_000)

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

        @JavascriptInterface
        fun requestIgnoreBattery() { runOnUiThread { this@MainActivity.requestIgnoreBattery() } }

        /** Salva la configurazione e prova il login; il risultato torna all'interfaccia con window.__nativeResult. */
        @JavascriptInterface
        fun saveConfigAndLogin(json: String) {
            val c = JSONObject(json)
            prefs.serverUrl = c.getString("url")
            prefs.email = c.getString("email")
            if (c.getString("password").isNotEmpty()) prefs.password = c.getString("password")
            prefs.token = ""
            prefs.historyPulled = false
            Thread {
                val ok = try { Api(prefs).login() } catch (e: Exception) { false }
                if (ok) SyncWorker.enqueue(this@MainActivity)
                runOnUiThread { web.evaluateJavascript("window.__nativeResult($ok)", null) }
            }.start()
        }
    }

    companion object {
        private const val REQ_FG = 1
        private const val REQ_BG = 2
        private const val REQ_NOTIF = 3
    }
}
