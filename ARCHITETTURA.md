# MyMap – Documentazione tecnica (v0.1.0, build 1)

Documento di analisi dello stato attuale del prototipo, ricavato dalla lettura del codice.

## 1. Cos'è

App Android **personale** che registra la posizione GPS in background e la invia a un backend **PocketBase** self-hosted. L'obiettivo di prodotto (da README) è: scratch map, luoghi salvati, strade percorse, senza alcuna parte social. Il prototipo copre solo la **raccolta dei dati**: tracking, buffer locale, sincronizzazione.

### Stato di avanzamento

| Componente | Stato |
|---|---|
| `android/` – app di tracking | Implementata (prototipo) |
| `pocketbase/` – schema e config | Implementato (collection `points`, batch API) |
| `worker/` – map matching, soste, scratch map | **Non esiste ancora** (citato nel README) |
| `web/` – dashboard mappa | **Non esiste ancora** (citato nel README) |

## 2. Architettura

```
┌────────────────────── Telefono Android ──────────────────────┐
│                                                               │
│  MainActivity ──start/stop──► LocationService (foreground)    │
│   (config, permessi,            │  LocationManager (GPS)      │
│    stato buffer)                ▼                             │
│                              PointStore (SQLite "points.db")  │
│                                 │  ogni 20 punti / a stop     │
│                                 ▼                             │
│                              SyncWorker (WorkManager)         │
│                                 │                             │
│                                 ▼                             │
│                               Api (HttpURLConnection)         │
└─────────────────────────────────┼─────────────────────────────┘
                                  │ HTTPS  POST /api/batch
                        (tunnel Cloudflare → 127.0.0.1:8090)
                                  ▼
                    PocketBase (Docker) – collection `points`
```

Flusso dati: **fix GPS → scarto se impreciso → insert in SQLite (synced=0) → worker di sync invia a batch da 200 → il server conferma → righe marcate synced=1**.

## 3. App Android (`android/`)

Kotlin, `minSdk 26`, `targetSdk/compileSdk 35`, package `com.mymap.app`. Dipendenze: solo `androidx.core-ktx` e `androidx.work`. **Nessun Google Play Services** (si usa `LocationManager` puro) e nessuna libreria HTTP/JSON esterna (`HttpURLConnection` + `org.json`). UI costruita interamente a codice, senza layout XML.

| File | Ruolo |
|---|---|
| `MainActivity.kt` | Schermata unica: versione, campi URL/email/password, pulsante "Salva e prova login", stato (punti totali, da sincronizzare, ultima sync, tracking attivo) aggiornato ogni 3 s, avvio/stop tracking, "Sincronizza ora", richiesta esclusione dal risparmio batteria. Gestisce i permessi a gradini: posizione precisa → "Consenti sempre" (background) → notifiche (Android 13+). |
| `LocationService.kt` | Foreground service (tipo `location`, notifica persistente). Richiede aggiornamenti dal solo `GPS_PROVIDER`. `START_STICKY`. Dettagli in §3.1. |
| `PointStore.kt` | Buffer SQLite (`points.db`, tabella `points`). `client_id` UNIQUE, colonna `synced`, indice `(synced, id)`. Metodi: `insert`, `pending(limit)`, `markSynced`, `counts`. Tutti `@Synchronized`. |
| `SyncWorker.kt` | `CoroutineWorker` con vincolo di rete connessa, backoff esponenziale da 30 s, lavoro univoco `"sync"` (policy REPLACE). Svuota il buffer a blocchi da 200; in caso di errore `Result.retry()`. Aggiorna `lastSync`. |
| `Api.kt` | Client PocketBase: `login()` (`/api/collections/users/auth-with-password`) e `sendBatch()`. Dettagli in §3.2. |
| `Prefs.kt` | `SharedPreferences` "mymap": URL server, email, password, token, userId, flag tracking, ultima sync, `deviceId` (UUID generato al primo uso). |
| `BootReceiver.kt` | Al `BOOT_COMPLETED` riavvia il servizio se il tracking era attivo (può fallire su Android 12+; l'eccezione è ignorata e l'utente deve riaprire l'app). |

### 3.1 Logica di tracking (`LocationService`)

- **Frequenza adattiva**
  - *Veloce*: ogni 5 s / 5 m minimi di spostamento.
  - *Lenta*: ogni 60 s / 25 m.
  - Passa a lenta dopo **6 fix consecutivi con velocità < 0,5 m/s**; torna veloce al primo fix in movimento.
- **Filtro qualità**: i fix con `accuracy > 60 m` vengono scartati (per non sporcare il futuro map matching).
- **Dati per punto**: `client_id` (UUID), `ts` (ms dal fix), lat, lon, accuracy, speed, bearing, altitude, provider, battery (%).
- **Trigger sync**: ogni 20 punti salvati e in `onDestroy`.
- Il commento in codice indica che questo è il punto di partenza per gli esperimenti sul consumo batteria.

### 3.2 Sincronizzazione e idempotenza (`Api`)

1. Se manca il token, login.
2. `POST /api/batch` con una richiesta `POST /api/collections/points/records` per punto (PocketBase limita a 300 richieste, configurato in migrazione).
3. `401/403` → nuovo login e un secondo tentativo (token scaduto).
4. `200` → tutti i punti confermati.
5. Altro errore (tipicamente un duplicato, dato che il batch è transazionale) → **fallback punto per punto**; un `400` che cita `client_id` conta come "già presente", quindi sincronizzato.

Il `client_id` + indice unico lato server rende l'invio **idempotente**: un batch rinviato dopo un errore di rete non crea duplicati.

## 4. Backend (`pocketbase/` + `docker-compose.yml`)

- Immagine `ghcr.io/muchobien/pocketbase:latest`, porta pubblicata **solo su 127.0.0.1:8090** (l'esposizione pubblica è pensata via tunnel Cloudflare), `restart: unless-stopped`, healthcheck su `/api/health`.
- Volumi: `./pocketbase/pb_data` (dati) e `./pocketbase/pb_migrations`.

### Migrazioni

**`1700000000_points.js`** – crea la collection `points`:

| Campo | Tipo | Note |
|---|---|---|
| `user` | relation → users | obbligatorio, cascade delete |
| `client_id` | text | obbligatorio, chiave di idempotenza |
| `ts` | number | epoch ms |
| `lat`, `lon` | number | obbligatori |
| `accuracy` (m), `speed` (m/s), `bearing`, `altitude` | number | opzionali |
| `provider` | text | gps / network / fused / dead_reckoning |
| `activity` | text | still / walking / vehicle… (**non ancora inviato dall'app**) |
| `battery` | number | % |
| `device_id` | text | |

Indici: `UNIQUE (user, client_id)` e `(user, ts)`.
Regole: list/view/delete solo per il proprietario; create solo se `body.user` = utente autenticato; **update vietato** (`null`).

**`1700000001_enable_batch.js`** – abilita `/api/batch` (disattivato di default) con `maxRequests = 300`.

## 5. Build e rilascio

- Versione in `android/app/build.gradle.kts` (`versionName`, `versionCode`), mostrata in cima alla schermata.
- Procedura (da `CHANGELOG.md`): ad ogni rilascio alzare `versionCode` di 1, aggiornare `versionName` e aggiungere una voce al changelog.
- La build `release` è firmata con la chiave **debug** (uso personale, sideload); minify disattivato.

## 6. Setup sintetico

1. `docker compose up -d` nella root; creare l'utente in PocketBase (admin UI su `:8090/_/`). Le migrazioni vengono applicate all'avvio.
2. Esporre il server (es. tunnel Cloudflare verso `127.0.0.1:8090`).
3. Compilare l'APK da `android/` e installarlo sul telefono.
4. Nell'app: inserire URL, email e password → "Salva e prova login" → "Avvia tracking" → concedere i permessi (incluso "Consenti sempre") ed escludere l'app dal risparmio batteria.

## 7. Osservazioni e punti aperti

Annotazioni emerse dall'analisi, da valutare nelle prossime versioni:

- **Password in chiaro** in `SharedPreferences` (serve per il re-login); valutare `EncryptedSharedPreferences`/Keystore o solo il token.
- **`usesCleartextTraffic="true"`**: permette HTTP non cifrato; con il tunnel Cloudflare si può passare a HTTPS obbligatorio.
- **Nessuna pulizia del buffer**: le righe `synced=1` restano per sempre in SQLite; manca una purga periodica.
- **`activity` non popolato** (nessun activity recognition) nonostante sia nello schema.
- **Solo `GPS_PROVIDER`**: in interni/canyon urbani non arrivano fix; nessun fallback network/fused.
- **`markSynced`** costruisce la query concatenando gli id (sicuro perché sono `Long` interni, ma fragile sopra i limiti SQLite di ~1000 variabili se i blocchi crescessero; oggi il limite è 200).
- **Fallback punto per punto** dopo un batch fallito può essere lento con molti duplicati (una richiesta per punto).
- **Nessun test** automatico nel repository.
- **README disallineato**: cita `worker/` e `web/` che non esistono ancora.
- Immagine Docker con tag `latest`: conviene fissare una versione di PocketBase per evitare cambi di comportamento nelle migrazioni.
- Il `BootReceiver` su Android 12+ può non riuscire ad avviare il foreground service da boot.

## 8. Roadmap implicita (dal README)

1. **worker/**: map matching dei punti grezzi sulle strade, rilevamento soste (luoghi), generazione scratch map.
2. **web/**: dashboard con mappa per visualizzare strade percorse e luoghi.
