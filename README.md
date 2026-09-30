# MyMap

App Android personale per registrare la posizione, con backend PocketBase in Docker.
Scratch map, luoghi salvati, strade percorse. Nessuna parte social.

- `android/`   app Kotlin (tracking in background, buffer SQLite, sync)
- `pocketbase/` migrazioni e dati del backend
- `worker/`    elaborazioni (map matching, soste, scratch map)
- `web/`       dashboard mappa
