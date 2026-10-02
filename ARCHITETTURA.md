# MyMap – Architettura (v0.19.0, build 32)

Panoramica tecnica del progetto com'è oggi (per l'uso dell'app vedi [docs/GUIDA.md](docs/GUIDA.md)). La cronologia delle versioni è in [CHANGELOG.md](CHANGELOG.md): va aggiornata a ogni rilascio
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
| `app.js` | Mappa Leaflet, viste (Scratch, Heatmap, Percorsi, Notti, Posti) scelte con targhette verticali a destra, pannello di personalizzazione della vista corrente, filtro del periodo, pannello dati, tracker. |
| `stats.js` | Scheda Statistiche (sezioni comprimibili incluse). |
| `geo.js`, `places.js` | Calcoli geografici (esagoni, notti, visite) e nomi dei luoghi (OpenStreetMap Nominatim + nomi dati dall'utente). |
| `prefs.js`, `profile.js` | Parametri di personalizzazione (mostrati nel pannello della mappa), preset (vista corrente e frequenza dei punti inclusi) e loro salvataggio nel profilo del server, condiviso tra i dispositivi. |
| `account.js` | Schermata di accesso, account, cambio password, esportazione. |
| `world.js`, `countries-data.js` | Stati visitati: `world.js` decodifica i confini (TopoJSON Natural Earth 1:50m in `countries-data.js`, caricato solo alla prima richiesta) e assegna i punti ai paesi (punto in poligono, con i buchi come Lesotho e San Marino); i punti si raggruppano in celle di 0,02° e si provano più punti per cella, le celle già risolte si ricordano. Conta uno stato con almeno 3 punti, ignorando i tratti oltre 400 km/h; il totale per la percentuale sono 195 stati sovrani. |
| `native.js` | Adattatore verso il motore nativo (o simulazione nel browser). |

Viste della mappa e dati mostrati nel pannello in basso:

| Vista | Disegna | Pannello dati |
|---|---|---|
| Scratch | mappa coperta con esagoni "grattati" dove sei stato | esagoni grattati, diametro, stati visitati e percentuale |
| Heatmap | calore dei punti | i 3 posti più visitati e l'elenco completo |
| Percorsi | tracce (colore unico o per frequenza) | spostamenti di un giorno con cambio giorno (e filtro sul giorno) |
| Notti | lune con il numero di notti per luogo | notti trovate, luoghi diversi, notti nel luogo principale, elenco notti e luoghi |
| Posti | posti visitati (almeno 20 minuti) | posti totali, visite, rinominati, da rinominare, elenco posti |

### Ponte nativo (`window.MyMapNative`, adattato da `web/native.js`)

| Gruppo | Metodi |
|---|---|
| Stato e punti | `getStatus` (versione, totale, da sincronizzare, ultima sync, tracking), `getPoints` (tutti i punti in binario compatto base64: ts in secondi, lat e lon ×1e6, accuratezza), `getConfig` |
| Tracking | `startTracking`, `stopTracking`, `syncNow`, `repullHistory`, `requestIgnoreBattery`, `getHealth`, `getTrackerConfig`, `setTrackerConfig`, `openAppSettings` |
| Posizione | `getLocation` (ultima nota), `requestFix(id, save)` (posizione fresca, opzionalmente salvata come punto) |
| Account | `getSession`, `loginEmail`, `loginGoogle`, `cancelGoogle`, `useLocal`, `logout`, `changePassword`, `resetPassword` |
| Profilo | `pullSettings(id)`, `pushSettings(id, json)` |
| Interfaccia | `setTheme` (colora le barre di sistema), `haptic(kind)` (tap, ok, error), `exportData(formato)` |

I risultati asincroni tornano con `window.__nativeResult(id, risposta)` (profilo, posizione) o `window.__authResult(...)` (accesso).

### Tracking in dettaglio (`LocationService`)

- **Modi.** *In movimento*: GPS ogni `movingSec` secondi (default 5). *Da fermo*: `stillPoints` punti ogni `stillMinutes` minuti
  (default 1 ogni 10), senza filtro sulla distanza, così anche con il telefono fermo ci sono punti per le notti; il provider di
  **rete** (Wi-Fi e celle) fa da riserva al GPS, che in casa spesso non aggancia. I parametri sono in `Prefs.kt` e si cambiano da
  Tracker → Frequenza dei punti (`ACTION_RELOAD` riapplica senza riavviare).
- **Passaggio tra i modi.** Sei fix di fila sotto 0,6 m/s portano a "da fermo"; un fix sopra 1 m/s riporta a "in movimento" (la zona
  intermedia non cambia nulla, per non oscillare con il rumore del GPS). Da fermo si arma il sensore *movimento significativo*, che
  riporta subito a "in movimento" senza aspettare il fix successivo.
- **Filtri.** Fix con accuratezza peggiore di 60 m scartati; da fermo un solo punto per metà intervallo (GPS e rete possono rispondere insieme).
- **Wake lock.** Parziale e breve (15 s): copre solo il salvataggio di ogni punto; uno continuo scaricherebbe la batteria senza dare
  punti in più, perché il sistema sveglia già il telefono a ogni fix.
- **Affidabilità.** `LocationService.running` dice se il servizio è vivo. `MainActivity` (all'avvio e a ogni ripresa) e `BootReceiver`
  (boot e `MY_PACKAGE_REPLACED`) riavviano il tracking se `Prefs.tracking` è vero; `TrackerWatchdog` (WorkManager, ~15 min) lo rilancia,
  oppure notifica "Tracking fermo" se Android vieta l'avvio da background. `getHealth` espone servizio, ultimo punto proprio
  (`PointStore.lastOwnTs`, solo provider gps/network/fused/passive), permesso "sempre", esclusione dal risparmio batteria e notifiche.
- **Punti manuali.** `requestFix` usa `LocationManager.getCurrentLocation` (API 30+) su GPS e rete in parallelo: si ferma al primo fix
  entro 100 m, altrimenti dopo 20 s usa il migliore.

### Dati e calcoli

- **Punto:** `ts` (ms), `lat`, `lon`, `accuracy`, `speed`, `bearing`, `altitude`, `provider`, `battery`, `client_id` (UUID, rende
  l'invio idempotente), `synced`. Nel server la collection `points` ha lo stesso schema più `user` e `device_id`.
- **Pulizia (`geo.js`).** `clean`: via i fix con accuratezza > 120 m e i salti impossibili (> 180 km/h per più di 300 m). `movePts`:
  senza le soste importate da Google (`acc = -1`) e con almeno 15 m tra due punti (`thin`); si usa per Percorsi e Heatmap.
  Scratch, Notti e Posti usano tutti i punti.
- **Km (`moveSteps`).** Passi tra punti consecutivi entro 20 minuti, scartando < 10 m, > 30 km e > 250 km/h. Calcolati sempre su tutti
  i punti del filtro, così sono uguali in ogni vista.
- **Notti (`sleepPlaces`).** Finestra 23–09 (a cavallo della mezzanotte, la notte porta la data della sera); serve un gruppo di almeno
  `minPts` punti entro `radius` metri; luogo = centro del gruppo più numeroso; notti entro 400 m nello stesso posto. Per le notti con
  molti punti si campionano al massimo ~120 punti. Le preferenze hanno una versione (`sleep.v`): cambiando la formula si azzerano.
- **Posti (`visitPlaces`).** Episodi di almeno 20 minuti con i punti entro 150 m dal primo (buchi fino a 3 ore); posti entro 150 m uniti.
- **Scratch.** Esagoni con diametro per zoom (`prefs.hex`, minimo 100 m); `softOutlines` unisce gli esagoni adiacenti, toglie i lati
  condivisi, concatena i lati rimasti in anelli e arrotonda gli angoli con raccordi di Bézier (30% del lato).
- **Percorsi.** Tratti spezzati dove mancano dati per più di 5 minuti, semplificati allo zoom corrente con Ramer–Douglas–Peucker
  (tolleranza `detail` px) e memorizzati per zoom; si disegnano solo i tratti visibili. Stile *per frequenza*: i tratti si sommano su
  una tela (ogni passaggio aggiunge 1/`max` di opacità), sfocatura con compensazione del picco, colori dal gradiente (`heatPalette`).
- **Heatmap.** I punti si accorpano in celle di pochi pixel (raggio/3) con peso = numero di punti; i punti intermedi tra due fix si
  fanno solo quanto serve allo zoom. Spessore e raggio hanno tre livelli di zoom con interpolazione (`Prefs.widthAt`).
- **Spostamenti (`computeTrips`).** Il tragitto tra due soste consecutive (`visitEpisodes`: almeno 20 minuti entro 150 m) in luoghi diversi
  (almeno 300 m) e a meno di 12 ore; km = passi tra i punti del tragitto (come `moveSteps`), altrimenti distanza in linea retta (`approx`);
  dopo l'ultima sosta, se ci si è allontanati di più di 300 m, uno spostamento aperto ("in corso" se l'ultimo punto ha meno di 30 minuti).
  Il pannello della vista Percorsi mostra gli spostamenti di un giorno (`tripsPanelHtml`, giorno in `tripDay`); `stepTripDay` cambia giorno e
  imposta il filtro del periodo su quel giorno, `showTrip` imposta giorno e fascia oraria dello spostamento toccato (±2 minuti) e lo evidenzia.
- **Elenchi e filtri rapidi.** Gli elenchi completi (`openList`: posti più visti, notti e luoghi, posti, stati) usano il foglio `#lsheet` e i dati dell'ultimo
  disegno (`lastLists`). I filtri rapidi **7 giorni** e **Sempre** (`.qf`) impostano il filtro del periodo come le scorciatoie del pannello filtro.
- **Contorno dei pannelli.** `Prefs.v.outline` (`auto` = sottile solo nel tema chiaro, `thin`, `off`; `Prefs.effOutline`) imposta `data-outline` su `<html>`; in CSS `--outline` e la regola `:root[data-outline="thin"]`
  aggiungono una linea sottile a pannelli, pulsanti e targhette. Fa parte del gruppo `look` dei preset.
- **Notti e posti nascosti.** `Prefs.v.hidden` = `{ places: [{lat, lon, label}], nights: [chiavi AAAAMMGG] }`, nel profilo come il resto delle
  impostazioni. `sleepPlaces(..., hidden)` esclude le notti nascoste dal conteggio ma le restituisce nell'elenco (`list`, con
  `hidden`); `visiblePlaces()` esclude i posti entro 150 m da uno nascosto. Gli elenchi *Notti salvate* e *Posti salvati* (`buildSavedLists`
  in `app.js`) sono nel pannello della vista e usano tutti i punti, non il filtro del periodo.
- **Gruppi.** Notti e Posti fondono i marcatori vicini sullo schermo (~60 px) in gruppi, ricalcolati a ogni zoom.
- **Mappa di base.** `MAP_STYLES` in `prefs.js` (otto stili) e `baseLayers` in `app.js`; i filtri di colore sono classi CSS sul livello
  delle tessere (`tiles-*`), i ritocchi dell'utente (`mapFx`) sono filtri sul solo pannello delle tessere e, per la tinta, un filtro SVG
  (`#maptint`). Le tessere Esri arrivano senza chiave; lo stile "National Geographic" ha risoluzione nativa fino a zoom 12.
- **Durate (`fmtSpan`, `fmtCount`, `fmtHoursLong`).** Oltre 365 giorni, anni, mesi e giorni (anno 365 giorni, mese 365/12).
- **Impostazioni e preset.** `Prefs.v` (esagoni, heatmap, notti, percorsi, tema, stile mappa, ritocchi, vista, preset, nomi) vive in
  `localStorage`; con un account sul server `profile.js` la salva nel campo `settings` dell'utente (vince la modifica più recente, ora
  in `mymap.profile_t`). I preset hanno cinque gruppi: `hex`, `heat`, `route`, `sleep`, `look` (tema, mappa e ritocchi).

## 3. Backend (`pocketbase/`, `docker-compose.yml`)

- PocketBase in Docker, porta pubblicata solo su `127.0.0.1:8090` (l'esposizione pubblica è pensata via tunnel Cloudflare).
- Migrazioni: collection `points` (idempotente grazie all'indice unico `user + client_id`, regole solo per il proprietario),
  batch API attiva (`/api/batch`, 300 richieste), campo JSON `settings` sugli utenti per il profilo.
- Password: PocketBase vuole di default almeno 8 caratteri. La migrazione `1700000002` e `tools/setup_server.py` abbassano il minimo
  del campo a **5** (idempotenti). Attenzione: i controlli dell'app (`web/account.js`, `web/index.html`) chiedono ancora **8**.
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
- Password: il minimo è 5 sul server (dopo `setup_server.py` o la migrazione) ma 8 nell'app: da allineare se si vuole usare 5.
- La tinta della mappa usa un filtro SVG e la sfocatura un filtro CSS: sui telefoni meno potenti possono rallentare la mappa. Non
  misurato sul dispositivo.
- Le tessere Esri e OpenStreetMap non richiedono chiave ma hanno i loro termini d'uso (uso personale e leggero); quelle CARTO ora
  richiedono una chiave e non si usano.
- Il feedback aptico dipende dalla vibrazione al tocco del telefono; il riavvio del tracking da background può essere negato da
  Android 12+ (in quel caso c'è la notifica del cane da guardia).
