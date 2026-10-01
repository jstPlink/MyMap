# Changelog

Versione app in `android/app/build.gradle.kts` (`versionName` e `versionCode`).
Ad ogni rilascio: alzare `versionCode` di 1, aggiornare `versionName` e aggiungere una voce qui.
La versione è mostrata in cima alla schermata dell'app.

## 0.15.1 (build 27) - 2026-10-01
- Tracker → Posizione adesso: pulsante "Registra la posizione adesso" che chiede subito la posizione (GPS e rete in parallelo, fino a 20 secondi) e la salva come punto. Anche il tasto "dove sono" della mappa ora chiede la posizione fresca invece dell'ultima nota.
- Parametri della frequenza dei punti riscritti a frase ("In movimento: un punto ogni N secondi", "Da fermo: N punti ogni X minuti") con il riepilogo dei punti all'ora.
- Feedback aptico a ogni tocco su pulsanti, schede e controlli, con impulso diverso per conferma ed errore (funziona se nelle impostazioni del telefono è attiva la vibrazione al tocco).

## 0.15.0 (build 26) - 2026-10-01
- Tracking più affidabile a telefono bloccato e fermo:
  - riavvio automatico del tracking all'apertura dell'app e dopo ogni aggiornamento o riavvio del telefono (prima restava fermo finché non si toccava "Avvia");
  - cane da guardia ogni ~15 minuti: se Android ferma il servizio lo riavvia, o manda una notifica per riavviarlo a mano;
  - "battito" da fermo: Tracker → Frequenza dei punti permette di scegliere in movimento un punto ogni N secondi e da fermo N punti ogni X minuti (default 1 ogni 10 minuti), senza il filtro dei 25 m che di notte lasciava ore senza punti; da fermo il provider di rete fa da riserva al GPS;
  - sensore di movimento significativo: da fermo si torna al campionamento fitto appena si riparte;
  - wake lock breve solo per il salvataggio di ogni punto (non continuo, per non scaricare la batteria).
- Tracker → Salute del tracking: stato del servizio, ultimo punto, permesso "sempre", risparmio batteria e notifiche, con i pulsanti per correggere. Sulla mappa compare "Tracking fermo" se il tracking dovrebbe essere attivo ma non registra.

## 0.14.1 (build 25) - 2026-10-01
- Statistiche: i grafici a barre tornano visibili (le colonne avevano larghezza zero per una regola CSS ereditata da una versione precedente).
- Percorsi per frequenza: niente più errore se si cambia un'impostazione mentre la mappa non è visibile.

## 0.14.0 (build 24) - 2026-10-01
- Mappa a tutta larghezza (fino ai bordi destro e sinistro); tolti logo, nome e targhetta "attivo" dall'intestazione.
- La scheda Tracker è ora una sezione di Impostazioni (aperta di default); la barra in basso ha tre schede.
- Tolti i punti totali e l'ultimo punto dalla scheda della mappa; restano km e versione.
- I km sono uguali in tutte le viste: si calcolano sempre sugli stessi dati (prima Percorsi e Heatmap usavano i punti alleggeriti e davano numeri diversi).
- Nella vista Heatmap non c'è più la descrizione.
- Riepiloghi di Notti, Posti e Scratch con numeri grandi ed etichette, e un suggerimento breve.
- Otto stili di mappa tra cui scegliere: Colorata, Pastello, Seppia, OpenStreetMap, Topografica, National Geographic, Satellite, Semplice (grigia).
- Heatmap e percorsi: lo spessore (raggio per la heatmap) si imposta a tre livelli di zoom, ciascuno con il suo valore in px; tra un livello e l'altro si interpola. Sostituisce raggio e spessore singoli.
- Preset personalizzati per esagoni, heatmap, percorsi, notti e aspetto (tema e mappa): Salva, Elimina e scelta dal menu in cima a ogni sezione; si salvano anche nel profilo.

## 0.13.2 (build 23) - 2026-10-01
- Sulla mappa, in tutte le viste, compare il livello di zoom (es. "Zoom 12,8 · 14 km", con la larghezza della mappa in km) e si aggiorna mentre ingrandisci.

## 0.13.1 (build 22) - 2026-10-01
- Percorsi: gli stessi controlli della heatmap. Nuovo stile "Per frequenza" (più passaggi sullo stesso tratto = più caldo) con sfocatura, quantità di calore, opacità minima e gradiente a quattro colori con i preset della heatmap; "Dettaglio" regola la semplificazione dei tratti. Lo stile "Colore unico" resta quello di prima (colore, spessore, opacità).

## 0.13.0 (build 21) - 2026-10-01
- Scratch: copertura più scura e contrastata.
- Mappa di base colorata (Esri Street Map ammorbidita) di default; Impostazioni → Aspetto → Mappa permette di tornare allo stile semplice grigio. Tema scuro incluso.
- Esagoni della scratch map regolari: angoli arrotondati tutti uguali e lati dritti, al posto del lisciamento che li deformava.
- Cambiando vista o filtro la mappa si centra sulla tua posizione con 100 km di raggio (200 km di larghezza, zoom frazionario).

## 0.12.2 (build 20) - 2026-10-01
- Oltre 365 giorni durate e conteggi si scrivono in anni, mesi e giorni (es. "2 anni, 3 mesi e 12 giorni"; un anno = 365 giorni, le parti a zero si omettono). Sostituisce il formato "anni e giorni" della 0.12.1.

## 0.12.1 (build 19) - 2026-10-01
- Oltre 365 giorni durate e conteggi si scrivono come "X anni e Y giorni" (un anno = 365 giorni): giorni con dati, giorni a casa o lontano, serie di giorni, tempo in movimento e nei posti, notti. Sotto i 365 restano in giorni.

## 0.12.0 (build 18) - 2026-10-01
- Cambiando vista o filtro la mappa non inquadra più tutto lo storico: resta sulla tua posizione con circa 300 km di diametro.
- Posti: con lo zoom lontano i posti vicini si fondono in gruppi (visite totali e numero di posti); toccandoli la mappa si avvicina. Ora si gestiscono fino a 1500 posti.
- Percorsi: ogni tratto si semplifica in base allo zoom (Ramer-Douglas-Peucker, ~1,5 px), si disegnano solo i tratti visibili e i puntini delle soste compaiono da zoom 12.
- Heatmap: i punti si accorpano in celle di pochi pixel (con peso) e i punti intermedi si fanno solo quanto serve allo zoom, così da lontano resta leggera.

## 0.11.1 (build 17) - 2026-10-01
- Password di almeno 5 caratteri (creazione account e cambio password). Il minimo lo impone anche PocketBase, che di default vuole 8: va abbassato con `python tools/setup_server.py ...` (o dal pannello: users, campo password, lunghezza minima).
- Notti: con lo zoom lontano le lune vicine si fondono in un gruppo (totale notti e numero di luoghi); toccandolo la mappa si avvicina e il gruppo si apre.

## 0.11.0 (build 16) - 2026-10-01
- Impostazioni nel profilo: con un account sul server, impostazioni e nomi dei posti si salvano nel profilo e si ritrovano dopo una reinstallazione o su un altro telefono (vince la modifica più recente). Serve il campo JSON `settings` sugli utenti: `python tools/setup_server.py ...` lo aggiunge (o la migrazione `1700000002_user_settings.js`). Nell'Account compare lo stato "Salvate nel profilo".
- Notti: nuova formula. Una notte è registrata se, tra le 23:00 e le 09:00, ci sono almeno 2 punti entro il raggio scelto (default 300 m); la notte prende la data della sera. Le impostazioni delle notti tornano ai nuovi valori.
- Mappa di base semplice (CARTO chiara o scura) al posto di OpenStreetMap standard.
- Scratch map: copertura semitrasparente, senza bordi e con contorni arrotondati (gli esagoni adiacenti si fondono in zone morbide).
- Tema chiaro con toni più morbidi.

## 0.10.3 (build 15) - 2026-10-01
- Impostazioni → Account: "Cambia password" (password attuale, nuova e conferma). Disponibile per gli account con email; dopo il cambio l'app rifà il login da sola.

## 0.10.2 (build 14) - 2026-10-01
- Accesso: "Accedi" e "Nuovo account" sono schede separate; il nuovo account chiede di ripetere la password.
- Il database sul telefono è la scelta predefinita nella schermata di accesso.
- "Continua con Google" resta grigio finché il provider non è attivo in PocketBase (si riattiva con `GOOGLE_ENABLED` in `web/account.js`).
- L'icona dell'app compare anche nell'intestazione e nella schermata di accesso, dove si vede anche la versione.

## 0.10.1 (build 13) - 2026-10-01
- Accesso: pulsante "Password dimenticata?". Scrivi URL ed email, tocca il pulsante e il server manda l'email con il link per scegliere una nuova password. Serve la posta (SMTP) configurata in PocketBase.

## 0.10.0 (build 12) - 2026-10-01
- Nell'app compare solo la versione (es. v0.10.0), senza il numero di build.
- Icona dell'app: segnaposto bianco su esagono con sfondo sfumato azzurro-viola, anche monocromatica per le icone a tema di Android 13+.
- Tema chiaro: in Impostazioni → Aspetto si sceglie Chiaro, Scuro o Come il telefono (si applica subito, comprese le barre di sistema).
- Percorsi: colore, spessore e opacità delle linee regolabili nelle impostazioni, con anteprima.
- Nuovo filtro del periodo: un solo pulsante sulla mappa mostra il periodo attivo e apre un pannello con scorciatoie (Oggi, Ieri, Ultimi 7 e 30 giorni, Questo mese, Mese scorso, Quest'anno, Tutto), anno/mese/giorno, da data a data e fascia oraria (es. 07:00-09:00 per i tragitti del mattino).
- Impostazioni raggruppate in sezioni richiudibili che ricordano se erano aperte.

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
