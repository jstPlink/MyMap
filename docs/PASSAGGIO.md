# MyMap – Note di passaggio tra sessioni (2026-10-05)

> **Nota storica:** scritta il 2026-10-05 e non aggiornata. Il problema sul NAS descritto sotto (sito che dà 404) può essere stato risolto dopo; l'indirizzo del server è poi diventato `https://mymap.fplinio.it` (0.30.4). Per lo stato attuale valgono CHANGELOG.md e ARCHITETTURA.md.

Stato del lavoro al momento del passaggio, per chi riprende (ad esempio una sessione con accesso SSH al NAS). Non contiene credenziali.
Per l'uso dell'app vedi [GUIDA.md](GUIDA.md), per com'è fatta [../ARCHITETTURA.md](../ARCHITETTURA.md), per le versioni [../CHANGELOG.md](../CHANGELOG.md).

## Problema aperto: il sito sul NAS non carica

> **Risolto (2026-10-05).** La cartella `web/` sul NAS era vuota e il container era stato ricreato da un altro compose. Ora il progetto è solo in `/volume1/docker/mymap` (database, `web/` e compose), il sito risponde sia da LAN sia dal tunnel. Quando cambia `web/` va ricopiata sul NAS (`/volume1/docker/mymap/web`); Cloudflare tiene in cache i file 4 ore (*Purge Everything*). Il testo qui sotto è la cronologia.

Dopo `git pull && docker compose up -d` sul NAS, il sito non si apre. Verificato dall'esterno, attraverso il tunnel Cloudflare (`https://pocketbase.fplinio.it`, la stessa `SERVER_URL` dell'app in `android/app/build.gradle.kts`):

| Richiesta | Risposta |
|---|---|
| `/api/health` | 200, `API is healthy.` (PocketBase gira) |
| `/`, `/index.html`, `/native-web.js` | 404 `{"message":"File not found."}` |

Quindi PocketBase risponde ma non trova i file del sito. Ipotesi, in ordine di probabilità (nessuna ancora verificata):
1. Il container è ancora quello vecchio, senza `--publicDir=/pb_public` e senza il montaggio `./web:/pb_public:ro` (`docker compose up -d` lanciato in una cartella diversa dal `git pull`, o container non ricreato).
2. La cartella `web/` sul NAS manca o è vuota (il montaggio punta a una cartella senza `index.html`).
3. La versione di PocketBase nell'immagine (`ghcr.io/muchobien/pocketbase:latest`) gestisce `--publicDir` o `--indexFallback` in modo diverso dal previsto.
4. Cloudflare tiene in cache il 404: la risposta per `native-web.js` ha `Cache-Control: max-age=14400` e `cf-cache-status: MISS`. Dopo la correzione provare prima da LAN (`http://NAS:9090`), poi, se serve, *Caching → Purge Everything* in Cloudflare.

Controlli da fare sul NAS, nella cartella del progetto:
```bash
git log --oneline -1 && ls web | head -5
docker inspect mymap-pocketbase --format '{{.Config.Cmd}}'     # deve contenere --publicDir=/pb_public
docker exec mymap-pocketbase ls /pb_public                     # deve elencare index.html ecc.
docker compose up -d --force-recreate pocketbase               # se il comando non ha --publicDir
docker logs mymap-pocketbase --tail 50
```
Con `curl` il tunnel risponde (con un normale User-Agent). Attenzione: Cloudflare blocca con errore 1010 il nome predefinito di Python (`Python-urllib`): gli script in `tools/` devono mandare un `User-Agent` diverso (come fa `tools/clean_points.py`).

Se il sito si apre, controllare nell'ordine: schermata di accesso (senza campo URL), accesso con l'account dell'app, caricamento dei punti (la prima volta decine di migliaia, poi solo i nuovi), vista corrente e impostazioni sincronizzate con l'app, cambio password, esportazione.

## Cosa è stato fatto in questa serie di lavori

- **0.30.0 (build 71) – versione web.** PocketBase serve anche la cartella `web/` (`--publicDir`, `./web` montata in sola lettura nel compose). Il sito riconosce PocketBase da `/api/health` (`isPocketBaseHost()` in `web/native-web.js`) e usa `makeWebNative()`: accesso con email e password, punti dall'API a pagine di 500 (6 in parallelo) con cache IndexedDB, profilo (`settings`), cambio password, esportazione dal server. Niente tracciamento. Dettagli in ARCHITETTURA.md, sezione *Versione web*.
- **Provato solo contro un finto server** con gli stessi endpoint (4.000 punti finti, ora cancellato), mai contro un PocketBase vero: login, caricamento, cache incrementale, profilo, cambio password, esportazione, scadenza del token. Dopo l'integrazione con le versioni 0.29.x di un'altra serie di modifiche (vista *Luoghi*, vista *Punti*, widget) il sito non è stato riprovato nel browser: solo controllo di sintassi e compilazione dell'APK.
- L'APK 0.30.0 compila ma **non è mai stato installato né provato** sul telefono (non era collegato in debug).
- **Workflow GitHub Pages tolto** (`.github/workflows/pages.yml`): Pages non era attivato nel repository (`configure-pages: Not Found`) e il workflow falliva a ogni push. Le vecchie esecuzioni rosse restano nella cronologia delle Actions.
- Un `mymap.csv` scaricato per errore durante le prove (dati finti del finto server) può essere cancellato.
- Due commit sono stati pubblicati su `main`: `6f326fd` (versione web, 0.30.0) e `27739ea` (workflow Pages tolto). Il remoto aveva già i commit fino alla 0.29.21 di un'altra sessione; il mio è stato rimesso sopra con un rebase (conflitti solo in versioni, changelog, architettura e `style.css`, risolti tenendo entrambe le parti).

## Cose da sapere

- Le regole di pulizia dei punti sono duplicate in `PointStore.cleanup` (Kotlin) e `tools/clean_points.py`; la pulizia sul server è già stata eseguita dall'utente (con backup di PocketBase fatto prima).
- Nel sito `session.url` è l'origine della pagina; i campi `l-url` e la scelta "su questo telefono" sono nascosti da CSS (`:root[data-web]`). Il tracker, la salute del tracking e il pulsante di pulizia non esistono nel web.
- `docker-compose.yml`: `command` con `--publicDir=/pb_public` e volume `./web:/pb_public:ro`; `pocketbase/start-local.ps1` usa `--publicDir="$root\..\web"`.
- Il database dell'app non contiene la password: nel web restano solo token, id ed email in `localStorage` (`mymap.web`).
- Stato di Git: nessun lavoro in sospeso oltre a questo file (`docs/PASSAGGIO.md`), non ancora committato.
