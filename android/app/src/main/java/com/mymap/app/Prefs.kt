package com.mymap.app

import android.content.Context

class Prefs(context: Context) {
    private val sp = context.getSharedPreferences("mymap", Context.MODE_PRIVATE)

    /** Di default il server è quello nel BuildConfig; l'utente può cambiarlo dalle impostazioni. */
    var serverUrl: String
        get() = (sp.getString("server_url", null) ?: BuildConfig.SERVER_URL).replace("://pocketbase.fplinio.it", "://mymap.fplinio.it") // il vecchio indirizzo non esiste più
        set(v) = sp.edit().putString("server_url", v.trim().trimEnd('/')).apply()
    var email: String
        get() = sp.getString("email", "") ?: ""
        set(v) = sp.edit().putString("email", v.trim()).apply()
    /** Cifrata con una chiave dell'Android Keystore (AES-GCM) che non lascia mai il dispositivo; le versioni precedenti la salvavano in chiaro (`pw`) e la si migra alla prima lettura. */
    var password: String
        get() {
            sp.getString("pwe", null)?.let { return SecretBox.open(it) ?: "" }
            val old = sp.getString("pw", null) ?: return ""
            password = old // migrazione: cifra e cancella il valore in chiaro
            return old
        }
        set(v) {
            val e = sp.edit().remove("pw")
            if (v.isEmpty()) e.remove("pwe") else SecretBox.seal(v)?.let { e.putString("pwe", it) } ?: e.remove("pwe")
            e.apply()
        }
    var token: String
        get() = sp.getString("token", "") ?: ""
        set(v) = sp.edit().putString("token", v).apply()
    var userId: String
        get() = sp.getString("uid", "") ?: ""
        set(v) = sp.edit().putString("uid", v).apply()
    /** "none" = non ha ancora scelto, "server" = account su un PocketBase, "local" = solo database del telefono. */
    var mode: String
        get() = sp.getString("mode", null) ?: if (email.isNotEmpty() || token.isNotEmpty()) "server" else "none" // installazioni precedenti
        set(v) = sp.edit().putString("mode", v).apply()
    /** true se l'accesso è avvenuto con Google: non c'è una password con cui rifare il login, si rinnova il token. */
    var oauth: Boolean
        get() = sp.getBoolean("oauth", false)
        set(v) = sp.edit().putBoolean("oauth", v).apply()
    init { if (sp.contains("pw")) password = password } // cifra subito la password salvata in chiaro dalle versioni precedenti
    fun clearAccount() {
        sp.edit().remove("email").remove("pw").remove("pwe").remove("token").remove("uid").putBoolean("oauth", false).putBoolean("historyPulled", false).apply()
    }
    /** Tema scelto nelle impostazioni: "system", "light" o "dark". Serve a colorare le barre di sistema prima che la pagina si carichi. */
    var theme: String
        get() = sp.getString("theme", "system") ?: "system"
        set(v) = sp.edit().putString("theme", v).apply()
    /** Frequenza dei punti (Tracker → Frequenza dei punti): in movimento un punto ogni N secondi; da fermo N punti ogni X minuti. */
    var movingSec: Int
        get() = sp.getInt("movingSec", 5)
        set(v) = sp.edit().putInt("movingSec", v.coerceIn(1, 600)).apply()
    var stillPoints: Int
        get() = sp.getInt("stillPoints", 1)
        set(v) = sp.edit().putInt("stillPoints", v.coerceIn(1, 60)).apply()
    var stillMinutes: Int
        get() = sp.getInt("stillMinutes", 10)
        set(v) = sp.edit().putInt("stillMinutes", v.coerceIn(1, 240)).apply()
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
    /** Ora dell'ultimo punto per cui è già partito l'avviso "nessun punto da 20 minuti" (0 = nessun avviso attivo). */
    var staleAlertFor: Long
        get() = sp.getLong("staleAlertFor", 0L)
        set(v) = sp.edit().putLong("staleAlertFor", v).apply()
    val deviceId: String
        get() = sp.getString("device", null) ?: java.util.UUID.randomUUID().toString().also {
            sp.edit().putString("device", it).apply()
        }
}
