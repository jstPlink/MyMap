# MyMap – Architettura (v0.18.0, build 30)

Panoramica del progetto com'è oggi. La cronologia delle versioni è in [CHANGELOG.md](CHANGELOG.md): va aggiornata a ogni rilascio
(alzare `versionCode` di 1 e `versionName` in `android/app/build.gradle.kts`, poi aggiungere la voce).

## 1. Cos'è

App Android **personale** che registra la posizione in background e la mostra come scratch map, heatmap, percorsi, notti e posti
visitati, con statistiche. Nessuna parte social. I dati restano sul telefono (database locale) oppure si sincronizzano con un
server **PocketBase** proprio.

## 2. Come è fatta

```
┌──────────────────────────── App Android ────────────────────────────┐
│  WebView ── interfaccia web (cartella web/, inclusa negli asset)     │
│     │  window.MyMapNative (ponte)                                    │
│     ▼                                                                │
│  MainActivity ── permessi, ponte JS                                  │
│  LocationService (foreground) ──► PointStore (SQLite) ──► SyncWorker │
│  TrackerWatchdog, BootReceiver        Api (HttpURLConnection)        │
└──────────────────────────────────────────────┬───────────────────────┘
                                               │ HTTPS (opzionale)
                                               ▼
                                   PocketBase (Docker, sul NAS)
```

**Un'unica interfaccia.** Tutta la grafica è in `web/` (HTML, CSS, JS senza build). Nel browser (`python -m http.server` dentro
`web/`) gira con dati demo, perché `native.js` simula il motore; nell'app la stessa cartella viene impacchettata nell'APK e usa il
ponte nativo con i dati veri. Il tracking, il buffer e la sincronizzazione sono sempre nativi.

### Android (`android/`)

Kotlin, `minSdk 26`, `targetSdk/compileSdk 35`, package `com.mymap.app`. Dipendenze: `androidx.core-ktx` e `androidx.work`; niente
Google Play Services né librerie HTTP/JSON esterne.

| File | Ruolo |
|---|---|
| `MainActivity.kt` | Contiene la WebView, gestisce i permessi a gradini (posizione precisa → "sempre" → notifiche), le barre di sistema e il ponte `MyMapNative`. |
| `LocationService.kt` | Servizio in primo piano: frequenza dei punti regolabile (in movimento ogni N secondi, da fermo N punti ogni X minuti), filtro sui fix imprecisi, GPS con rete come riserva da fermo. |
| `TrackerWatchdog.kt` | Ogni ~15 minuti controlla che il tracking giri; se Android l'ha fermato lo riavvia o manda una notifica. |
| `BootReceiver.kt` | Riavvia il tracking dopo il boot e dopo un aggiornamento dell'app. |
| `PointStore.kt` | Buffer SQLite dei punti; si svuota solo dopo una sincronizzazione riuscita. |
| `SyncWorker.kt` / `Api.kt` | Invio a batch idempotente (`client_id`), scarico dello storico, login, registrazione, cambio password, accesso con Google. |
| `Exporter.kt` | Esportazione in CSV, GPX o JSON. |
| `Prefs.kt` | Preferenze native (server, account, tracker). |

### Interfaccia (`web/`)

| File | Ruolo |
|---|---|
| `index.html`, `style.css` | Struttura e stile (tema chiaro, o scuro in scala di grigi). |
| `app.js` | Mappa Leaflet, viste (Scratch, Heatmap, Percorsi, Mix, Notti, Posti, Notti e posti) scelte da un pulsante che apre un foglio, filtro del periodo, pannello dati, tracker. |
| `stats.js` | Scheda Statistiche (sezioni comprimibili incluse). |
| `geo.js`, `places.js` | Calcoli geografici (esagoni, notti, visite) e nomi dei luoghi (OpenStreetMap Nominatim + nomi dati dall'utente). |
| `prefs.js`, `profile.js` | Impostazioni, preset (vista corrente e frequenza dei punti inclusi) e loro salvataggio nel profilo del server, condiviso tra i dispositivi. |
| `account.js` | Schermata di accesso, account, cambio password, esportazione. |
| `native.js` | Adattatore verso il motore nativo (o simulazione nel browser). |

Viste della mappa e dati mostrati nel pannello in basso:

| Vista | Disegna | Pannello dati |
|---|---|---|
| Scratch | mappa coperta con esagoni "grattati" dove sei stato | esagoni grattati, diametro esagono |
| Heatmap | calore dei punti | nessuno |
| Percorsi | tracce (colore unico o per frequenza) | nessuno |
| Mix | heatmap con i percorsi sopra | nessuno |
| Notti | lune con il numero di notti per luogo | notti trovate, luoghi diversi, notti nel luogo principale |
| Posti | posti visitati (almeno 20 minuti) | posti totali, visite, rinominati, da rinominare |
| Notti e posti | posti con sopra le lune | notti, luoghi per dormire, posti, visite |

## 3. Backend (`pocketbase/`, `docker-compose.yml`)

- PocketBase in Docker, porta pubblicata solo su `127.0.0.1:8090` (l'esposizione pubblica è pensata via tunnel Cloudflare).
- Migrazioni: collection `points` (idempotente grazie all'indice unico `user + client_id`, regole solo per il proprietario),
  batch API attiva (`/api/batch`, 300 richieste), campo JSON `settings` sugli utenti per il profilo.
- Le password degli utenti hanno minimo **8 caratteri** (regola di PocketBase, rispettata anche dall'app).
- `pocketbase/start-local.ps1` e `set-admin.ps1` servono per provarlo su Windows senza Docker (richiedono il binario in
  `pocketbase/bin/`, escluso da git).

## 4. Strumenti e pubblicazione

- `tools/setup_server.py`: prepara il server (utente, campi necessari).
- `tools/import_timeline.py`: importa nel server l'export "Spostamenti" di Google Maps (percorsi, soste, fix GPS).
- `.github/workflows/pages.yml`: pubblica `web/` su GitHub Pages (versione dimostrativa con dati demo).

## 5. Sviluppo e prova

1. **Solo grafica:** `cd web && python -m http.server 8123`, poi `http://localhost:8123` (con `?sys=1` per il tema scuro).
2. **App sul telefono:** con JDK 17 e Android SDK (piattaforma 35), da `android/` eseguire `./gradlew assembleDebug`; l'APK è in
   `app/build/outputs/apk/debug/`. Si installa con il debug wireless (`adb pair`, `adb connect`, `adb install -r`).
3. L'APK di debug e quello `release` sono firmati con la chiave di debug (uso personale): gli aggiornamenti si installano sopra
   solo se compilati dalla stessa macchina.

## 6. Punti aperti

- La password dell'account è salvata in chiaro nelle preferenze dell'app (serve per il nuovo login); valutare Keystore.
- `usesCleartextTraffic` è attivo: con il tunnel HTTPS si può disattivare.
- Il buffer SQLite non elimina mai i punti già sincronizzati.
- "Continua con Google" resta spento finché il provider non è attivo in PocketBase (`GOOGLE_ENABLED` in `web/account.js`).
- Non ci sono test automatici.
