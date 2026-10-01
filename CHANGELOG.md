# Changelog

Versione app in `android/app/build.gradle.kts` (`versionName` e `versionCode`).
Ad ogni rilascio: alzare `versionCode` di 1, aggiornare `versionName` e aggiungere una voce qui.
La versione è mostrata in cima alla schermata dell'app.

## 0.9.0 (build 11) - 2026-10-01
- Scratch map invertita: la mappa è coperta e gratti i posti in cui sei stato. Esagoni da 100 m minimo, con dimensione regolabile per ogni livello di zoom nelle impostazioni.
- Nuove viste: Notti (dove hai dormito) e Posti visitati. Heatmap regolabile (raggio, sfocatura, calore, densità, gradiente).
- Filtri: anno/mese/giorno, periodo da data a data e tasto Oggi; pulsante per rimuovere tutti i filtri.
- Statistiche: righe su una sola riga, nomi dei luoghi al posto delle coordinate (OpenStreetMap Nominatim, disattivabile), 10 giorni più lunghi, filtro per anno e mese, asse verticale con i valori nei grafici, sezioni Notti e Posti visitati.
- Account: accesso con email (anche creazione dell'account) o con Google, scelta tra database proprio (URL) e database locale nel telefono, logout nelle impostazioni. I punti sono associati all'account.
- Notti: punti minimi e raggio massimo regolabili. Posti: puoi dare o cambiare il nome dei posti (suggerimento da OpenStreetMap), con elenco e cancellazione nelle impostazioni.
- Esportazione dei dati in CSV, GPX o JSON dalle impostazioni.
- `tools/import_timeline.py` importa anche le soste di Google (opzione `--only takeout-visit` per aggiungerle soltanto).

## 0.7.0 (build 9) - 2026-10-01
- Scratch map con esagoni adattivi: il più piccolo è largo 200 m e le dimensioni crescono allontanando lo zoom, così il disegno resta leggero. L'area grattata si calcola sempre sugli esagoni piccoli.
- Viste della mappa riordinate: Scratch (principale), Heatmap, Percorsi. Tolta la vista Soste, che resta nelle statistiche.
- Nuova grafica: tema chiaro o scuro secondo il telefono, barra di navigazione fluttuante con icone, controlli trasparenti sopra la mappa, card arrotondate, mappa ammorbidita.
- Statistiche ampliate: giri della Terra, velocità media, tempo in movimento, giorni più lunghi, giorni a casa o lontani, estremi nord/sud/est/ovest, zone nuove scoperte per mese, km per anno, ora di punta, stagione più viaggiata, km nel weekend.

## 0.6.1 (build 8) - 2026-10-01
- Avvio molto più leggero: l'interfaccia restava bloccata circa 2 secondi per colpa del disegno su canvas nella WebView; ora si usa SVG.
- La mappa disegna solo ciò che si vede, semplificato in base allo zoom, e si ridisegna quando la sposti.
- I punti passano dall'app alla pagina in formato binario compatto (1 MB invece di 6,5 MB di testo) e si caricano una volta sola.
- Le statistiche si ricalcolano solo se ci sono punti nuovi; lo stato del tracker si aggiorna solo quando la scheda è aperta.

## 0.6.0 (build 7) - 2026-10-01
- All'apertura la mappa si centra su dove ti trovi (con pulsante per tornarci).
- Scratch map con esagoni azzurri.
- Filtri per anno, mese e giorno.
- Nuova scheda Statistiche: km totali e per mese/ora/giorno della settimana, record, giorni consecutivi, punto più lontano da casa, esagoni visitati, luoghi dove passi più tempo.

## 0.5.0 (build 6) - 2026-10-01
- La mappa ha quattro viste: Percorsi, Heatmap (percorsi più ripetuti), Scratch (zone visitate, celle da ~500 m) e Soste (i luoghi dove hai passato più tempo).
- Tutte rispettano il filtro per giorno.

## 0.4.1 (build 5) - 2026-10-01
- La mappa mostra tutti i punti del buffer (prima solo gli ultimi 20.000); i punti isolati sono disegnati come pallini.

## 0.4.0 (build 4) - 2026-10-01
- Il server di default è https://pocketbase.fplinio.it (resta modificabile dalle impostazioni); login con email e password dell'utente come prima.
- Lo storico dei punti si scarica all'avvio dell'app, senza passi manuali.

## 0.3.0 (build 3) - 2026-10-01
- Dopo il login l'app scarica dal server lo storico dei punti (anche quelli importati) nel buffer locale, così la mappa li mostra.
- Nuovo `tools/import_timeline.py`: importa in PocketBase l'export "Spostamenti" di Google Maps (76.602 punti, mar 2025 - set 2026).
- Aggiunto `docker-compose.nas.yml` per PocketBase sul NAS (porta 9090).

## 0.2.0 (build 2) - 2026-09-30
- Nuova interfaccia web (cartella `web/`) mostrata nell'app tramite WebView: schede Mappa, Tracker, Impostazioni.
- La mappa nell'app legge i punti dal buffer locale del telefono, anche senza server raggiungibile.
- Tracking, buffer e sync invariati; la vecchia schermata nativa � sostituita dal ponte `window.MyMapNative`.

## 0.1.0 (build 1) - 2026-09-30
- Prototipo: tracking GPS in background con LocationManager (senza Google Play Services).
- Frequenza adattiva (5 s in movimento, 60 s da fermo), scarto dei fix con precisione > 60 m.
- Buffer SQLite sul telefono e sync a batch verso PocketBase, idempotente tramite `client_id`.
- Backend PocketBase in Docker con collection `points` e batch API attivata.
