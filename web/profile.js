// Impostazioni nel profilo: con un account su un server, le impostazioni (esagoni, heatmap, notti, linee, tema, nomi dei posti)
// si salvano nel campo JSON `settings` dell'utente, così le ritrovi dopo una reinstallazione o su un altro telefono.
// Vince la modifica più recente: ogni salvataggio locale segna l'ora (mymap.profile_t) e al confronto con il profilo si tiene la più nuova.
// Con il database locale restano solo nel telefono.
const Profile = (() => {
  const T_KEY = "mymap.profile_t";
  let state = "off"; // off | busy | ok | old (il server non ha il campo) | err
  let detail = "";
  let timer = null, applying = false, busy = false, again = false;

  const localT = () => +store.get(T_KEY) || 0;
  const online = () => Native.isApp && session && session.mode === "server";
  const snapshot = () => ({ t: localT(), prefs: Prefs.v, names: Names.snapshot() });
  const set = (s, d = "") => { state = s; detail = d; if (api.onState) api.onState(); };

  async function push() {
    if (!online()) return;
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
    timer = setTimeout(push, 1500);
  }

  function apply(remote) {
    applying = true;
    try {
      Prefs.adopt(remote.prefs || {});
      Prefs.save();
      Names.adopt(remote.names || {});
      store.set(T_KEY, String(remote.t || Date.now()));
    } finally { applying = false; }
    Prefs.applyTheme();
    Native.setTheme(Prefs.v.theme);
    if (window.setBase) setBase();
    buildPrefsUI();
    buildNamesCard();
    statsFor = "";
    render(false);
  }

  async function sync() {
    if (!online()) { set("off"); return; }
    set("busy");
    const r = await Native.pullSettings();
    if (!r.ok) return set("err", r.error || "");
    if (!r.supported) return set("old");
    let remote = null;
    try { remote = r.settings ? JSON.parse(r.settings) : null; } catch {}
    if (remote && (remote.t || 0) > localT()) { apply(remote); set("ok"); }
    else if (localT() > 0 || !remote) { if (localT() === 0) store.set(T_KEY, String(Date.now())); await push(); }
    else set("ok");
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
