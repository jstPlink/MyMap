// Adattatore tra l'interfaccia e il "motore" che registra e sincronizza i punti.
//  - dentro l'app Android: usa il ponte nativo (window.MyMapNative) con tracking e buffer veri;
//  - nel browser: simula tutto con dati demo (i dati veri si vedono solo nell'app).
const store = {
  get: (k) => { try { return localStorage.getItem(k) || ""; } catch { return ""; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};

const Native = (() => {
  const real = window.MyMapNative;

  if (real) {
    let authPending = null;
    const waiting = {}; let seq = 0;
    window.__nativeResult = (id, r) => { const f = waiting[id]; delete waiting[id]; if (f) f(r); };
    const ask = (fn) => new Promise((res) => { const id = ++seq; waiting[id] = res; fn(id); });
    window.__authResult = (r) => { if (authPending) { authPending(r); authPending = null; } };
    return {
      isApp: true,
      status: () => JSON.parse(real.getStatus()),
      config: () => JSON.parse(real.getConfig()),
      points: async () => {
        const bin = atob(real.getPoints());
        const u8 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        const v = new Int32Array(u8.buffer), out = new Array(v.length / 4);
        for (let i = 0; i < out.length; i++) out[i] = { ts: v[i * 4] * 1000, lat: v[i * 4 + 1] / 1e6, lon: v[i * 4 + 2] / 1e6, acc: v[i * 4 + 3] };
        return out;
      },
      start: () => real.startTracking(),
      stop: () => real.stopTracking(),
      sync: () => real.syncNow(),
      repull: () => real.repullHistory(),
      location: async () => { const t = real.getLocation(); return t ? JSON.parse(t) : null; },
      battery: () => real.requestIgnoreBattery(),
      session: () => JSON.parse(real.getSession()),
      loginEmail: (c) => new Promise((res) => { authPending = res; real.loginEmail(JSON.stringify(c)); }),
      pullSettings: () => ask((id) => real.pullSettings(id)),
      pushSettings: (json) => ask((id) => real.pushSettings(id, json)),
      changePassword: (c) => new Promise((res) => { authPending = res; real.changePassword(JSON.stringify(c)); }),
      resetPassword: (c) => new Promise((res) => { authPending = res; real.resetPassword(JSON.stringify(c)); }),
      loginGoogle: (url) => new Promise((res) => { authPending = res; real.loginGoogle(url); }),
      cancelGoogle: () => real.cancelGoogle(),
      useLocal: () => real.useLocal(),
      logout: (wipe) => real.logout(wipe),
      exportData: (fmt) => real.exportData(fmt),
      setTheme: (t) => real.setTheme(t),
    };
  }

  // ---------- modalità browser ----------
  const demo = demoPoints();
  const state = { tracking: false, total: demo.length, pending: 0, lastSync: "mai" };
  setInterval(() => {
    if (!state.tracking) return;
    state.total += 1; state.pending += 1;
    if (state.pending >= 20) { state.pending = 0; state.lastSync = new Date().toLocaleTimeString("it-IT"); }
  }, 1000);

  return {
    isApp: false,
    status: () => ({ version: "web", build: "", total: state.total, pending: state.pending, lastSync: state.lastSync, tracking: state.tracking }),
    session: () => ({ mode: "local", url: "", email: "", oauth: false }),
    loginEmail: async () => ({ ok: false, error: "Disponibile solo nell'app Android" }),
    pullSettings: async () => ({ ok: false, error: "solo nell'app" }),
    pushSettings: async () => ({ ok: false, error: "solo nell'app" }),
    changePassword: async () => ({ ok: false, error: "Disponibile solo nell'app Android" }),
    resetPassword: async () => ({ ok: false, error: "Disponibile solo nell'app Android" }),
    loginGoogle: async () => ({ ok: false, error: "Disponibile solo nell'app Android" }),
    cancelGoogle: () => {}, useLocal: () => {}, logout: () => {}, exportData: () => {}, setTheme: () => {},
    points: async () => demo, // nel browser solo dati demo: le credenziali non vanno mai messe nel sito
    start: () => { state.tracking = true; },
    stop: () => { state.tracking = false; },
    location: () => new Promise((res) => {
      if (!navigator.geolocation) return res(null);
      navigator.geolocation.getCurrentPosition((p) => res({ lat: p.coords.latitude, lon: p.coords.longitude }), () => res(null), { timeout: 4000 });
    }),
    sync: () => { state.pending = 0; state.lastSync = new Date().toLocaleTimeString("it-IT"); },
    repull: () => {},
    battery: () => alert("Disponibile solo nell'app Android"),
  };
})();

function demoPoints() {
  // Due giorni di percorsi finti attorno a Milano: andata, sosta di 40 minuti, ritorno.
  const out = [];
  const route = [[45.4642, 9.19], [45.4655, 9.1865], [45.4688, 9.1812], [45.4721, 9.1786], [45.4769, 9.1732], [45.4815, 9.1689]];
  const legs = route.concat(route.slice(0, -1).reverse());
  for (let d = 0; d < 2; d++) {
    let t = Date.now() - (1 - d) * 864e5 - 6 * 36e5;
    for (let i = 0; i < legs.length - 1; i++) {
      for (let s = 0; s < 12; s++) {
        const f = s / 12, j = () => (Math.random() - .5) * 0.0002;
        out.push({
          ts: (t += 15000),
          lat: legs[i][0] + (legs[i + 1][0] - legs[i][0]) * f + j(),
          lon: legs[i][1] + (legs[i + 1][1] - legs[i][1]) * f + j(),
          battery: Math.max(20, 95 - (out.length / 4 | 0)),
        });
      }
      if (i === 4) t += 40 * 60000;
    }
  }
  return out;
}
