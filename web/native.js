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
    let pending = null;
    window.__nativeResult = (ok) => { if (pending) { pending(ok); pending = null; } };
    return {
      isApp: true,
      status: () => JSON.parse(real.getStatus()),
      config: () => JSON.parse(real.getConfig()),
      points: async () => JSON.parse(real.getPoints()),
      start: () => real.startTracking(),
      stop: () => real.stopTracking(),
      sync: () => real.syncNow(),
      battery: () => real.requestIgnoreBattery(),
      saveConfig: (c) => new Promise((res) => { pending = res; real.saveConfigAndLogin(JSON.stringify(c)); }),
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
    config: () => ({ url: store.get("url") || "https://pocketbase.fplinio.it", email: "", hasPassword: false }),
    points: async () => demo, // nel browser solo dati demo: le credenziali non vanno mai messe nel sito
    start: () => { state.tracking = true; },
    stop: () => { state.tracking = false; },
    sync: () => { state.pending = 0; state.lastSync = new Date().toLocaleTimeString("it-IT"); },
    battery: () => alert("Disponibile solo nell'app Android"),
    saveConfig: async (c) => { store.set("url", c.url.trim()); return true; },
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
