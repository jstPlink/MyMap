package com.mymap.app

import android.content.Context

class Prefs(context: Context) {
    private val sp = context.getSharedPreferences("mymap", Context.MODE_PRIVATE)

    /** Di default il server è quello nel BuildConfig; l'utente può cambiarlo dalle impostazioni. */
    var serverUrl: String
        get() = sp.getString("server_url", null) ?: BuildConfig.SERVER_URL
        set(v) = sp.edit().putString("server_url", v.trim().trimEnd('/')).apply()
    var email: String
        get() = sp.getString("email", "") ?: ""
        set(v) = sp.edit().putString("email", v.trim()).apply()
    var password: String
        get() = sp.getString("pw", "") ?: ""
        set(v) = sp.edit().putString("pw", v).apply()
    var token: String
        get() = sp.getString("token", "") ?: ""
        set(v) = sp.edit().putString("token", v).apply()
    var userId: String
        get() = sp.getString("uid", "") ?: ""
        set(v) = sp.edit().putString("uid", v).apply()
    var tracking: Boolean
        get() = sp.getBoolean("tracking", false)
        set(v) = sp.edit().putBoolean("tracking", v).apply()
    var lastSync: String
        get() = sp.getString("lastSync", "mai") ?: "mai"
        set(v) = sp.edit().putString("lastSync", v).apply()
    /** true dopo aver scaricato dal server lo storico dei punti (import da altre fonti, altri dispositivi). */
    var historyPulled: Boolean
        get() = sp.getBoolean("historyPulled", false)
        set(v) = sp.edit().putBoolean("historyPulled", v).apply()
    val deviceId: String
        get() = sp.getString("device", null) ?: java.util.UUID.randomUUID().toString().also {
            sp.edit().putString("device", it).apply()
        }
}
