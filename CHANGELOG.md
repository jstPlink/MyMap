# Changelog

Versione app in `android/app/build.gradle.kts` (`versionName` e `versionCode`).
Ad ogni rilascio: alzare `versionCode` di 1, aggiornare `versionName` e aggiungere una voce qui.
La versione è mostrata in cima alla schermata dell'app.

## 0.32.11 (build 88) - 2026-10-06
- **Riquadri dei widget ancora meno contrastati (-20%):** l'opacità di `widget_cell` scende da 25/255 (`#19FFFFFF`) a 20/255 (`#14FFFFFF`), circa l'8%.

## 0.32.10 (build 87) - 2026-10-06
- **Riquadri dei widget ancora meno contrastati (-10%):** l'opacità di `widget_cell` scende da 28/255 (`#1CFFFFFF`) a 25/255 (`#19FFFFFF`), circa il 10%.

## 0.32.9 (build 86) - 2026-10-06
- **Riquadri dei widget meno contrastati:** `widget_cell` passa da bianco al 18% (`#2EFFFFFF`) a bianco all'11% (`#1CFFFFFF`), così i riquadri si staccano meno dallo sfondo del widget (chiaro e scuro).

## 0.32.8 (build 85) - 2026-10-06
- **Widget nello stile di Bilancio:** sfondo teal (`#0F766E`, angoli 22 dp; nella versione scura resta il fondo grigio scuro), dati dentro riquadri bianchi trasparenti con angoli 14 dp (*km*, *posti*, *movimento* e *tracker*; `widget_cell`), niente più divisori e riflesso lucido, testi bianchi (titoli 12 sp con `#E6FFFFFF`, cifre 16,5 sp in grassetto). Il rosso diventa **ambra** (`#FBBF24`) con testi in teal scuro: cella tracker senza punti da più di 6 minuti e valore del widget *ultimo punto* oltre 30 minuti. Il verde del movimento è più chiaro (`#86EFAC`). Anteprime rigenerate.

## 0.32.7 (build 84) - 2026-10-06
- **Preparazione alla pubblicazione:** l'indirizzo di partenza del server non è più scritto nel codice: `SERVER_URL` si legge da `mymap.serverUrl` in `android/local.properties` (vuoto se manca). La password dell'account è cifrata con il Keystore di Android (`SecretBox.kt`) invece di restare in chiaro nelle preferenze; quella già salvata si migra da sola. Il traffico HTTP in chiaro è ammesso solo nelle build di debug (`network_security_config`); la release usa solo HTTPS.

## 0.32.6 (build 83) - 2026-10-06
- **Feedback aptico aumentato del 15%** rispetto alla 0.32.5: `HAPTIC_SCALE` da 0,595 a 0,684 (0,595 × 1,15; praticamente il valore della 0.32.4, 0,7). Sul motore acceso/spento di questo telefono: tocco 10 ms, conferma 20 ms, errore due impulsi da 23 ms.

## 0.32.5 (build 82) - 2026-10-06
- **Feedback aptico ridotto ancora del 15%:** `HAPTIC_SCALE` passa da 0,7 a 0,595 (0,7 × 0,85, cioè circa il 60% dei valori di base). Sul motore acceso/spento di questo telefono gli impulsi diventano: tocco 15 → 8 ms, conferma 30 → 17 ms, errore due impulsi da 35 → 20 ms. Sotto circa 10 ms il tocco può diventare poco percettibile su alcuni motori: se non lo senti, `HAPTIC_SCALE` si alza.

## 0.32.4 (build 81) - 2026-10-06
- **Feedback aptico più leggero (−30%):** impulsi propri al 70% (`HAPTIC_SCALE` in `MainActivity.kt`). Con un motore a ampiezza regolabile si usa il 70% dell'ampiezza massima; su un motore acceso/spento (il telefono di prova dichiara solo `ON_CALLBACK`) si accorcia la durata al 70%: tocco 15 → 10 ms, conferma 30 → 21 ms, errore due impulsi da 35 → 24 ms. Il feedback di sistema usato prima non aveva un controllo di intensità né una durata nota, quindi il "−30%" è sui valori di base scelti e non sul vecchio valore, che non è misurabile. Resta rispettata l'impostazione di Android *vibrazione al tocco*; senza motore si ripiega sul feedback di sistema. Nuovo permesso `VIBRATE`.

## 0.32.3 (build 80) - 2026-10-06
- **Tolto *Riscarica lo storico dal server*** (e la scheda *Dati* che lo conteneva): il telefono carica già ogni punto sul server e lo storico si scarica da solo al primo accesso, quindi il pulsante non serviva. Tolti anche `repullHistory` dal ponte nativo e `Native.repull`. Resta *Esporta i dati*.

## 0.32.2 (build 79) - 2026-10-06
- **Elimina account più difficile da toccare:** non è più un pulsante ma un piccolo testo sottolineato in fondo alle Impostazioni, lontano da *Esci dall'account*. Le conferme sono due: prima si scrive ELIMINA, poi una seconda finestra ("Ultima conferma… Sì, elimina per sempre").

## 0.32.1 (build 78) - 2026-10-06
- **Niente rotazione:** l'app resta sempre in verticale (`android:screenOrientation="portrait"` su `MainActivity`), anche se il telefono viene girato.

## 0.32.0 (build 77) - 2026-10-06
- **Indicatore della posizione sull'ultimo punto:** il pallino azzurro sta sempre sull'ultimo punto salvato (non più sulla posizione del GPS in questo momento) e si sposta da solo quando arrivano punti nuovi. *Dove sono* centra la mappa su quel punto, senza chiedere una posizione fresca (per quella resta *Registra la posizione adesso* nel Tracker).
- **Filtro e pannello degli spostamenti (vista Percorsi):** il pannello in basso ora segue il filtro del periodo: elenca solo gli spostamenti che iniziano nel periodo scelto e i pulsanti ‹ › passano tra i giorni di quel periodo (prima mostrava sempre tutti i giorni). Le altre viste già seguivano il filtro.
- **Impostazioni:** la sezione *Account* è in fondo; *Esci dall'account* è rosso (prima il fondo dei pulsanti secondari lo copriva); nuovo pulsante **Elimina account** (rosso, solo con un account sul server): chiede di scrivere ELIMINA e cancella dal server l'utente con tutti i suoi punti e le impostazioni (relazione a cascata), poi svuota i dati locali e torna alla schermata di accesso. Nuovo `Api.deleteAccount`, ponte `deleteAccount(id)`, `Native.deleteAccount` (anche nel sito).
- **Statistiche:** tolta la scheda *Zone nuove per mese*.

## 0.31.0 (build 76) - 2026-10-05
- **Nuovo layout del sito su schermi larghi (≥ 1000 px).** In qualsiasi browser (l'app Android non cambia): a sinistra una colonna con logo e versione, menu verticale (Mappa, Statistiche, Impostazioni) e i controlli della mappa (viste, periodo con scorciatoie, pannello dati, *Personalizza la vista* e *Dove sono* con la scritta); a destra la mappa a tutta altezza, con il livello di zoom in alto a sinistra e il pannello di personalizzazione che si apre a destra. Statistiche su tre colonne con i blocchetti in cima; Impostazioni su due colonne. Stesso stile (colori, chip, contorni). Sotto i 1000 px il sito resta com'era. Nuovi `web/web.css` e `web/web-layout.js` (sposta gli elementi senza cambiare gli id).
- **Server locale per provare l'interfaccia:** `python tools/dev_server.py` (dati demo, con il layout del sito; `?layout=web` nasconde anche tracker e simili come online) oppure `--proxy http://IP:9090` per usare i dati veri dal PocketBase. `.claude/launch.json` lo avvia dal pannello.

## 0.30.4 (build 75) - 2026-10-05
- **Nuovo indirizzo del server:** `https://mymap.fplinio.it` (prima `pocketbase.fplinio.it`, che non esiste più). È il valore di partenza dell'app (`SERVER_URL`) e, se nel telefono è salvato il vecchio indirizzo, `Prefs.serverUrl` lo converte da solo. Aggiornato anche `tools/import_timeline.py`.

## 0.30.3 (build 74) - 2026-10-05
- **Password da almeno 5 caratteri:** i controlli di creazione account e cambio password (sito e app) chiedono 5 caratteri invece di 8, come il server dopo `setup_server.py` o la migrazione `1700000002`.

## 0.30.2 (build 73) - 2026-10-05
- **Nuovi valori di partenza.** *Aspetto:* tema scuro, mappa topografica, saturazione 150, contrasto 95. *Scratch:* zoom 3 → 50 km, 13 → 170 m, 16 → 50 m. *Heatmap:* spessori 5 / 3 / 2 px a zoom 7 / 11 / 15, sfocatura 1, quantità di calore 1, opacità minima 16, densità 1, gradiente fuoco. *Percorsi:* stile per frequenza, spessori 1,5 / 2,5 / 5 px, opacità 0, sfocatura 1, quantità di calore 6, opacità minima 30, dettaglio 1, gradiente fuoco.
- **Una sola volta** anche le impostazioni già salvate di aspetto, scratch, heatmap e percorsi tornano a questi valori e si aggiornano nel profilo del server; notti, nomi, preset, posti nascosti e vista corrente non cambiano (`DEFAULTS_V` in `prefs.js`: da alzare quando i valori di partenza cambiano ancora).

## 0.30.1 (build 72) - 2026-10-05
- **Schermata di accesso:** il pulsante *Password dimenticata?* era quasi invisibile (azzurro chiaro su fondo chiaro); ora ha il colore del testo ed è sottolineato.

## 0.30.0 (build 71) - 2026-10-05
- **Versione web.** Lo stesso `docker compose up -d` che avvia il database serve anche il sito: PocketBase espone la cartella `web/` (`--publicDir`), quindi aprendo l'indirizzo del server (porta 9090) si vede l'interfaccia, e l'app Android si collega allo stesso indirizzo: stesso account, stessi punti. Nel sito: accesso con email e password (anche nuovo account e "password dimenticata"), tutte le viste e le statistiche, impostazioni, preset e nomi sincronizzati con l'app, cambio password, esportazione CSV/GPX/JSON dal server. Non c'è il tracciamento (tracker, salute, frequenza, pulizia punti, "registra la posizione adesso").
- I punti si scaricano dall'API a pagine di 500, 6 in parallelo, e si ricordano nel browser (IndexedDB): dalla seconda volta si scaricano solo i nuovi. Il sito controlla ogni minuto se ne sono arrivati.
- Nuovo `web/native-web.js` (stessa interfaccia di `native.js`); il sito capisce da solo di essere servito da PocketBase (`/api/health`). Con `python -m http.server` restano i dati demo (`?demo=1` li forza).
- Tolto il workflow `pages.yml` (pubblicazione su GitHub Pages): Pages non era attivato nel repository e il workflow falliva a ogni push.

## 0.29.21 (build 70) - 2026-10-04
- **Viste Notti e Posti tolte:** resta la vista accorpata *Luoghi* (le viste salvate Notti e Posti diventano Luoghi; il widget *posti* apre Luoghi).
- **Nuova vista di prova "Punti":** mostra tutti i punti salvati (puliti) su una tela unica e veloce (solo i punti visibili, al massimo uno ogni 3 px, ridisegno a ogni movimento). Filtri per **ora** (dalle/alle) e **accuratezza massima**, *Colora per ora* con legenda, *Notti rilevate* come pallini arancioni; toccando un punto si vede ora e accuratezza.
- **Parametri per provare le notti** (Personalizza → Notti, valgono anche per statistiche e Luoghi; 0 = disattivato): *Accuratezza massima*, *Durata minima* del gruppo, *Punti nella fascia centrale* con le sue ore (01–05), *Unione dei luoghi* (400 m). I default lasciano il calcolo com'era.

## 0.29.20 (build 69) - 2026-10-04
- **Pallino delle notti:** 25% più grande (da 11 a 14 px).

## 0.29.19 (build 68) - 2026-10-04
- **Pallino delle notti:** una sola dimensione (11 px), anche per i gruppi accorpati.
- **Vista Luoghi:** nel pannello in basso due caselle, *Notti* e *Posti*, mostrano o nascondono ciascun livello; la scelta resta salvata (`mymap.bothShow`).

## 0.29.18 (build 67) - 2026-10-04
- **Rombi dei posti:** dimensione fissa di 9 px (prima 12, 25% in meno), uguale anche per i gruppi accorpati.

## 0.29.17 (build 66) - 2026-10-04
- **Posti celesti:** i rombi dei posti senza nome passano da rosso a celeste (#4fc3f7); rinominati restano bianchi.
- **Accorpamento ridotto ancora:** celle di fusione dimezzate di nuovo: Notti 15 px, Posti 14 px, Luoghi 32 px, così i posti restano separati più a lungo (zoom su una città).

## 0.29.16 (build 65) - 2026-10-04
- **Posti rossi:** i rombi dei posti senza nome sono rossi (#dc3545), così non si confondono con le notti arancioni; rinominati restano bianchi.
- **Accorpamento dimezzato:** le celle di fusione con lo zoom lontano sono la metà: Notti 30 px (prima 60), Posti 28 px (56), Luoghi 65 px (130).

## 0.29.15 (build 64) - 2026-10-04
- **Notti:** pallino arancione con saturazione 90% (`hsl(27 90% 60%)`); i posti restano con l'arancione più tenue.
- **Posti a rombo:** il triangolino diventa un rombo (12 px, gruppi 16 px).
- **Gruppi senza numero:** i pallini e i rombi accorpati non mostrano più il numero; si riconoscono dalla dimensione maggiore.
- **Vista Luoghi:** i gruppi si formano prima con lo zoom lontano (celle da 130 px invece di 60 e 56).

## 0.29.14 (build 63) - 2026-10-04
- **Pallini più piccoli e discreti:** arancione meno saturo (#e39b5f), pallino 11 px (gruppi 20 px) con contorno da 1 px.
- **Posti a triangolini:** nella vista Posti ogni posto è un triangolino (13 px, gruppi 22 px con il numero di posti), stessi colori: arancione senza nome, bianco rinominato. Non variano più con il tempo passato.
- **Vista sperimentale "Luoghi":** nuova targhetta che unisce Notti (pallini) e Posti (triangolini) sulla stessa mappa, con riepilogo e i due elenchi (`drawBoth`).

## 0.29.13 (build 62) - 2026-10-04
- **Notti e Posti, icone semplificate:** un solo pallino per luogo, senza numeri: **arancione** se il posto non è stato rinominato, **bianco** se ha un nome (contorno scuro sottile). I gruppi (zoom lontano) sono un pallino più grande con il numero di luoghi, bianco solo se tutti sono rinominati. Notti e visite restano nel popup e negli elenchi.

## 0.29.12 (build 61) - 2026-10-04
- **Pannello dati comprimibile:** il pannello in basso della mappa ha in alto una freccia che lo riduce a una sola barretta (e lo riespande); la scelta resta salvata (`mymap.panelFold`).

## 0.29.11 (build 60) - 2026-10-04
- **Filtro rapido "Oggi":** sotto la barra in alto, accanto a *7 giorni* e *Sempre*, imposta il periodo sul giorno corrente; si evidenzia quando coincide con il filtro attivo.

## 0.29.10 (build 59) - 2026-10-04
- **Statistiche, pulizia:** tolti *Media giorni attivi*, *Serie di giorni con dati*, la curiosità *Bologna–Milano*, *km/h di media*, *km² grattati* e *Punti al giorno* (la scheda *Curiosità* non c'è più).
- **Statistiche, blocchetti in cima:** *Stagione più viaggiata* e *Km nel weekend* sono ora blocchetti accanto a *km percorsi* e *giri della Terra*.

## 0.29.9 (build 58) - 2026-10-04
- **Contorno nel tema scuro:** con l'impostazione *auto* il filo sottile attorno a pannelli, pulsanti e targhette ora c'è anche nel tema scuro, un po' più luminoso (18% → 26%).
- **Statistiche, panoramica:** tolte le righe *Giorni in movimento* e *Tempo in movimento*.
- **Statistiche, notti:** *Notti rilevate* mostra anche il numero intero tra parentesi quando supera un anno (es. "1 anno e 2 mesi (430)").

## 0.29.8 (build 57) - 2026-10-04
- **Anteprime dei widget:** nel selettore dei widget i tre widget (*ultimo punto*, *oggi e 7 giorni* chiaro e scuro) mostravano il layout vuoto, senza numeri. Ora hanno un'anteprima con dati di esempio (km 12 / 63, posti 5 / 18, movimento 2h 10m / 9h 45m, tracker fermo da 0:42, "5 min fa"). Valgono da Android 12 (`previewLayout`); sulle versioni precedenti resta il layout vuoto.
- Nuovo `tools/widget_preview.py`: rigenera le anteprime dai layout veri; da rilanciare quando cambia il layout di un widget.

## 0.29.7 (build 56) - 2026-10-03
- **Widget, margini:** il contenuto è avvicinato ai bordi del 5% su tutti i lati: da 20 a 19 dp (8 dp di margine del widget + 11 dp attorno ai dati, prima 12).

## 0.29.6 (build 55) - 2026-10-03
- **Widget, testi piccoli uguali:** *oggi*, *7g*, i titoli delle sezioni (*km*, *posti*, *movimento*) e *tracker* hanno la stessa dimensione (11,2 sp) e lo stesso colore grigio dei dati dei 7 giorni.
- **Widget, distanze uguali:** in ogni colonna lo spazio tra il titolo e il dato di oggi è uguale a quello tra il dato di oggi e il dato della settimana (spazi elastici tra le tre righe); titolo e dato della settimana restano a 20 dp dai bordi. *oggi* e *7g* stanno sulle stesse righe dei dati. Nella cella tracker icona e tempo sono centrati nello spazio sotto il titolo.
- **Widget, icona del tracker:** ridotta del 10% (25,7 → 23,1 dp).

## 0.29.5 (build 54) - 2026-10-03
- **Widget, "7g" letto come "/g":** la parte alta del "7" era tagliata. La riga dei 7 giorni (valori e etichetta *7g*) prendeva solo una quota proporzionale dell'altezza e, con il margine inferiore raddoppiato, al testo restava meno spazio del necessario. Ora quella riga ha un'altezza garantita (testo + margine, almeno 30 dp) e la riga di oggi prende lo spazio che resta.
- **Cella tracker:** il titolo e i dati (icona e tempo) sono al **centro** della cella, con margini uguali a destra e a sinistra (12 dp).
- **Cella tracker:** distanza tra l'icona e il tempo aumentata da 1 a 5 dp (circa il 5% della larghezza della cella).

## 0.29.4 (build 53) - 2026-10-03
- **Widget, testi:** ridotti ancora del 5% *oggi*, i titoli delle sezioni e *tracker* (12,6 → 12,0 sp), i valori di oggi e il tempo del tracker (17,7 → 16,8 sp); aumentati ancora del 5% i testi della settimana: i valori (10,7 → 11,2 sp) e l'etichetta *7g* (14,0 → 14,7 sp).
- **Widget, icona del tracker:** ridotta del 10% (28,5 → 25,7 dp).

## 0.29.3 (build 52) - 2026-10-03
- **Widget, testi:** ridotti del 5% *oggi* (13,3 → 12,6 sp), i titoli delle sezioni e *tracker* (13,3 → 12,6 sp), i valori di oggi e il tempo del tracker (18,6 → 17,7 sp); aumentati del 5% i testi della settimana: i valori (10,2 → 10,7 sp) e l'etichetta *7g* (13,3 → 14,0 sp).
- **Widget, icona del tracker:** ridotta del 5% (30 → 28,5 dp).

## 0.29.2 (build 51) - 2026-10-03
- **Widget:** la distanza tra i bordi del widget e tutti i contenuti è raddoppiata, da 10 a 20 dp su ogni lato (8 dp di margine del widget + 12 dp attorno ai dati). Con la riga di celle bassa, i testi hanno meno spazio in altezza: se risultano tagliati si può ridurre il margine verticale.
- **Documentazione:** nuovo `CLAUDE.md` con le regole di lavoro, tra cui **aggiornare sempre l'app sul telefono dopo ogni modifica se la connessione di debug wireless è aperta**; la stessa regola è in ARCHITETTURA.md → Sviluppo e prova.

## 0.29.1 (build 50) - 2026-10-03
- **Widget:** i dati della settimana sono più grandi del 10% (9,3 → 10,2 sp).
- **Cella tracker:** l'icona è vicina al tempo (prima il tempo era centrato nello spazio rimasto). La cella è larga quanto il contenuto (minimo 88 dp) e il suo contenuto è allineato a destra.
- **Margini uguali:** tra i bordi del widget e i dati c'è lo stesso spazio su tutti i lati (4 dp del widget + 6 dp attorno ai dati): in alto sopra i titoli, a sinistra davanti a *oggi* e *7g* (allineati a sinistra), in basso sotto i valori dei 7 giorni (appoggiati in basso) e a destra dopo il tempo del tracker. Il rosso della cella tracker resta dentro il margine di 4 dp.

## 0.29.0 (build 49) - 2026-10-03
- **Widget, cella tracker:** niente più testo di stato (*Fermo* / *In movimento*): resta solo l'**icona colorata e animata**, con accanto il tempo dall'ultimo punto in minuti e secondi ("3:20"), grande come i dati di oggi (18,6 sp). L'icona è un pallino con anelli che si allargano e svaniscono (fermo) oppure due impronte di scarpe che camminano, un piede dopo l'altro (in movimento). Nei widget l'unica animazione possibile è alternare dei fotogrammi con un `ViewFlipper` (4 fotogrammi, uno ogni mezzo secondo, con dissolvenza), quindi è un'animazione a scatti e non fluida. Colore: verde in movimento, bianco sul fondo rosso, come il testo altrimenti.
- **Widget, titoli** (*km*, *posti*, *movimento*, *tracker*): più spazio sopra (3 dp) e sotto (5 dp).
- **Impostazioni:** nel tema scuro la scritta *Tracking ATTIVO* era scura su fondo scuro: ora è verde acqua.
- **Pulsanti secondari** (*Applica frequenza*, *Pulisci i punti*, *Registra la posizione adesso* e gli altri): avevano lo stesso fondo della scheda e nessun bordo, quindi sembravano solo testo; ora hanno un fondo diverso, un contorno e una leggera ombra.

## 0.28.0 (build 48) - 2026-10-03
- **Widget, valori della settimana:** grigi (con il 15% di trasparenza) e grandi la metà (18,6 → 9,3 sp). Le righe di oggi e dei 7 giorni hanno ora altezze diverse, 5 a 4, per far stare tutto in una riga di celle.
- **Titoli delle categorie** (*km*, *posti*, *movimento*, *tracker*) alla stessa dimensione di *oggi* e *7g* (13,3 sp). Per farli stare nella colonna i testi sono più corti: *km*, *posti*, *movimento* al posto di *km percorsi*, *posti visitati*, *in movimento*.
- **Spazi e allineamenti:** margini laterali più ampi (12 dp) per i bordi arrotondati; *oggi* e *7g* allineati alle rispettive righe di valori; più spazio tra *oggi* e la riga che lo separa dalla prima categoria (10 dp); titoli tutti alla stessa altezza.
- **Cella tracker:** il tempo dall'ultimo punto ha i **secondi** ("45 s fa", "3 min 20 s fa") e la cella si **aggiorna ogni 20 secondi** (e subito all'accensione dello schermo) dal servizio di tracking, solo a schermo acceso e con un aggiornamento leggero (due righe di database, senza ricalcolare i km): così si vede che non è fermo. Il resto del widget resta ogni ~5 minuti.
- **Icone nella cella tracker:** un **pallino con anelli che si allargano**, come le onde nell'acqua, se sei fermo; **due impronte di scarpe che camminano** se sei in movimento. Sono colorate come il testo (verde in movimento, bianche sul fondo rosso).

## 0.27.4 (build 47) - 2026-10-03
- **Widget, estetica:**
  - il **nome della sezione** (*km percorsi*, *posti visitati*, *in movimento*, *tracker*) è in alto, sopra i valori di oggi e dei 7 giorni;
  - tutti i testi sono più grandi del 10% (valori 16,9 → 18,6 sp, stato del tracker 15,7 → 17,3 sp, tempo dall'ultimo punto 12,1 → 13,3 sp) e i testi delle sezioni e dei giorni (*oggi*, *7g*) di un altro 10% (9 → 10,9 sp e 11 → 13,3 sp);
  - la cella **tracker diventa rossa** quando l'ultimo punto ha più di 6 minuti (o non ci sono punti), con testi bianchi. Con la frequenza di partenza da fermo (1 punto ogni 10 minuti) tra un punto e l'altro supera i 6 minuti: per averla rossa solo quando c'è un vero problema conviene una frequenza da fermo di almeno un punto ogni 5-6 minuti;
  - i **dati della settimana** sono più grigi e più trasparenti del 15% (colore mescolato al grigio, opacità 85%);
  - margini verticali ridotti e senza spazio extra attorno ai caratteri (`includeFontPadding`), per far stare i testi più grandi in una riga.

## 0.27.3 (build 46) - 2026-10-03
- Widget: caratteri ancora più grandi del 10% per i numeri (15,4 → 16,9 sp), lo stato del tracker (14,3 → 15,7 sp) e il tempo dall'ultimo punto (11 → 12,1 sp).

## 0.27.2 (build 45) - 2026-10-03
- Widget: caratteri più grandi del 10% per i numeri (14 → 15,4 sp), per lo stato del tracker (13 → 14,3 sp) e per il tempo dall'ultimo punto (10 → 11 sp). Le etichette restano invariate.

## 0.27.1 (build 44) - 2026-10-03
- **Widget:** tra la riga di oggi e quella dei 7 giorni c'è di nuovo il nome del dato (*km percorsi*, *posti visitati*, *in movimento*), quindi i numeri sono senza unità (tranne il tempo, "2h 10m").
- **Cella tracker:** niente più coordinate, solo se si è **Fermo** o **In movimento** e da quanto tempo è stato registrato l'ultimo punto; la cella è più stretta del 15%. Toccandola si aprono le **impostazioni dell'app, sezione Tracker**.
- **Widget scuro piatto:** un solo colore pieno con angoli arrotondati, senza riflesso né bordo. La versione chiara resta plastificata.

## 0.27.0 (build 43) - 2026-10-03
- **Widget 4×1 rifatto (chiaro e scuro):** a sinistra le etichette **oggi** (riga in alto) e **7g** (riga in basso); in alto i dati di oggi e in basso quelli degli ultimi 7 giorni, con la stessa dimensione: km, posti visitati e tempo in movimento. Toccando un dato si apre la vista (Percorsi, Posti, Heatmap) con il filtro su oggi (riga in alto) o sugli ultimi 7 giorni (riga in basso).
- **Nuova cella "ultima posizione tracciata":** stato **Fermo** o **In movimento** (velocità del punto, oppure spostamento dal punto precedente), da quanto tempo è stato registrato e le coordinate. Oltre 20 minuti senza punti diventa rossa ("Nessun punto"). Toccandola si apre la mappa sul punto in cui sei.
- **Avviso sonoro:** se il tracking dovrebbe essere attivo ma l'ultimo punto ha più di 20 minuti, parte una notifica con suono e vibrazione ("Nessun punto da N minuti"). Avvisa una volta per ogni buco, sparisce quando i punti riprendono e non parte se hai fermato tu il tracking. Il controllo gira ogni ~5 minuti dal servizio di tracking e ogni ~15 dal cane da guardia (se Android ha ucciso il servizio l'avviso può arrivare fino a ~35 minuti dopo l'ultimo punto). I widget si aggiornano ora anche ogni ~5 minuti.
- **Widget scuro più saturo:** sfondo quasi opaco (94%), grafite con una punta di blu, bordo chiaro e netto, riflesso più visibile: non si confonde più con lo sfondo.

## 0.26.1 (build 42) - 2026-10-02
- **Widget "oggi" che non si caricava, corretto:** i separatori tra le colonne erano elementi `View`, che i widget non permettono ("Class not allowed to be inflated android.view.View"); ora sono immagini.
- **Widget 4×1 con oggi e ultimi 7 giorni:** sotto ogni numero di oggi (km, posti visitati, tempo in movimento) compare lo stesso dato degli ultimi 7 giorni ("7 g · 63 km"). Toccando il numero di oggi si apre la vista (Percorsi, Posti, Heatmap) con il filtro su oggi; toccando la riga "7 g" con il filtro sugli ultimi 7 giorni. Le dimensioni dichiarate erano quelle di 4 celle anche per il "3×1": ora sono davvero 4×1. I widget si chiamano *MyMap · oggi e 7 giorni (chiaro)* e *(scuro)*.

## 0.26.0 (build 41) - 2026-10-02
- **Widget "oggi" rifatto (3×1):** targhetta semitrasparente effetto plastificato (riflesso lucido sulla parte alta, bordo e filo interno chiari), in **due versioni**, *MyMap · oggi (chiaro)* e *MyMap · oggi (scuro)*, che trovi entrambe nell'elenco dei widget. Si ridimensiona solo in larghezza, per restare di una riga.
- **Ogni numero si tocca:** i **km** aprono la vista **Percorsi**, i **posti visitati** la vista **Posti** e il tempo **in movimento** la **Heatmap**, tutte con il filtro su oggi; il resto del widget apre l'app. Funziona sia ad app chiusa (la richiesta viaggia nell'indirizzo della pagina, `?open=`) sia ad app già aperta (`onNewIntent` → `openFromWidget`).
- Heatmap: niente più errore se la mappa è nascosta mentre si ridisegna.

## 0.25.0 (build 40) - 2026-10-02
- **Nuovo widget "MyMap – oggi"** (3×1): km percorsi oggi, posti visitati oggi (soste di almeno 20 minuti, unite entro 150 m) e tempo in movimento oggi. Stesse regole dell'interfaccia (scarta i fix oltre 120 m e i salti impossibili; passi entro 20 minuti, da 10 m a 30 km, al massimo 250 km/h). Si aggiorna a ogni punto (al massimo una volta al minuto), ogni ~15 minuti dal controllo del tracking e ogni 30 minuti. **Il tocco apre l'app, anche sul widget "ultimo punto"** (prima lo aggiornava soltanto).
- **Scratch: tre livelli di zoom.** Gli esagoni non si impostano più per ogni zoom da 5 a 17, ma con tre coppie *zoom → diametro* (come heatmap e percorsi); agli zoom intermedi il diametro si interpola da solo (scala logaritmica, arrotondato a due cifre). Valori di partenza: zoom 6 → 100 km, 11 → 3 km, 16 → 100 m. Le impostazioni e i preset salvati con il vecchio formato si convertono prendendo i valori a quegli zoom.
- **Scratch nel tema scuro:** la coperta è una nebbia grigia chiara (non più nera sulla mappa scura) e le zone grattate hanno un filo luminoso attorno, così si capisce subito cosa è grattato.
- **Filtro alla sincronizzazione:** prima di inviare i punti al server, quelli ancora da inviare vengono ripuliti con le regole della pulizia manuale: fix con accuratezza oltre 120 m, picchi e punti ripetuti da fermo (restano il primo, l'ultimo e uno ogni 10 minuti). I punti tolti non vengono inviati e si cancellano dal telefono; quelli già inviati non si toccano. Il filtro guarda anche i punti già inviati nelle 3 ore precedenti, per non lasciare doppioni al confine tra due invii.
- Corretto un arresto all'avvio dopo una reinstallazione: senza il permesso di posizione (che Android revoca) il servizio di tracking non viene più avviato dal controllo periodico né al riavvio; basta riconcedere i permessi e riavviare il tracking.

## 0.24.0 (build 39) - 2026-10-02
- Script `tools/clean_points.py` per fare la stessa pulizia sul server (conta; con `--apply` cancella dopo conferma).
- **Percorsi meno storti:** `clean` scarta anche i *picchi* (un punto che salta via di oltre 300 m e torna subito dopo, entro 15 minuti) e i percorsi ignorano i fix grossolani (accuratezza 80 m o peggio) quando c'è un punto preciso a meno di 5 minuti (zig-zag tra punti grezzi e tracciato importati da Google).
- **Pulizia dei punti** (Tracker → Pulizia dei punti): conta e, dopo conferma, toglie dal telefono i punti con accuratezza oltre 120 m, i picchi e i punti ripetuti da fermo (restano il primo, l'ultimo e uno ogni 10 minuti, quindi soste e notti non cambiano). I punti già sincronizzati che si tolgono sono ricordati (tabella `deleted`) per non rientrare con lo scarico dello storico; sul server restano.

## 0.23.1 (build 38) - 2026-10-02
- Impostazioni nel profilo, più sicure alla reinstallazione: su un'installazione nuova (o con un altro account) vince sempre il profilo del server, e le impostazioni non vengono più inviate prima di averlo letto, così i valori di partenza non possono sovrascrivere quelli salvati. Se la lettura fallisce (niente rete) si riprova alla modifica successiva.

## 0.23.0 (build 37) - 2026-10-02
- **Widget** per la schermata home (*MyMap – ultimo punto*): mostra da quanto tempo è stato salvato l'ultimo punto del tracking ("5 min fa", "2 h 10 min fa"); diventa rosso oltre 30 minuti. Si aggiorna a ogni punto salvato (al massimo una volta al minuto), ogni ~15 minuti dal controllo del tracking e al tocco.

## 0.22.1 (build 36) - 2026-10-02
- Tema chiaro: i pannelli, i pulsanti e le targhette hanno ora un contorno sottile per leggerli meglio. In Aspetto → Contorno dei pannelli: *Automatico* (sottile nel tema chiaro, assente nello scuro; è la scelta di partenza), *Sempre* o *Nessuno*.

## 0.22.0 (build 35) - 2026-10-02
- Filtri rapidi in alto, sotto la barra: **7 giorni** e **Sempre** (evidenziato quello attivo); per i dettagli resta il filtro (imbuto).
- Percorsi: il pannello in basso mostra gli spostamenti **di un giorno** (all'inizio l'ultimo con spostamenti) con i pulsanti ‹ › per cambiare giorno (saltano i giorni vuoti); cambiando giorno il filtro diventa quel giorno. Toccando uno spostamento il filtro diventa il suo giorno e la sua fascia oraria, così la mappa mostra solo quel tragitto, evidenziato. Il filtro si toglie con la X o con "Sempre". Tolta la cronologia a parte, ora inutile.
- Heatmap: nel pannello i **3 posti più visitati** e il pulsante **Elenco posti più visti** (dal più visitato).
- Notti: pulsante **Elenco notti e luoghi** (luoghi dal più frequente, con le date delle notti). Posti: pulsante **Elenco posti** (dalla visita più recente).
- Scratch: **stati visitati** ("X di 195", percentuale) e pulsante **Elenco stati visitati** con bandiere e prima data. I confini sono nell'app (Natural Earth 1:50m), funziona offline; un paese conta con almeno 3 punti e ignorando i tratti oltre 400 km/h (aerei). Non contano nella percentuale territori e aree non sovrane, che si elencano a parte.
- Le targhette delle viste hanno tutte la stessa larghezza e altezza.
- Aspetto: **Contorno dei pannelli** (Nessuno/Sottile) per avere una linea sottile attorno a pannelli e pulsanti; fa parte dei preset di Aspetto.

## 0.21.0 (build 34) - 2026-10-02
- Vista Percorsi: sotto la mappa gli **ultimi 3 spostamenti** (da dove a dove, giorno e orario, km e durata) e il pulsante **Cronologia spostamenti**, che apre l'elenco giorno per giorno con le frecce ‹ › (salta i giorni senza spostamenti) e il totale di km del giorno. Toccando uno spostamento il tragitto si evidenzia sulla mappa.
- Uno spostamento è il tragitto tra due soste di almeno 20 minuti in luoghi diversi (almeno 300 m, entro 12 ore); dopo l'ultima sosta compare quello "in corso". I luoghi usano i nomi dati da te, poi quelli di OpenStreetMap.

## 0.20.0 (build 33) - 2026-10-02
- Tolte le viste Mix (heatmap + percorsi) e Notti e posti: restano Scratch, Heatmap, Percorsi, Notti e Posti. Se l'ultima vista scelta era una delle due, si apre Scratch.
- Cambiando vista o filtro la mappa si centra sulla tua posizione con 20 km di raggio (40 km di larghezza).
- Notti e posti si possono nascondere (i dati restano, perché notti e posti si calcolano dai punti): dal pulsante Nascondi nel popup sulla mappa e dagli elenchi, e con Mostra tornano. Le notti si nascondono per data, i posti per luogo (entro 150 m); si salvano nelle impostazioni, quindi nel profilo, e valgono in mappa, elenchi e statistiche.
- Elenchi nel pannello di personalizzazione: "Notti salvate" nella vista Notti (data, luogo, Vai, Nascondi/Mostra) e "Posti salvati" nella vista Posti (luogo, visite, tempo, Vai, Nome, Nascondi/Mostra).
- Ogni vista mostra solo le sue impostazioni: la vista Notti non mostra più i nomi dei posti (restano nella vista Posti).

## 0.19.0 (build 32) - 2026-10-02
- Personalizzazione nella mappa: il pulsante con i cursori (sopra "dove sono") apre un pannello in basso con i parametri della vista corrente, così le modifiche si vedono subito sulla mappa ancora visibile. Scratch: dimensioni degli esagoni; Heatmap: raggio, sfocatura, calore, gradiente; Percorsi: linee e stile; Mix: percorsi e heatmap; Notti e Posti: parametri delle notti e nomi dei posti. L'Aspetto (tema, stile della mappa, ritocchi) è in fondo a ogni pannello. I preset restano in ogni sezione.
- Le Impostazioni mantengono solo Tracker, Account, Dati ed Esportazione.
- Le viste sono targhette in verticale sul lato destro della mappa (al posto dell'elenco a comparsa); la vista scelta è evidenziata. Il filtro del periodo torna in alto a destra, accanto a versione e zoom.

## 0.18.1 (build 31) - 2026-10-02
- Barra in alto: versione e livello di zoom a sinistra, lista delle viste a destra; il filtro del periodo passa sulla seconda riga, a destra.

## 0.18.0 (build 30) - 2026-10-02
- Nuovo modo di scegliere la vista della mappa: un pulsante in alto mostra la vista corrente e apre un foglio con l'elenco, ognuna con una riga di spiegazione. Sostituisce la barra scorrevole.
- Impostazioni condivise sul database: oltre a quelle già salvate nel profilo (esagoni, heatmap, notti, percorsi, aspetto, nomi dei posti) ora ci sono anche la vista corrente e la frequenza dei punti del tracker. Con l'account su un server si ritrovano su ogni dispositivo (vince la modifica più recente); con il database locale restano solo nel telefono. Serve il campo `settings` sul server (`tools/setup_server.py`).
- Layout in alto: pulsante vista, filtro e versione sulla prima riga; zoom e avviso di tracking fermo sulla seconda.

## 0.17.0 (build 29) - 2026-10-02
- Tema scuro in scala di grigi: sfondi, schede, pulsanti e mappe scure non hanno più la tinta azzurra (anche le barre di sistema).
- Nuove viste della mappa: Mix (heatmap con i percorsi sopra) e Notti e posti (i posti visitati con sopra le lune delle notti).
- Il pannello dati sotto la mappa mostra solo i numeri di ogni vista, senza suggerimenti e senza km:
  - Scratch: esagoni grattati (su tutto il periodo scelto) e diametro di un esagono;
  - Notti: notti totali trovate, luoghi diversi e notti nel luogo principale;
  - Posti: posti totali, visite, rinominati e da rinominare;
  - Notti e posti: notti, luoghi per dormire, posti e visite;
  - Heatmap, Percorsi e Mix: nessun pannello.
- La versione dell'app è una targhetta in alto sulla mappa, accanto allo zoom (non è più nel pannello dati).
- Il pulsante del filtro è solo un'icona (imbuto); tenendolo premuto compare il periodo attivo.
- Statistiche: "I 10 giorni più lunghi" e "Dove passi più tempo" si possono comprimere; lo stato si ricorda.
- Password di almeno 8 caratteri (creazione account, cambio password e messaggi), come impone PocketBase.
- La barra delle viste scorre per mostrare quella scelta.

## 0.16.0 (build 28) - 2026-10-01
- Ritocchi alla mappa di base (Impostazioni → Aspetto → Ritocchi alla mappa): cursori per tonalità, saturazione, luminosità, contrasto, grigio, seppia, inversione e sfocatura, più una tinta di colore con intensità e modo (moltiplica, schermo, sovrapponi, colore, normale). Valgono per tutti gli stili, con anteprima in tempo reale in una mini mappa; si salvano nei preset di Aspetto e nel profilo. Nomi, percorsi e marcatori non cambiano.

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
- Password di almeno 5 caratteri (creazione account e cambio password; dalla 0.17.0 sono 8, come impone PocketBase). Il minimo di PocketBase è 8 di default e si poteva abbassare con `python tools/setup_server.py ...` (o dal pannello: users, campo password, lunghezza minima).
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
