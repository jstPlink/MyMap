# MyMap

App Android **personale** che registra la posizione in background e la mostra come scratch map, heatmap, percorsi, notti e posti
visitati, con statistiche. Nessuna parte social. I dati restano sul telefono o si sincronizzano con un server PocketBase proprio.

## Documentazione

- [Guida all'uso e ai parametri](docs/GUIDA.md): viste, personalizzazione, tracker, account, come si calcolano le cose, cosa fare se non registra.
- [Architettura](ARCHITETTURA.md): com'è fatta l'app, ponte nativo, tracking, dati e calcoli, backend, sviluppo.
- [Changelog](CHANGELOG.md): cronologia delle versioni.
- [Regole di lavoro](CLAUDE.md): cosa fare dopo ogni modifica (versione, documenti, aggiornare l'app sul telefono).

## Cartelle

- `android/` app Kotlin: tracking in background, buffer SQLite, sincronizzazione, WebView
- `web/` interfaccia (HTML, CSS, JS senza build), inclusa nell'APK e servita anche da PocketBase come sito (stesso indirizzo del database, vedi docker-compose.yml)
- `pocketbase/` migrazioni e script per il backend
- `tools/` preparazione del server e importazione dello storico di Google Maps
