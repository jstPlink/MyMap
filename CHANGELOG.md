# Changelog

Versione app in `android/app/build.gradle.kts` (`versionName` e `versionCode`).
Ad ogni rilascio: alzare `versionCode` di 1, aggiornare `versionName` e aggiungere una voce qui.
La versione è mostrata in cima alla schermata dell'app.

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
