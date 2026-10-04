# MyMap – regole di lavoro

Prima di toccare qualcosa leggi [ARCHITETTURA.md](ARCHITETTURA.md) (com'è fatta l'app), [docs/GUIDA.md](docs/GUIDA.md) (come si usa) e
[CHANGELOG.md](CHANGELOG.md) (cosa è cambiato in ogni versione). Il progetto viene sviluppato da più dispositivi: fai un `git fetch`
all'inizio per vedere se è andato avanti.

## Dopo ogni modifica

1. **Versione e documenti.** Se cambia qualcosa nell'app (Kotlin, `web/`, risorse), alza `versionCode` di 1 e `versionName` in
   `android/app/build.gradle.kts`, aggiungi una voce in `CHANGELOG.md` e aggiorna `ARCHITETTURA.md` e `docs/GUIDA.md` se cambiano la struttura o l'uso.
2. **Aggiorna sempre l'app sul telefono, se la connessione di debug wireless è aperta.** È la regola da non saltare: ogni modifica all'app
   va compilata e installata subito, senza aspettare che venga chiesto.
   - controlla la connessione: `adb mdns services` e `adb devices` (la porta cambia a ogni riattivazione del debug wireless);
   - compila da `android/`: `./gradlew assembleDebug` (JDK 17, Android SDK piattaforma 35);
   - installa: `adb -s IP:porta install -r app/build/outputs/apk/debug/app-debug.apk`, poi apri l'app;
   - controlla `dumpsys package com.mymap.app | grep versionName` e `logcat -d -b crash` (nessun arresto); per i widget cerca anche gli errori di
     `AppWidgetHostView`;
   - se il telefono non è raggiungibile, dillo e chiedi l'IP e la porta della schermata *Debug wireless*; non saltare il passaggio in silenzio.
3. Se `install -r` risponde `INSTALL_FAILED_UPDATE_INCOMPATIBLE` la firma è diversa (build di un altro PC): **non disinstallare senza aver
   salvato i dati**, segui la procedura in ARCHITETTURA.md → *Cambio di firma senza perdere i dati*.

Commit e push solo quando l'utente li chiede.

## Note

- Se cambi il layout di un widget rilancia `python tools/widget_preview.py`: rigenera le anteprime mostrate nel selettore dei widget.
- Nei layout dei widget sono permessi solo alcuni elementi (per esempio niente `View` semplice): vedi ARCHITETTURA.md, `TodayWidget.kt`.
- Le impostazioni di aspetto, i preset e i nomi dei posti viaggiano nel profilo del server (`web/profile.js`): se cambi il loro formato mantieni la
  conversione dai valori già salvati.
