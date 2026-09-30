package com.mymap.app

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import android.text.InputType
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast

/** Schermata unica: configurazione server, permessi, start/stop e stato del buffer. UI costruita a codice. */
class MainActivity : Activity() {

    private lateinit var prefs: Prefs
    private lateinit var store: PointStore
    private lateinit var status: TextView
    private lateinit var toggle: Button
    private val ui = Handler(Looper.getMainLooper())

    private val refresh = object : Runnable {
        override fun run() {
            val (total, pending) = store.counts()
            status.text = "Punti registrati: $total\nDa sincronizzare: $pending\n" +
                "Ultima sync: ${prefs.lastSync}\nTracking: ${if (prefs.tracking) "ATTIVO" else "fermo"}"
            toggle.text = if (prefs.tracking) "Ferma tracking" else "Avvia tracking"
            ui.postDelayed(this, 3000)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = Prefs(this)
        store = PointStore(this)

        val info = packageManager.getPackageInfo(packageName, 0)
        val version = TextView(this).apply {
            text = "MyMap v${info.versionName} (build ${info.longVersionCode})"
            textSize = 18f
            setPadding(0, 0, 0, 24)
        }

        val url = field("URL server (es. https://mymap.tuodominio.it)", prefs.serverUrl, InputType.TYPE_TEXT_VARIATION_URI)
        val email = field("Email", prefs.email, InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS)
        val pw = field("Password", prefs.password, InputType.TYPE_TEXT_VARIATION_PASSWORD)
        status = TextView(this).apply { textSize = 16f; setPadding(0, 24, 0, 24) }

        val save = Button(this).apply {
            text = "Salva e prova login"
            setOnClickListener {
                prefs.serverUrl = url.text.toString()
                prefs.email = email.text.toString()
                prefs.password = pw.text.toString()
                prefs.token = ""
                Thread {
                    val ok = try { Api(prefs).login() } catch (e: Exception) { false }
                    runOnUiThread {
                        Toast.makeText(this@MainActivity, if (ok) "Login riuscito" else "Login fallito", Toast.LENGTH_LONG).show()
                    }
                }.start()
            }
        }
        toggle = Button(this).apply {
            setOnClickListener {
                if (prefs.tracking) LocationService.stop(this@MainActivity) else startTracking()
            }
        }
        val syncNow = Button(this).apply {
            text = "Sincronizza ora"
            setOnClickListener { SyncWorker.enqueue(this@MainActivity) }
        }
        val battery = Button(this).apply {
            text = "Escludi da risparmio batteria"
            setOnClickListener { requestIgnoreBattery() }
        }

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(40, 60, 40, 40)
            listOf(version, url, email, pw, save, status, toggle, syncNow, battery).forEach {
                addView(it, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
            }
        }
        setContentView(ScrollView(this).apply { addView(root) })
    }

    override fun onResume() {
        super.onResume()
        ui.post(refresh)
    }

    override fun onPause() {
        ui.removeCallbacks(refresh)
        super.onPause()
    }

    private fun field(hint: String, value: String, type: Int) = EditText(this).apply {
        this.hint = hint
        setText(value)
        inputType = InputType.TYPE_CLASS_TEXT or type
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

    companion object {
        private const val REQ_FG = 1
        private const val REQ_BG = 2
        private const val REQ_NOTIF = 3
    }
}
