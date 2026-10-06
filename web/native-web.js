// Modalità web di MyMap: il sito servito da PocketBase (cartella pb_public) allo stesso indirizzo del database.
// Stessa interfaccia dell'app (vedi native.js) ma senza tracciamento: i punti arrivano dall'API del server, l'accesso è con email e
// password dello stesso account dell'app, impostazioni e nomi sono nel profilo (campo `settings`), come nell'app.
// Il token resta nel browser (localStorage); la password non viene mai memorizzata.

// Il sito è servito da un PocketBase? (risponde /api/health sullo stesso indirizzo). `?demo=1` forza i dati demo.
function isPocketBaseHost() {
  if (!/^https?:$/.test(location.protocol) || /[?&]demo=1/.test(location.search)) return false;
  try {
    const x = new XMLHttpRequest();
    x.open("GET", "/api/health", false); // sincrono: serve sapere subito che modalità usare
    x.send();
    return x.status === 200 && JSON.parse(x.responseText).code === 200;
  } catch { return false; }
}

function makeWebNative() {
  const AUTH_KEY = "mymap.web";
  const PER_PAGE = 500, PARALLEL = 6;
  const state = { total: 0 };
  const readAuth = () => { try { return JSON.parse(localStorage.getItem(AUTH_KEY) || "null") || {}; } catch { return {}; } };
  const writeAuth = (a) => { try { a ? localStorage.setItem(AUTH_KEY, JSON.stringify(a)) : localStorage.removeItem(AUTH_KEY); } catch {} };
  const errText = (j) => {
    if (!j) return "Errore di rete";
    const d = j.data && Object.values(j.data)[0];
    return (d && d.message) || j.message || "Errore del server";
  };
  const expired = () => { writeAuth(null); idbClear(); state.total = 0; if (window.onWebExpired) window.onWebExpired(); };

  async function call(method, path, body, token) {
    const tok = token === undefined ? readAuth().token : token;
    let r;
    try {
      r = await fetch(path, { method, headers: { "Content-Type": "application/json", ...(tok ? { Authorization: tok } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch { return { code: 0, j: null }; }
    let j = null; try { j = await r.json(); } catch {}
    return { code: r.status, j };
  }
  // chiamata con accesso: un 401 vuol dire token scaduto, si torna alla schermata di accesso
  async function authed(method, path, body) {
    const r = await call(method, path, body);
    if (r.code === 401) expired();
    return r;
  }

  // ---------- cache dei punti nel browser (IndexedDB): dopo la prima volta si scaricano solo i punti nuovi ----------
  const idb = () => new Promise((res, rej) => { const q = indexedDB.open("mymap", 1); q.onupgradeneeded = () => q.result.createObjectStore("kv"); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
  const idbGet = async (k) => { try { const d = await idb(); return await new Promise((res) => { const q = d.transaction("kv").objectStore("kv").get(k); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); }); } catch { return null; } };
  const idbSet = async (k, v) => { try { const d = await idb(); await new Promise((res) => { const t = d.transaction("kv", "readwrite"); t.objectStore("kv").put(v, k); t.oncomplete = t.onerror = res; }); } catch {} };
  const idbClear = () => idb().then((d) => new Promise((res) => { const t = d.transaction("kv", "readwrite"); t.objectStore("kv").clear(); t.oncomplete = t.onerror = res; })).catch(() => {});

  // Tutte le pagine di `points` (ordinate per tempo) per un filtro e un elenco di campi, PARALLEL alla volta. Restituisce i record.
  async function fetchAll(filter, fields) {
    const url = (p) => `/api/collections/points/records?page=${p}&perPage=${PER_PAGE}&sort=ts,id&fields=${fields}` + (filter ? `&filter=${encodeURIComponent(filter)}` : "");
    const first = await authed("GET", url(1));
    if (first.code !== 200) throw new Error(first.code === 401 ? "accesso scaduto" : errText(first.j));
    const pages = [first.j.items], n = first.j.totalPages;
    let next = 2;
    const worker = async () => {
      while (next <= n) {
        const p = next++;
        const r = await authed("GET", url(p));
        if (r.code !== 200) throw new Error(errText(r.j));
        pages[p - 1] = r.j.items;
      }
    };
    await Promise.all(Array.from({ length: Math.min(PARALLEL, Math.max(0, n - 1)) }, worker));
    return pages.flat();
  }
  async function countWhere(filter) {
    const r = await authed("GET", `/api/collections/points/records?perPage=1&fields=id${filter ? `&filter=${encodeURIComponent(filter)}` : ""}`);
    return r.code === 200 ? r.j.totalItems : -1;
  }
  async function refreshCount() {
    if (!readAuth().token) { state.total = 0; return; }
    const n = await countWhere("");
    if (n >= 0) state.total = n;
  }

  // stesso formato compatto dell'app: ts in secondi, lat e lon x1e6, accuratezza in metri (0 se ignota)
  const pack = (items) => {
    const v = new Int32Array(items.length * 4);
    items.forEach((p, i) => { v[i * 4] = Math.floor(p.ts / 1000); v[i * 4 + 1] = Math.round(p.lat * 1e6); v[i * 4 + 2] = Math.round(p.lon * 1e6); v[i * 4 + 3] = Math.round(p.accuracy || 0); });
    return v;
  };
  const unpack = (v) => {
    const out = new Array(v.length / 4);
    for (let i = 0; i < out.length; i++) out[i] = { ts: v[i * 4] * 1000, lat: v[i * 4 + 1] / 1e6, lon: v[i * 4 + 2] / 1e6, acc: v[i * 4 + 3] };
    return out;
  };

  async function loadPoints() {
    const a = readAuth();
    if (!a.token) { state.total = 0; return []; }
    const key = "pts:" + a.id;
    const cached = await idbGet(key);
    let v = cached ? new Int32Array(cached.buf) : new Int32Array(0), lastMs = cached ? cached.lastMs : 0;
    try {
      // la cache vale se i punti fino all'ultimo che ha sono ancora tanti quanti erano (altrimenti ne sono stati tolti: si riscarica tutto)
      if (cached && (await countWhere(`ts<=${lastMs}`)) !== v.length / 4) { v = new Int32Array(0); lastMs = 0; }
      const fresh = await fetchAll(lastMs ? `ts>${lastMs}` : "", "ts,lat,lon,accuracy");
      if (fresh.length) {
        const add = pack(fresh), merged = new Int32Array(v.length + add.length);
        merged.set(v); merged.set(add, v.length);
        v = merged;
        lastMs = fresh[fresh.length - 1].ts;
        idbSet(key, { buf: v.buffer, lastMs });
      }
    } catch (e) {
      if (!v.length) throw e; // niente cache e niente rete: l'errore lo vede chi chiama
    }
    state.total = v.length / 4;
    return unpack(v);
  }

  // ---------- esportazione: scarica dal server tutti i campi e salva un file ----------
  async function exportData(fmt) {
    const rows = await fetchAll("", "ts,lat,lon,accuracy,speed,bearing,altitude,provider,battery");
    const iso = (t) => new Date(t).toISOString().replace(/\.\d+Z$/, "Z"), nz = (x) => (x == null ? "null" : x), e = (x) => (x == null ? "" : x);
    let text, type;
    if (fmt === "gpx") {
      let last = 0, open = false, s = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="MyMap" xmlns="http://www.topografix.com/GPX/1/1">\n<trk><name>MyMap</name>\n`;
      for (const p of rows) {
        if (!open || p.ts - last > 30 * 60000) { if (open) s += "</trkseg>\n"; s += "<trkseg>\n"; open = true; }
        s += `<trkpt lat="${p.lat}" lon="${p.lon}">${p.altitude != null ? `<ele>${p.altitude}</ele>` : ""}<time>${iso(p.ts)}</time></trkpt>\n`;
        last = p.ts;
      }
      text = s + (open ? "</trkseg>\n" : "") + "</trk>\n</gpx>\n"; type = "application/gpx+xml";
    } else if (fmt === "json") {
      text = "[" + rows.map((p) => `{"time":"${iso(p.ts)}","ts":${p.ts},"lat":${p.lat},"lon":${p.lon},"accuracy":${nz(p.accuracy)},"speed":${nz(p.speed)},"bearing":${nz(p.bearing)},"altitude":${nz(p.altitude)},"provider":${JSON.stringify(p.provider || "")},"battery":${p.battery || 0}}`).join(",\n") + "]\n";
      type = "application/json";
    } else {
      text = "time_iso,ts_ms,lat,lon,accuracy_m,speed_ms,bearing,altitude_m,provider,battery\n" +
        rows.map((p) => `${iso(p.ts)},${p.ts},${p.lat},${p.lon},${e(p.accuracy)},${e(p.speed)},${e(p.bearing)},${e(p.altitude)},${p.provider || ""},${p.battery || 0}`).join("\n") + "\n";
      type = "text/csv";
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = `mymap.${fmt}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    return rows.length;
  }

  async function login(email, password) {
    const r = await call("POST", "/api/collections/users/auth-with-password", { identity: email, password }, "");
    if (r.code === 0) return { ok: false, error: "Server non raggiungibile" };
    if (r.code !== 200) return { ok: false, error: r.code === 400 ? "Email o password non corretti" : errText(r.j) };
    writeAuth({ token: r.j.token, id: r.j.record.id, email: r.j.record.email });
    return { ok: true };
  }

  // il token dura qualche giorno: a ogni apertura si rinnova (se è già scaduto, si torna all'accesso)
  if (readAuth().token) call("POST", "/api/collections/users/auth-refresh").then((r) => {
    if (r.code === 200) writeAuth({ ...readAuth(), token: r.j.token });
    else if (r.code === 401 || r.code === 403) expired();
  });
  setInterval(() => { if (!document.hidden) refreshCount(); }, 60000); // punti nuovi arrivati dal telefono
  refreshCount();

  const none = async () => ({ ok: false, error: "Disponibile solo nell'app Android" });
  return {
    isApp: false, isWeb: true,
    status: () => ({ version: "web", build: "", total: state.total, pending: 0, lastSync: "–", tracking: false }),
    config: () => ({ url: location.origin, email: readAuth().email || "", hasPassword: false }),
    session: () => { const a = readAuth(); return { mode: a.token ? "server" : "none", url: location.origin, email: a.email || "", oauth: false }; },
    points: loadPoints,
    loginEmail: async ({ email, password, create }) => {
      if (create) {
        const r = await call("POST", "/api/collections/users/records", { email, password, passwordConfirm: password }, "");
        if (r.code === 0) return { ok: false, error: "Server non raggiungibile" };
        if (r.code !== 200) return { ok: false, error: errText(r.j) };
      }
      return login(email, password);
    },
    pullSettings: async () => {
      const r = await authed("GET", `/api/collections/users/records/${readAuth().id}`);
      if (r.code !== 200) return { ok: false, error: r.code === 401 ? "accesso scaduto" : errText(r.j) };
      if (!("settings" in r.j)) return { ok: true, supported: false, settings: null };
      const s = r.j.settings, empty = s == null || s === "" || (typeof s === "object" && !Object.keys(s).length);
      return { ok: true, supported: true, settings: empty ? null : JSON.stringify(s) };
    },
    pushSettings: async (json) => {
      const r = await authed("PATCH", `/api/collections/users/records/${readAuth().id}`, { settings: JSON.parse(json) });
      return r.code === 200 ? { ok: true, error: "" } : { ok: false, error: errText(r.j) };
    },
    changePassword: async ({ old, new: nw }) => {
      const a = readAuth();
      const r = await authed("PATCH", `/api/collections/users/records/${a.id}`, { oldPassword: old, password: nw, passwordConfirm: nw });
      if (r.code !== 200) return { ok: false, error: r.code === 400 && r.j && r.j.data && r.j.data.oldPassword ? "La password attuale non è corretta" : errText(r.j) };
      return login(a.email, nw); // il cambio invalida i token precedenti: se ne prende uno nuovo
    },
    deleteAccount: async () => {
      // cancella l'utente: PocketBase elimina a cascata anche tutti i suoi punti
      const r = await authed("DELETE", `/api/collections/users/records/${readAuth().id}`);
      if (r.code < 200 || r.code >= 300) return { ok: false, error: r.code === 401 ? "Accesso scaduto: accedi di nuovo" : errText(r.j) };
      writeAuth(null); idbClear(); state.total = 0;
      return { ok: true, error: "" };
    },
    resetPassword: async ({ email }) => {
      const r = await call("POST", "/api/collections/users/request-password-reset", { email }, "");
      if (r.code >= 200 && r.code < 300) return { ok: true };
      return { ok: false, error: r.code === 400 ? "Il server non riesce a inviare email: controlla le impostazioni di posta (SMTP) in PocketBase" : errText(r.j) };
    },
    loginGoogle: none, cancelGoogle: () => {}, useLocal: () => {},
    logout: () => { writeAuth(null); idbClear(); state.total = 0; },
    exportData,
    setTheme: () => {},
    haptic: () => { try { navigator.vibrate && navigator.vibrate(8); } catch {} },
    location: () => new Promise((res) => {
      if (!navigator.geolocation) return res(null);
      navigator.geolocation.getCurrentPosition((p) => res({ lat: p.coords.latitude, lon: p.coords.longitude }), () => res(null), { timeout: 4000 });
    }),
    // tutto ciò che riguarda il tracciamento esiste solo nell'app
    fix: none,
    health: () => ({ tracking: false, running: false, lastTs: 0, fine: true, bg: true, battery: true, notif: true }),
    trackerConfig: () => ({ movingSec: 5, stillPoints: 1, stillMinutes: 10 }),
    setTrackerConfig: () => {}, openAppSettings: () => {}, cleanPoints: () => ({ total: 0, accuracy: 0, spikes: 0, stays: 0 }),
    start: () => {}, stop: () => {}, sync: () => {}, battery: () => {},
  };
}
