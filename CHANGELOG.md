# Changelog

Versione app in `android/app/build.gradle.kts` (`versionName` e `versionCode`).
Ad ogni rilascio: alzare `versionCode` di 1, aggiornare `versionName` e aggiungere una voce qui.
La versione è mostrata in cima alla schermata dell'app.

## 0.1.0 (build 1) - 2026-09-30
- Prototipo: tracking GPS in background con LocationManager (senza Google Play Services).
- Frequenza adattiva (5 s in movimento, 60 s da fermo), scarto dei fix con precisione > 60 m.
- Buffer SQLite sul telefono e sync a batch verso PocketBase, idempotente tramite `client_id`.
- Backend PocketBase in Docker con collection `points` e batch API attivata.
