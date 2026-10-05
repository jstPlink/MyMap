# MyMap – Architettura (v0.30.3, build 74)

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
| `LastPointWidget.kt` | Widget home (layout `widget_last_point`, info `xml/last_point_widget_info`): tempo trascorso da `PointStore.lastOwnTs`. Aggiornato da `LocationService` (max 1/min), `TrackerWatchdog` (~15 min), salvataggio manuale e `updatePeriodMillis` (30 min); rosso oltre 30 min. Il tocco apre l'app. |
| `TodayWidget.kt` | Widget home 4×1, in due versioni: chiara (`TodayWidget`, layout `widget_today`, sfondo semitrasparente effetto plastificato `widget_glass_light`, un `layer-list` con fondo, riflesso lucido in alto e filo interno) e scura (`TodayWidgetDark`, `widget_today_dark`, sfondo piatto `widget_flat_dark`). **Layout:** a sinistra le etichette *oggi* e *7g*; tre colonne (*km*, *posti*, *movimento*) con il titolo in alto, il dato di oggi (16,8 sp, grassetto) e il dato degli ultimi 7 giorni; a destra la cella *tracker*. Titoli, *oggi*, *7g* e dati dei 7 giorni hanno la stessa dimensione (11,2 sp) e lo stesso grigio. Tra le tre righe di ogni colonna ci sono spazi elastici uguali (`TextView` con peso 1) e le righe di *oggi* e dei valori hanno un'altezza minima uguale, così le righe restano allineate tra colonne; titolo e riga dei 7 giorni stanno a 19 dp dai bordi (8 dp di margine del widget + 11 dp attorno ai dati). **Dati:** due `PointStore.dayStats` (da mezzanotte di oggi e di 6 giorni fa; regole di `clean`, `moveSteps` e `visitEpisodes` del web riscritte in Kotlin). **Cella tracker:** titolo, icona animata e tempo "m:ss" dall'ultimo punto (`PointStore.lastFix`: ultimo punto del tracking e se si è in movimento, cioè velocità ≥ 1 m/s o spostamento ≥ 0,8 m/s dal punto precedente entro 15 minuti). L'icona è un `ViewFlipper` (i widget non permettono altre animazioni) con 4 fotogrammi, uno ogni 500 ms con dissolvenza: `ic_still_0..3` (pallino con anelli che si allargano) se si è fermi, `ic_steps_0..3` (impronte di scarpe) se in movimento; si alterna la visibilità dei due flipper e si colorano tutti i fotogrammi con `setColorFilter` (verde in movimento). Se l'ultimo punto ha più di `ALERT_MS` = 6 minuti, o non ce ne sono, la cella ha fondo rosso (`widget_alert_red`, con `setBackgroundResource`) e testi e icona bianchi. **Aggiornamenti:** `LocationService` (a ogni punto, al massimo 1/min, e ogni 5 minuti per il resto; la sola cella tracker ogni 20 secondi a schermo acceso e all'accensione dello schermo, con `TodayWidget.updateTracker` e `partiallyUpdateAppWidget`), `TrackerWatchdog` e `updatePeriodMillis` (30 min). **Tocchi:** ogni dato ha il suo `PendingIntent` verso `MainActivity` con l'extra `open` (`routes`, `places`, `heat`, `tracker`, `here`) e `range` = `7` per la riga dei 7 giorni; all'avvio diventano `?open=` e `&range=` nell'indirizzo, ad app aperta `onNewIntent` chiama `openFromWidget(view, range)` in `app.js` (vista e filtro su oggi o su 7 giorni; `tracker` apre Impostazioni con la sezione Tracker; `here` simula il tasto "dove sono"). **Anteprime:** `previewLayout` nei file `xml/*widget*_info.xml` (`widget_today_preview`, `widget_today_dark_preview`, `widget_last_point_preview`): copie dei layout veri con dati di esempio e un solo fotogramma dell'icona, generate da `tools/widget_preview.py` (da rilanciare quando cambia un layout; valgono da Android 12). **Vincoli di Android:** nei layout dei widget sono ammessi solo alcuni elementi (niente `View` semplice: i separatori sono `ImageView`); le dimensioni in `xml/today_widget*_info.xml` seguono la regola 70·n−30 dp (4 celle = 250 dp); l'altezza di una riga di celle è limitata, quindi se i margini o i testi crescono si taglia il testo (è successo con il "7" di *7g*). |
| `StaleAlert.kt` | Avviso sonoro "nessun punto da 20 minuti": se `Prefs.tracking` è vero e `PointStore.lastFix` ha più di 20 minuti, notifica su un canale proprio (`stale`, importanza alta, suono e vibrazione). Una volta per buco (`Prefs.staleAlertFor` = ora dell'ultimo punto già segnalato); si cancella quando i punti riprendono o il tracking viene fermato. Chiamato ogni 5 minuti dal `Runnable` di `LocationService` e dal `TrackerWatchdog` (~15 minuti). |
| `Exporter.kt` | Esportazione in CSV, GPX o JSON. |
| `Prefs.kt` | Preferenze native (server, account, tracker). |

### Interfaccia (`web/`)

| File | Ruolo |
|---|---|
| `index.html`, `style.css` | Struttura e stile (tema chiaro, o scuro in scala di grigi). |
| `app.js` | Mappa Leaflet, viste (Scratch, Heatmap, Percorsi, Luoghi, Punti) scelte con targhette verticali a destra, pannello di personalizzazione della vista corrente, filtro del periodo, pannello dati, tracker. |
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
| Luoghi (sperimentale, `drawBoth`) | Notti e Posti insieme: pallini e rombi sulla stessa mappa (caselle Notti/Posti in `bothShow`, salvate in `mymap.bothShow`; celle di fusione 32 px invece di 15/14) | notti, luoghi di notte, posti, visite, i due elenchi |
| Punti (di prova, `drawPoints`) | tutti i punti puliti su una tela propria (`L.Layer` con un `<canvas>` nell'overlayPane; proiezione Mercatore a mano, solo i punti visibili, uno ogni 3 px; ridisegno a ogni `moveend`) e le notti rilevate; il tocco mostra il punto più vicino | conteggio, filtro per ora e accuratezza (`ptOpt`, salvato in `mymap.ptView`), colore per ora, notti sì/no |

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
- **Pulizia (`geo.js`).** `clean`: via i fix con accuratezza > 120 m, i salti impossibili (> 180 km/h per più di 300 m) e i picchi (`despike`: punto a > 300 m da precedente e successivo, che distano tra loro meno del 40%, entro 15 min). `dropCoarse` (solo per Percorsi e Heatmap): via i fix con accuratezza ≥ 80 m se c'è un punto più preciso entro 5 min. `movePts`:
  senza le soste importate da Google (`acc = -1`) e con almeno 15 m tra due punti (`thin`); si usa per Percorsi e Heatmap.
  Scratch, Luoghi e Punti usano tutti i punti.
- **Km (`moveSteps`).** Passi tra punti consecutivi entro 20 minuti, scartando < 10 m, > 30 km e > 250 km/h. Calcolati sempre su tutti
  i punti del filtro, così sono uguali in ogni vista.
- **Notti (`sleepPlaces`; `Prefs.sleepOf` la chiama con le impostazioni).** Parametri di prova in `Prefs.v.sleep` (0 = disattivato): `accMax` (scarta punti imprecisi), `minSpan` (durata minima del gruppo), `coreMin`/`coreFrom`/`coreTo` (punti minimi nella fascia centrale), `merge` (distanza di unione dei luoghi, default 400 m); i controlli extra usano tutti i punti entro il raggio dal centro del gruppo. Le viste Notti e Posti separate sono state tolte (restano Luoghi e Punti; le viste salvate `sleep`/`places` diventano `both`). Finestra 23–09 (a cavallo della mezzanotte, la notte porta la data della sera); serve un gruppo di almeno
  `minPts` punti entro `radius` metri; luogo = centro del gruppo più numeroso; notti entro 400 m nello stesso posto. Per le notti con
  molti punti si campionano al massimo ~120 punti. Le preferenze hanno una versione (`sleep.v`): cambiando la formula si azzerano.
- **Posti (`visitPlaces`).** Episodi di almeno 20 minuti con i punti entro 150 m dal primo (buchi fino a 3 ore); posti entro 150 m uniti.
- **Scratch.** Diametro degli esagoni da tre coppie zoom → diametro (`prefs.hex = { zooms, diams }`, interpolazione logaritmica in `Prefs.hexDiam`, arrotondata a due cifre; `hexAdopt` converte il vecchio formato con un valore per zoom); nel tema scuro la coperta è grigia chiara con un filo luminoso attorno alle zone grattate; `softOutlines` unisce gli esagoni adiacenti, toglie i lati
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
  disegno (`lastLists`). I filtri rapidi **Oggi**, **7 giorni** e **Sempre** (`.qf`) impostano il filtro del periodo come le scorciatoie del pannello filtro.
- **Contorno dei pannelli.** `Prefs.v.outline` (`auto` = sottile in entrambi i temi, `thin`, `off`; `Prefs.effOutline`) imposta `data-outline` su `<html>`; in CSS `--outline` e la regola `:root[data-outline="thin"]`
  aggiungono una linea sottile a pannelli, pulsanti e targhette. Fa parte del gruppo `look` dei preset.
- **Notti e posti nascosti.** `Prefs.v.hidden` = `{ places: [{lat, lon, label}], nights: [chiavi AAAAMMGG] }`, nel profilo come il resto delle
  impostazioni. `sleepPlaces(..., hidden)` esclude le notti nascoste dal conteggio ma le restituisce nell'elenco (`list`, con
  `hidden`); `visiblePlaces()` esclude i posti entro 150 m da uno nascosto. Gli elenchi *Notti salvate* e *Posti salvati* (`buildSavedLists`
  in `app.js`) sono nel pannello della vista e usano tutti i punti, non il filtro del periodo.
- **Pannello dati comprimibile.** `#panel-fold` (freccia in cima a `#panel`) attiva la classe `folded`, che nasconde il contenuto; stato in `localStorage` (`mymap.panelFold`).
- **Gruppi.** Notti e Posti fondono i marcatori vicini sullo schermo (~60 px) in gruppi, ricalcolati a ogni zoom.
- **Mappa di base.** `MAP_STYLES` in `prefs.js` (otto stili) e `baseLayers` in `app.js`; i filtri di colore sono classi CSS sul livello
  delle tessere (`tiles-*`), i ritocchi dell'utente (`mapFx`) sono filtri sul solo pannello delle tessere e, per la tinta, un filtro SVG
  (`#maptint`). Le tessere Esri arrivano senza chiave; lo stile "National Geographic" ha risoluzione nativa fino a zoom 12.
- **Durate (`fmtSpan`, `fmtCount`, `fmtHoursLong`).** Oltre 365 giorni, anni, mesi e giorni (anno 365 giorni, mese 365/12).
- **Impostazioni e preset.** `Prefs.v` (esagoni, heatmap, notti, percorsi, tema, stile mappa, ritocchi, vista, preset, nomi) vive in
  `localStorage`; con un account sul server `profile.js` la salva nel campo `settings` dell'utente (vince la modifica più recente, ora
  in `mymap.profile_t`; su un'installazione nuova o con un altro account, cioè se `mymap.profile_ok` non coincide con `url|email`, vince sempre il server; nessun invio finché il profilo non è stato letto). I preset hanno cinque gruppi: `hex`, `heat`, `route`, `sleep`, `look` (tema, mappa e ritocchi).

- **Filtro alla sincronizzazione.** `SyncWorker` chiama `PointStore.cleanup(true, onlyPending = true)` prima di inviare: l'analisi usa i punti da inviare più le 3 ore precedenti (anche già inviati, come contesto), ma si cancellano solo quelli con `synced = 0`, che quindi non salgono sul server; niente `VACUUM`. Le regole sono le stesse della pulizia manuale.
- **Pulizia del database (`PointStore.cleanup`, ponte `cleanPoints(apply)`, Tracker → Pulizia dei punti).** Toglie accuratezza > 120 m, picchi (stessa regola di `despike`) e punti da fermo ripetuti (entro 10 m dall'ultimo tenuto e 10 min, seguiti da un punto ancora fermo: restano primo, ultimo e uno ogni 10 min). Le soste importate (acc = -1) non si toccano. I punti già sincronizzati tolti finiscono in `deleted` (database versione 2), che `insertSynced` rispetta; il server non viene modificato. Su 78.817 punti reali la simulazione ne toglie circa 17.000.

### Versione web (`web/native-web.js`)

Il sito è la stessa cartella `web/`, servita da PocketBase (`--publicDir=/pb_public`, `./web` montata in sola lettura nel compose): stesso indirizzo
dell'API, quindi niente CORS e nessun URL da scrivere. `native.js` chiama `isPocketBaseHost()` (richiesta sincrona a `/api/health`; `?demo=1` la salta): se
risponde, restituisce `makeWebNative()`, altrimenti restano il ponte nativo (nell'app) o i dati demo (`python -m http.server`). Il motore web ha la stessa
interfaccia del ponte (`Native.*`), con `isWeb: true`, `<html data-web>` e CSS che nascondono tracker, URL e scelta "su questo telefono".
- **Accesso:** `auth-with-password` su `users`; nel browser restano solo token, id ed email (`mymap.web`), mai la password. Il token si rinnova a ogni apertura (`auth-refresh`); un 401 svuota tutto e riporta alla schermata di accesso (`window.onWebExpired`).
- **Punti:** `fetchAll` legge `points` a pagine da 500 (`sort=ts,id`), 6 in parallelo, solo `ts,lat,lon,accuracy`, e li impacchetta come nell'app (16 byte/punto). Cache in IndexedDB (`mymap`/`kv`, chiave `pts:<utente>`): si tiene l'ultimo `ts`; all'apertura si confronta il numero di punti con `ts<=ultimo` (se è diverso ne sono stati tolti: si riscarica tutto) e si scaricano solo quelli con `ts>ultimo`. Ogni minuto un conteggio (`totalItems`) fa scattare il ricarico se sono arrivati punti dal telefono.
- **Profilo:** `pullSettings`/`pushSettings` sul campo `settings` dell'utente, con la stessa logica dell'app (`profile.js`). Il web non ha un tracker, ma conserva nel profilo la frequenza dei punti letta dal server (`remoteTracker`), altrimenti la cancellerebbe.
- **Esportazione:** scarica dal server tutti i campi e genera il file nel browser (`exportData`). **Non provato contro un PocketBase vero**: la prova è stata fatta con un finto server con gli stessi endpoint.

## 3. Backend (`pocketbase/`, `docker-compose.yml`)

- PocketBase in Docker, serve anche il sito (`--publicDir`, vedi *Versione web*), porta pubblicata solo su `127.0.0.1:8090` (l'esposizione pubblica è pensata via tunnel Cloudflare).
- Migrazioni: collection `points` (idempotente grazie all'indice unico `user + client_id`, regole solo per il proprietario),
  batch API attiva (`/api/batch`, 300 richieste), campo JSON `settings` sugli utenti per il profilo.
- Password: PocketBase vuole di default almeno 8 caratteri. La migrazione `1700000002` e `tools/setup_server.py` abbassano il minimo
  del campo a **5** (idempotenti). Anche i controlli dell'app (`web/account.js`, `web/index.html`) chiedono almeno **5** (dalla 0.30.3).
- `pocketbase/start-local.ps1` e `set-admin.ps1` servono per provarlo su Windows senza Docker (richiedono il binario in
  `pocketbase/bin/`, escluso da git).

## 4. Strumenti e pubblicazione

- `tools/setup_server.py`: prepara il server (utente, campi necessari).
- `tools/widget_preview.py`: rigenera le anteprime dei widget (selettore dei widget) dai layout veri.
- `tools/clean_points.py`: stessa pulizia dell'app sul server (conta; con `--apply` cancella dopo conferma, a lotti dall'API batch). Le regole sono duplicate in `PointStore.cleanup` e nello script: vanno tenute uguali.
- `tools/import_timeline.py`: importa nel server l'export "Spostamenti" di Google Maps (percorsi, soste, fix GPS).
- Non c'è più la pubblicazione su GitHub Pages (workflow tolto: Pages non era attivato e falliva a ogni push). Il sito si serve da PocketBase (vedi *Versione web*).

## 5. Sviluppo e prova

**Regola: dopo ogni modifica all'app, aggiorna sempre l'app sul telefono se la connessione di debug wireless è aperta** (compila, `adb install -r`, apri, controlla versione e arresti, vedi sotto e [CLAUDE.md](CLAUDE.md)). Se il telefono non è raggiungibile, chiedi IP e porta della schermata *Debug wireless*.

1. **Solo grafica:** `cd web && python -m http.server 8123`, poi `http://localhost:8123` (con `?sys=1` per il tema scuro).
2. **App sul telefono:** con JDK 17 e Android SDK (piattaforma 35), da `android/` eseguire `./gradlew assembleDebug`; l'APK è in
   `app/build/outputs/apk/debug/`. Si installa con il debug wireless (`adb pair`, `adb connect`, `adb install -r`).
3. L'APK di debug e quello `release` sono firmati con la chiave di debug (uso personale): gli aggiornamenti si installano sopra
   solo se compilati con la stessa chiave (`~/.android/debug.keystore`), cioè in pratica sulla stessa macchina.
4. **Dopo l'installazione:** `adb shell dumpsys package com.mymap.app | grep versionName`; errori all'avvio con `adb logcat -d -b crash`
   (e, per la pagina, `adb logcat -d | grep -i chromium`); tracking attivo se `adb shell dumpsys activity services com.mymap.app` elenca
   `LocationService`. Dopo `install -r` il servizio riparte da solo (`MY_PACKAGE_REPLACED`).

### Debug wireless

La porta cambia a ogni riattivazione (il pairing resta valido): `adb mdns services` mostra le porte `_adb-tls-connect` correnti (a volte anche
una vecchia), poi `adb connect IP:porta`. Il collegamento cade spesso quando il telefono va in pausa: se `adb devices` dice `offline`,
riattivare *Debug wireless* e rileggere la porta.

### Cambio di firma senza perdere i dati

Se `adb install -r` risponde `INSTALL_FAILED_UPDATE_INCOMPATIBLE` (build di un altro PC), la strada migliore è copiare la stessa
`debug.keystore`. Altrimenti, disinstallando si perdono i dati dell'app; l'APK di debug è *debuggable*, quindi con `run-as` si possono salvare e
rimettere. Procedura provata:

1. `adb shell am force-stop com.mymap.app`, poi salvare sul PC con `adb exec-out run-as com.mymap.app cat databases/points.db > points.db` (e
   `points.db-wal`, `points.db-shm`, `shared_prefs/mymap.xml`) e `adb exec-out run-as com.mymap.app tar cf - -C app_webview/Default "Local Storage" > ls.tar`
   (le impostazioni della pagina). Verificare il database con `sqlite3` (`integrity_check`) e, meglio, consolidarlo in un solo file con
   `PRAGMA wal_checkpoint(TRUNCATE)` su una copia.
2. `adb uninstall com.mymap.app`, `adb install app-debug.apk`, aprire l'app una volta (crea le cartelle) e `force-stop`.
3. Ripristinare **passando da `/data/local/tmp`**: `adb push file /data/local/tmp/` e poi `adb shell "run-as com.mymap.app cp /data/local/tmp/file databases/file"`
   (per la cartella, `tar xf` dalla stessa posizione). Con la app ferma e i tre file del database insieme (o il file consolidato senza `-wal`/`-shm`).
4. Riaprire l'app, controllare numero di punti e account, **cancellare i backup** (contengono le posizioni) sul PC e in `/data/local/tmp`.

Insidie incontrate: (a) sotto Git Bash per Windows impostare `MSYS_NO_PATHCONV=1`, altrimenti `/data/local/tmp/…` diventa `C:/Program Files/Git/data/…`;
(b) non far passare file binari grandi da `adb shell` con la redirezione dello standard input: arrivano troncati e il database ripristinato
risulta vuoto o incoerente (l'app può interrompersi all'avvio); (c) la disinstallazione azzera permessi e risparmio batteria, da concedere di nuovo.

## 6. Punti aperti

- La password dell'account è salvata in chiaro nelle preferenze dell'app (serve per il nuovo login); valutare Keystore.
- `usesCleartextTraffic` è attivo: con il tunnel HTTPS si può disattivare.
- Il buffer SQLite non elimina mai i punti già sincronizzati.
- "Continua con Google" resta spento finché il provider non è attivo in PocketBase (`GOOGLE_ENABLED` in `web/account.js`).
- Non ci sono test automatici.
- Gli stati visitati usano confini semplificati (1:50m, 740 KB in `web/countries-data.js`, anche nell'APK): micro-stati sotto i 2 km (Vaticano) e punti
  esattamente sul bordo di un porto possono non essere riconosciuti; Tuvalu non ha confini nel file. Non misurato il costo sul telefono (nel browser
  78.000 punti si assegnano in circa 0,3 s, 7 ms con le celle già note).
- Gli spostamenti (`computeTrips`) e gli elenchi si ricalcolano a ogni caricamento dei punti e si ricordano per riferimento all'array dei punti;
  con molti anni di dati non è misurato il costo sul telefono.
- Gli APK compilati su PC diversi non sono intercambiabili per via della firma di debug (vedi sezione 5).
- La tinta della mappa usa un filtro SVG e la sfocatura un filtro CSS: sui telefoni meno potenti possono rallentare la mappa. Non
  misurato sul dispositivo.
- Le tessere Esri e OpenStreetMap non richiedono chiave ma hanno i loro termini d'uso (uso personale e leggero); quelle CARTO ora
  richiedono una chiave e non si usano.
- Il feedback aptico dipende dalla vibrazione al tocco del telefono; il riavvio del tracking da background può essere negato da
  Android 12+ (in quel caso c'è la notifica del cane da guardia).
