# MyMap – Guida all'uso e ai parametri

Guida per chi usa l'app (versione 0.30.3). Per come è fatta dentro, vedi [ARCHITETTURA.md](../ARCHITETTURA.md); per la cronologia
delle modifiche, [CHANGELOG.md](../CHANGELOG.md).

## 1. Cos'è

MyMap è un'app Android **personale**: registra dove vai, anche con lo schermo bloccato, e te lo mostra in cinque viste (scratch map,
heatmap, percorsi, notti, posti…) e in statistiche. Non c'è nessuna parte social. I dati restano **sul telefono** oppure si
sincronizzano con un **tuo** server (PocketBase, ad esempio sul NAS).

## Versione web

Quando il server gira con `docker compose up -d`, aprendo il suo indirizzo (ad esempio `http://NAS:9090`, o l'indirizzo pubblico del tunnel) nel browser si vede la stessa
interfaccia dell'app, con gli stessi punti. Si accede con email e password dello stesso account (si può anche creare un account nuovo). Ci sono tutte le viste, le statistiche,
le impostazioni, i preset, i nomi dei posti e le notti nascoste, sincronizzati con l'app (quello che cambi nel sito lo ritrovi nell'app e viceversa), il cambio password e
l'esportazione (CSV, GPX, JSON, direttamente dal server). **Non c'è il tracciamento**: niente tracker, salute del tracking, frequenza dei punti, pulizia dei punti e
"registra la posizione adesso" (il pulsante "dove sono" usa la posizione del browser, solo con HTTPS). La prima apertura scarica tutti i punti (qualche secondo con decine
di migliaia); poi il browser li ricorda e scarica solo i nuovi. *Dati → Riscarica lo storico dal server* svuota quella cache. Il sito controlla ogni minuto se dal telefono
sono arrivati punti nuovi.

## 2. Primi passi

1. **Installa l'APK** sul telefono (debug wireless con `adb install -r`, oppure copiandolo sul telefono e aprendolo). Un aggiornamento
   compilato su un altro PC può essere rifiutato per la firma: vedi *Aggiornare l'app* più sotto.
2. **Accesso.** Alla prima apertura scegli dove tenere i dati:
   - *Su questo telefono*: nessun account, nessuna sincronizzazione (è la scelta predefinita);
   - *Il mio server*: scheda **Accedi** o **Nuovo account** con l'URL del tuo server. "Password dimenticata?" manda un'email di
     reimpostazione (serve la posta SMTP configurata in PocketBase). "Continua con Google" è spento finché non lo attivi nel server.
3. **Permessi.** Quando avvii il tracking concedi: posizione precisa, poi **"Consenti sempre"**, poi le notifiche.
4. **Avvia il tracking:** *Impostazioni → Tracker → Avvia tracking*. Una notifica fissa indica che sta registrando.
5. **Batteria.** In *Impostazioni → Tracker → Salute del tracking* controlla che "Risparmio batteria" sia "Escluso": se no tocca
   "Escludi". È il passo che più incide sull'affidabilità a telefono bloccato.

## 3. La mappa

In alto a sinistra: la **versione** e il **livello di zoom** (con la larghezza della mappa in km). In alto a destra: il **filtro del
periodo** (icona a imbuto; tenendola premuta compare il periodo attivo). Sul lato destro: le **viste**, come targhette verticali.
Sopra il tasto "dove sono" c'è il pulsante con i cursori, che apre il pannello di **personalizzazione della vista corrente**.

| Vista | Cosa mostra | Pannello dati |
|---|---|---|
| **Scratch** | la mappa è coperta e "gratti" (esagoni) i posti in cui sei stato | esagoni grattati, diametro, **stati visitati** e percentuale, con il pulsante *Elenco stati visitati* |
| **Heatmap** | calore dei punti: più passi, più è caldo | i **3 posti più visitati** e il pulsante *Elenco posti più visti* (dal più visitato) |
| **Percorsi** | le tue tracce, a colore unico o colorate per frequenza | gli **spostamenti di un giorno**, con i pulsanti ‹ › per cambiare giorno |
| **Luoghi** (sperimentale; sostituisce le viste Notti e Posti) | notti (pallini) e posti (rombi) insieme sulla stessa mappa; i gruppi si formano prima che nelle viste singole; i posti senza nome sono celesti | notti, luoghi di notte, posti, visite, due caselle *Notti* e *Posti* per mostrare o nascondere ciascun livello, pulsanti per i due elenchi |
| **Punti** (di prova) | **tutti i punti salvati** (già puliti, gli stessi usati per le notti) su una tela veloce: si disegnano solo quelli visibili, al massimo uno ogni 3 px. Le **notti rilevate** sono pallini arancioni sopra i punti; toccando un punto vedi ora e accuratezza | numero di punti, filtro **ora** (dalle/alle, anche a cavallo della mezzanotte), **accuratezza massima**, *Colora per ora*, *Notti rilevate*. Il pannello di personalizzazione ha i parametri delle notti da provare |

- **Filtro del periodo:** scorciatoie (Oggi, Ieri, Ultimi 7/30 giorni, Questo mese, Mese scorso, Quest'anno, Tutto), anno/mese/giorno,
  da data a data e **fascia oraria** (es. 07:00–09:00, anche a cavallo della mezzanotte).
- **Dove sono:** chiede la posizione fresca al telefono (se non arriva usa l'ultima nota) e centra la mappa.
- **Cambio vista o filtro:** la mappa si centra sulla tua posizione con **20 km di raggio** (circa 40 km di larghezza).
- **Toccare un posto o un pallino** apre i dettagli e permette di **dare o cambiare il nome**; un nome dato da te vale per tutti i punti
  entro 120 m e ha la precedenza su quello di OpenStreetMap. Da Posti puoi nominare in sequenza i posti nuovi.
- **Filtri rapidi:** sotto la barra in alto, **Oggi**, **7 giorni** e **Sempre** (quello attivo è evidenziato); per i dettagli (anno, mese, date, fascia
  oraria) si usa l'imbuto.
- **Pannello dati comprimibile:** la freccia in alto nel pannello in basso lo riduce a una barretta e lo riespande; la scelta resta salvata.
- **Spostamenti (vista Percorsi):** il pannello in basso mostra gli spostamenti **di un giorno** (all'inizio l'ultimo con spostamenti): "da dove
  a dove", orario, km e durata, con il numero di spostamenti e i km del giorno. I pulsanti ‹ › passano al giorno precedente o successivo
  che ha spostamenti (i giorni senza sono saltati) e **applicano come filtro** quel giorno, così la mappa mostra solo i suoi tragitti.
  Toccando uno spostamento il filtro diventa il suo giorno e la sua fascia oraria: resta in mappa solo quel tragitto, evidenziato. Si toglie
  con la X in alto o con *Sempre*. Uno spostamento è il tragitto tra due soste di almeno 20 minuti in luoghi diversi (almeno 300 m, entro
  12 ore); dopo l'ultima sosta compare quello "in corso". I luoghi usano i nomi dati da te, poi quelli di OpenStreetMap.
- **Elenchi completi:** *Elenco posti più visti* (Heatmap, dal più visitato), *Elenco notti e luoghi* (Notti, dal luogo più frequente, con le
  date di ogni luogo), *Elenco posti* (Posti, dalla visita più recente), *Elenco stati visitati* (Scratch, con bandiera e prima data).
- **Stati visitati (Scratch):** "X di 195" e la percentuale sono gli stati sovrani (i 193 dell'ONU più Vaticano e Palestina) in cui hai almeno
  3 punti nel periodo scelto. I confini sono dentro l'app (Natural Earth 1:50m), quindi funziona anche offline. I tratti oltre 400 km/h
  (aerei) si ignorano, per non contare i paesi sorvolati. Territori e aree non sovrane (Groenlandia, Kosovo…) si elencano a parte e non
  contano nella percentuale. Limiti: il Vaticano e gli altri micro-stati sotto i 2 km, e i punti esattamente sul bordo di un porto, possono
  non essere riconosciuti; Tuvalu non ha confini nel file.
- **Nascondere notti e posti:** notti e posti si calcolano dai punti, quindi non si "cancellano": si **nascondono** e i dati restano. Dal
  popup (pulsante *Nascondi*) o dagli elenchi nel pannello della vista (*Notti salvate* e *Posti salvati* in Luoghi, *Notti salvate* in Punti), dove con
  *Mostra* tornano. Le notti si nascondono per data (dal popup si nascondono tutte le notti di quel luogo, con conferma), i posti per
  luogo (entro 150 m). Le notti e i posti nascosti non contano in mappa, elenchi e statistiche; la scelta si salva nel profilo.
- **I km sono uguali in tutte le viste:** si calcolano sempre sugli stessi dati (tutti i punti del filtro).

## 4. Personalizzazione (pannello con i cursori)

Ogni vista mostra **solo le sue impostazioni**: Scratch gli esagoni, Heatmap i parametri della heatmap, Percorsi quelli dei percorsi,
Luoghi la formula delle notti, i nomi e gli elenchi *Notti salvate* e *Posti salvati*; Punti la formula delle notti e l'elenco *Notti salvate*. In fondo c'è sempre l'**Aspetto**
(tema, mappa e ritocchi), che vale per tutte.

Ogni gruppo ha in cima un menu **Preset** con **Salva** ed **Elimina**: salvi la combinazione di valori con un nome e la riapplichi
quando vuoi. I preset valgono per esagoni, heatmap, percorsi, notti e aspetto (tema, mappa, contorno e ritocchi), e viaggiano nel profilo del server.

**Spessore a tre livelli di zoom** (heatmap e percorsi): per ciascuno dei tre livelli scegli lo zoom e lo spessore in pixel; tra un
livello e l'altro il valore si interpola, fuori dal primo e dall'ultimo resta il valore più vicino. Valori di partenza: percorsi
1,5 / 2,5 / 5 px e heatmap 5 / 3 / 2 px a zoom 7 / 11 / 15.

| Gruppo | Parametri |
|---|---|
| **Scratch · esagoni** | diametro dell'esagono a tre livelli di zoom (zoom → metri); agli zoom intermedi si interpola da solo. Partenza: zoom 3 → 50 km, 13 → 170 m, 16 → 50 m; minimo consigliato 100 m |
| **Heatmap** | raggio (a tre zoom), sfocatura, quantità di calore (più bassa = più caldo), opacità minima, densità dei percorsi (un punto ogni N metri tra due fix; 0 = nessuno), gradiente a quattro colori con preset |
| **Percorsi** | stile (*colore unico* oppure *per frequenza*); colore, spessore (a tre zoom) e opacità per il colore unico; per frequenza: sfocatura, quantità di calore (passaggi sovrapposti per il colore più caldo), opacità minima, gradiente; **dettaglio** (semplificazione dei tratti in px: più alto = più leggero) |
| **Notti** (in Luoghi e Punti) | dalle/alle (default 23–09), punti minimi (default 2), raggio (default 300 m); di prova, 0 = disattivati: accuratezza massima, durata minima del gruppo (minuti), punti minimi nella fascia centrale (e le sue ore, default 01–05), unione dei luoghi (default 400 m) |
| **Aspetto** | tema (come il telefono, chiaro, scuro in grigi), stile della mappa, **contorno dei pannelli** (automatico: sottile in entrambi i temi; sempre; nessuno), **ritocchi alla mappa** |
| **Nomi dei posti** | nomi dati da te; interruttore per i nomi di OpenStreetMap |

**Stili della mappa:** Colorata, Pastello, Seppia, OpenStreetMap, Topografica, National Geographic, Satellite, Semplice (grigia).
**Ritocchi:** tonalità, saturazione, luminosità, contrasto, grigio, seppia, inversione, sfocatura e una **tinta** (colore, intensità,
modo: moltiplica, schermo, sovrapponi, colore, normale). Valgono per tutti gli stili, con anteprima in tempo reale; cambiano solo la
mappa di base (nomi, percorsi e marcatori restano com'erano). La tinta e la sfocatura possono rallentare i telefoni meno potenti.

## 5. Statistiche

Scheda **Statistiche**, con filtro per anno e mese: in cima i blocchetti (km percorsi, giri della Terra, stagione più viaggiata, km nel
weekend), poi panoramica (punti e periodo), dove hai dormito, i 10 giorni più lunghi, dove passi più tempo, posti
visitati, casa e lontananza (giorni a casa, a più di 50 e 200 km, punto più lontano), estremi raggiunti, km per mese/anno/ora/giorno
della settimana e zone nuove per mese. Toccando una riga con il segno › la mappa si apre su quel luogo.
**Durate oltre 365 giorni** si scrivono in anni, mesi e giorni (es. "2 anni, 2 mesi e 21 giorni"; anno = 365 giorni).

## 6. Tracker (Impostazioni → Tracker)

- **Stato** del tracking, punti registrati e da sincronizzare, ultima sincronizzazione; pulsanti *Avvia/Ferma tracking*,
  *Sincronizza ora*, *Escludi da risparmio batteria*.
- **Salute del tracking:** servizio (in esecuzione o fermo), ultimo punto, permesso "sempre", risparmio batteria, notifiche, con i
  pulsanti per correggere. Se il tracking dovrebbe essere attivo ma non registra, sulla mappa compare **"⚠ Tracking fermo"**.
- **Frequenza dei punti** (quanti punti registra l'app):
  - *In movimento: un punto ogni N secondi* (default 5 → circa 720 punti all'ora);
  - *Da fermo: N punti ogni X minuti* (default 1 ogni 10 minuti → circa 6 punti all'ora): serve a non avere buchi la notte, e le
    Notti hanno bisogno di almeno 2 punti.
  Il passaggio tra i due modi è automatico. Più punti = tracce più precise ma più batteria. Il riepilogo sotto i campi mostra i punti
  all'ora risultanti.
- **Pulizia dei punti:** *Pulisci i punti* mostra quanti punti sono inutili (troppo imprecisi, picchi isolati, ripetuti da fermo) e, dopo conferma, li toglie
  dal telefono. Restano il primo, l'ultimo e uno ogni 10 minuti di ogni sosta, quindi soste e notti non cambiano. Non si annulla sul telefono; sul server i
  punti restano (e non tornano con lo scarico dello storico).
- **Posizione adesso:** *Registra la posizione adesso* chiede subito il fix (GPS e rete in parallelo, fino a 20 secondi) e lo salva
  come punto.

- **Widget "ultimo punto":** tieni premuta la schermata home → Widget → MyMap. Mostra da quanto tempo è stato salvato l'ultimo punto
  ("5 min fa"); diventa rosso oltre 30 minuti (segno che il tracking potrebbe essere fermo). Si aggiorna a ogni punto e ogni ~15 minuti;
  toccandolo si apre l'app.
- **Widget "oggi e 7 giorni" (4×1):** stesso menu dei widget, in due versioni: *MyMap · oggi e 7 giorni (chiaro)*, su una targhetta
  semitrasparente effetto plastificato, e *(scuro)*, piatto e a tinta unita.
  - **Cosa mostra:** a sinistra le etichette **oggi** (riga con i valori grandi) e **7g** (riga con i valori grigi); poi tre colonne con il titolo in alto,
    **km** percorsi, **posti** visitati (soste di almeno 20 minuti) e tempo in **movimento**, con sotto il valore di oggi e il valore degli ultimi 7 giorni.
  - **Cella tracker** (a destra): un'**icona animata** (**onde** che si allargano se sei fermo, **impronte di scarpe** che camminano se sei in movimento; verde
    in movimento) e, accanto, da quanto tempo è stato registrato l'ultimo punto in **minuti e secondi** ("3:20"). Si aggiorna ogni 20 secondi a schermo
    acceso, con il tracking attivo. La cella diventa **rossa** se l'ultimo punto ha più di 6 minuti: con la frequenza di partenza da fermo (un punto ogni 10
    minuti) succede anche a telefono fermo, quindi per averla rossa solo quando c'è un problema conviene un punto ogni 5-6 minuti da fermo.
  - **Tocchi:** un dato apre la vista (**Percorsi** per i km, **Luoghi** per i posti, **Heatmap** per il tempo in movimento) con il filtro su oggi (riga grande) o
    sugli ultimi 7 giorni (riga grigia); la cella tracker apre le **impostazioni sulla sezione Tracker**; altrove si apre l'app.
  - **Anteprima:** nel selettore dei widget (tieni premuta la home → Widget → MyMap) i widget mostrano dati di esempio, non i tuoi; da Android 12.
  - **Se un testo risulta tagliato:** una riga di celle ha poca altezza; i margini e i testi sono già al limite per molti launcher.
- **Avviso sonoro "nessun punto":** se il tracking è attivo ma l'ultimo punto ha più di 20 minuti, arriva una notifica con suono e vibrazione. Avvisa
  una sola volta per ogni buco e sparisce quando i punti riprendono; se fermi tu il tracking non parte. Può arrivare con qualche minuto di ritardo (il controllo
  è ogni ~5 minuti, e ogni ~15 se Android ha ucciso il servizio).
- **Filtro alla sincronizzazione:** prima di inviare i punti al server l'app toglie quelli inutili (fix troppo imprecisi, picchi, punti
  ripetuti da fermo) con le stesse regole della pulizia manuale: non vengono inviati e si cancellano dal telefono.

## 7. Account e dati

- **Account:** accesso, creazione, *Cambia password* (serve quella attuale), esci. La password deve avere almeno **5 caratteri** (il server li accetta dopo `tools/setup_server.py` o con la migrazione `1700000002`).
- **Impostazioni nel profilo:** con un account sul server, impostazioni, preset, vista corrente, frequenza dei punti, nomi dei posti e notti e posti nascosti
  si salvano nel profilo e si ritrovano su un altro telefono o dopo una reinstallazione (vince la modifica più recente). Serve il campo
  `settings` sul server: si crea con `python tools/setup_server.py --url … --admin-email …` (vedi ARCHITETTURA.md).
- **Esportazione:** tutti i punti del telefono in **CSV, GPX o JSON**, nella cartella che scegli.
- **Importazione dello storico di Google Maps** (Spostamenti): `tools/import_timeline.py`.

## 8. Come si calcolano le cose

- **Km:** somma dei passi tra punti consecutivi a meno di 20 minuti, scartando quelli sotto 10 m (rumore), sopra 30 km o oltre
  250 km/h.
- **Notti:** una notte è registrata se tra le 23 e le 9 ci sono almeno 2 punti entro il raggio scelto; la notte prende la data della
  sera, il luogo è il centro del gruppo di punti più numeroso; le notti entro 400 m contano nello stesso posto.
- **Posti visitati:** periodi di almeno 20 minuti con i punti entro 150 m dal primo (buchi di dati fino a 3 ore); le visite entro 150 m
  si raggruppano.
- **Scratch:** gli esagoni toccati dai punti (anche tra due punti vicini nel tempo) diventano "buchi" nella copertura, con angoli
  arrotondati.
- **Percorsi:** le tracce si spezzano dove mancano dati per più di 5 minuti; ogni tratto si semplifica in base allo zoom.

## 9. Se non registra a telefono bloccato

Il tracking gira come servizio in primo piano, che Android lascia vivere a schermo spento. Se mancano punti, in ordine:

1. *Posizione*: permesso **"Consenti sempre"** (non "solo mentre usi l'app").
2. *Batteria*: **"Senza limitazioni"** per l'app (Tracker → Salute del tracking → Escludi).
3. In *Impostazioni → App → MyMap* disattiva "Metti in pausa l'attività dell'app se inutilizzata" (altrimenti Android può togliere i permessi).
4. Risparmio energetico spento; notifica del tracker non disattivata; GPS attivo.
5. Su telefoni con gestione batteria aggressiva (Xiaomi, Oppo/OnePlus, Samsung, Huawei, Vivo): "Avvio automatico" e blocco dell'app tra le recenti.

L'app si riavvia da sola dopo un aggiornamento o un riavvio del telefono; un controllo ogni ~15 minuti la rilancia se Android la ferma o,
se non può, manda una notifica. Gli aggiornamenti installati dal PC chiudono l'app: se non riparte, aprila una volta.

## 10. Aggiornare l'app

- **Dal PC:** `adb install -r app-debug.apk` aggiorna l'app e **conserva i dati**; l'app non si riapre da sola, ma il tracking riparte da solo. Serve il debug
  wireless (*Opzioni sviluppatore → Debug wireless*): la porta cambia a ogni riattivazione, quindi serve l'IP:porta mostrato dal telefono.
- **Firma diversa:** se l'aggiornamento è compilato su un altro PC, Android risponde `INSTALL_FAILED_UPDATE_INCOMPATIBLE`. La soluzione pulita
  è usare la stessa chiave di firma su entrambi i PC (copiare `C:\Users\<utente>\.android\debug.keystore`, senza metterla nel repo né
  condividerla). Altrimenti si disinstalla e si reinstalla: **si perdono i dati locali** (punti non ancora sincronizzati, impostazioni), che con un
  account sul server si riscaricano. Per conservarli c'è una procedura di backup e ripristino in ARCHITETTURA.md.
- Dopo una reinstallazione Android azzera i permessi e l'esclusione dal risparmio batteria: vanno concessi di nuovo (*Tracker → Avvia
  tracking*, poi *Salute del tracking → Escludi*).

## 11. Servizi esterni e privacy

- **Mappe:** tessere di Esri (stili colorati, topografico, satellite, grigio) e di OpenStreetMap; i loro termini d'uso valgono per un
  uso personale. Le tessere CARTO richiedono una chiave e non sono usate.
- **Nomi dei luoghi:** via e città da OpenStreetMap (Nominatim, una richiesta al secondo); si spegne con l'interruttore "Mostra i nomi
  di OpenStreetMap": le coordinate dei soli luoghi mostrati vengono inviate a quel servizio.
- Nessun servizio Google nell'app (niente Play Services). Il server è solo il tuo.
- La password dell'account è salvata in chiaro nelle preferenze dell'app (serve per il nuovo accesso): vedi i punti aperti in
  ARCHITETTURA.md.
