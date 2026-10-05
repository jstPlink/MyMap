// Impostazioni nel profilo: con un account su un server, le impostazioni (esagoni, heatmap, notti, linee, tema, vista corrente, frequenza dei punti, nomi dei posti)
// si salvano nel campo JSON `settings` dell'utente, così le ritrovi dopo una reinstallazione o su un altro telefono.
// Vince la modifica più recente: ogni salvataggio locale segna l'ora (mymap.profile_t) e al confronto con il profilo si tiene la più nuova.
// Con il database locale restano solo nel telefono.
const Profile = (() => {
  const T_KEY = "mymap.profile_t";
  const OK_KEY = "mymap.profile_ok"; // account (server|email) con cui questa installazione ha già fatto una sincronizzazione riuscita
  let state = "off"; // off | busy | ok | old (il server non ha il campo) | err
  let detail = "";
  let timer = null, applying = false, busy = false, again = false, pulled = false, syncing = false; // pulled: il profilo del server è già stato letto in questa sessione

  const localT = () => +store.get(T_KEY) || 0;
  const online = () => (Native.isApp || Native.isWeb) && session && session.mode === "server";
  let remoteTracker; // frequenza dei punti letta dal profilo: nel web non c'è un tracker, ma il profilo deve conservarla
  const acct = () => (session ? `${session.url}|${session.email}` : "");
  const snapshot = () => ({ t: localT(), prefs: { ...Prefs.v, tracker: Native.isApp ? Native.trackerConfig() : remoteTracker }, names: Names.snapshot() });
  const set = (s, d = "") => { state = s; detail = d; if (api.onState) api.onState(); };

  async function push() {
    if (!online() || !pulled) return; // mai inviare prima di aver letto il profilo: su un'installazione nuova cancellerebbe quello del server con i valori di partenza
    if (busy) { again = true; return; }
    busy = true;
    set("busy");
    const r = await Native.pushSettings(JSON.stringify(snapshot()));
    busy = false;
    if (r.ok) set("ok"); else set("err", r.error || "");
    if (again) { again = false; push(); }
  }

  // ogni modifica locale: si segna l'ora e si invia (con un po' di attesa, per raggruppare più modifiche ravvicinate)
  function touch() {
    if (applying) return;
    store.set(T_KEY, String(Date.now()));
    if (!online()) return;
    clearTimeout(timer);
    timer = setTimeout(() => (pulled ? push() : sync()), 1500); // se la lettura iniziale non è riuscita (rete assente) si riprova ora
  }

  function apply(remote) {
    applying = true;
    try {
      Prefs.adopt(remote.prefs || {});
      Prefs.save();
      const tc = remote.prefs && remote.prefs.tracker; // frequenza dei punti del tracker (solo nell'app)
      if (tc && Native.isApp) { Native.setTrackerConfig(tc); fillTrackerConfig(); sumTrackerConfig(); }
      Names.adopt(remote.names || {});
      store.set(T_KEY, String(remote.t || Date.now()));
    } finally { applying = false; }
    if (Prefs.migrated) { Prefs.migrated = false; store.set(T_KEY, String(Date.now())); setTimeout(push, 0); } // valori di partenza nuovi: il profilo del server si aggiorna
    Prefs.applyTheme();
    Native.setTheme(Prefs.v.theme);
    if (window.setBase) setBase();
    buildPrefsUI();
    buildNamesCard();
    statsFor = "";
    setMode(Prefs.v.view, true); // la vista condivisa (non risalva); se è già quella corrente basta ridisegnare
    render(false);
  }

  async function sync() {
    if (!online()) { set("off"); return; }
    if (syncing) return;
    syncing = true;
    pulled = false; // fino alla lettura del profilo non si invia nulla
    try {
      set("busy");
      const r = await Native.pullSettings();
      if (!r.ok) return set("err", r.error || "");
      if (!r.supported) return set("old");
      let remote = null;
      try { remote = r.settings ? JSON.parse(r.settings) : null; } catch {}
      pulled = true;
      if (remote && remote.prefs && remote.prefs.tracker) remoteTracker = remote.prefs.tracker;
      // installazione nuova (o altro account): il profilo del server vince sempre, qualunque ora abbiano le modifiche locali
      const known = store.get(OK_KEY) === acct();
      if (remote && (!known || (remote.t || 0) > localT())) apply(remote);
      else if (localT() > 0 || !remote) { if (localT() === 0) store.set(T_KEY, String(Date.now())); await push(); }
      if (state === "err") return;
      store.set(OK_KEY, acct());
      set("ok");
    } finally { syncing = false; }
  }

  const api = {
    onState: null,
    sync,
    label() {
      if (!online()) return "Solo su questo telefono";
      return { busy: "Sincronizzazione…", ok: "Salvate nel profilo", old: "Server da aggiornare", err: "Non sincronizzate" + (detail ? ` (${detail})` : ""), off: "–" }[state];
    },
    state: () => state,
  };

  Prefs.onSaved = touch;
  Names.setOnSave(touch);
  return api;
})();
