// Frontend statico di MyMap. Senza login mostra dati demo; con login legge i punti da PocketBase.
const $ = (id) => document.getElementById(id);
const store = {
  get: (k) => { try { return localStorage.getItem(k) || ""; } catch { return ""; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};

const map = L.map("map").setView([45.4642, 9.19], 13);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19, attribution: "&copy; OpenStreetMap",
}).addTo(map);
const layer = L.layerGroup().addTo(map);

let points = [];   // {ts, lat, lon, battery}
let live = false;

// ---------- dati demo ----------
function demoPoints() {
  // Due giorni di percorsi finti attorno a Milano: andata a piedi, sosta, ritorno.
  const out = [];
  const route = [[45.4642, 9.19], [45.4655, 9.1865], [45.4688, 9.1812], [45.4721, 9.1786], [45.4769, 9.1732], [45.4815, 9.1689]];
  const now = Date.now();
  for (let d = 0; d < 2; d++) {
    const t0 = now - (1 - d) * 864e5 - 6 * 36e5;
    const legs = route.concat(route.slice(0, -1).reverse());
    let t = t0;
    for (let i = 0; i < legs.length - 1; i++) {
      for (let s = 0; s < 12; s++) {
        const f = s / 12, j = () => (Math.random() - .5) * 0.0002;
        out.push({
          ts: t += 15000,
          lat: legs[i][0] + (legs[i + 1][0] - legs[i][0]) * f + j(),
          lon: legs[i][1] + (legs[i + 1][1] - legs[i][1]) * f + j(),
          battery: Math.max(20, 95 - out.length / 4 | 0),
        });
      }
      if (i === 4) t += 40 * 60000; // sosta di 40 minuti
    }
  }
  return out;
}

// ---------- PocketBase ----------
async function pb(path, opts = {}) {
  const base = store.get("url").replace(/\/+$/, "");
  const headers = { "Content-Type": "application/json" };
  const token = store.get("token");
  if (token) headers.Authorization = token;
  const r = await fetch(base + path, { ...opts, headers });
  if (!r.ok) throw new Error(r.status);
  return r.json();
}

async function login(url, email, password) {
  store.set("url", url.trim());
  const res = await pb("/api/collections/users/auth-with-password", {
    method: "POST", body: JSON.stringify({ identity: email.trim(), password }),
  });
  store.set("token", res.token);
  store.set("email", email.trim());
}

async function loadFromServer() {
  const all = [];
  for (let page = 1; ; page++) {
    const res = await pb(`/api/collections/points/records?perPage=500&page=${page}&sort=ts&fields=ts,lat,lon,battery`);
    all.push(...res.items);
    if (page >= res.totalPages) break;
  }
  return all;
}

// ---------- UI ----------
const dayKey = (ts) => new Date(ts).toLocaleDateString("it-IT");

function km(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function fillDays() {
  const days = [...new Set(points.map((p) => dayKey(p.ts)))];
  $("day").innerHTML = '<option value="">Tutti i giorni</option>' + days.map((d) => `<option>${d}</option>`).join("");
}

function render() {
  layer.clearLayers();
  const day = $("day").value;
  const pts = day ? points.filter((p) => dayKey(p.ts) === day) : points;
  // spezza la traccia dove c'è un buco di più di 5 minuti (sosta o tracking fermo)
  const segs = [];
  let cur = [], dist = 0;
  pts.forEach((p, i) => {
    if (i && p.ts - pts[i - 1].ts > 5 * 60000) { segs.push(cur); cur = []; }
    else if (i) dist += km(pts[i - 1], p);
    cur.push([p.lat, p.lon]);
  });
  if (cur.length) segs.push(cur);
  segs.forEach((s) => L.polyline(s, { color: "#009688", weight: 4, opacity: .85 }).addTo(layer));

  const last = pts[pts.length - 1];
  if (last) {
    L.circleMarker([last.lat, last.lon], { radius: 7, color: "#00796b", fillColor: "#fff", fillOpacity: 1 }).addTo(layer);
    map.invalidateSize();
    if (segs.length) map.fitBounds(L.latLngBounds(segs.flat()), { padding: [30, 30] });
  }
  $("s-points").textContent = pts.length;
  $("s-km").textContent = dist.toFixed(1);
  $("s-last").textContent = last ? new Date(last.ts).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "–";
  $("s-batt").textContent = last && last.battery != null ? last.battery + "%" : "–";
}

function setMode(isLive) {
  live = isLive;
  $("mode").textContent = isLive ? "collegato" : "demo";
  $("mode").classList.toggle("live", isLive);
}

function show(list) { points = list; fillDays(); render(); }
function say(text, err) { $("msg").textContent = text; $("msg").classList.toggle("err", !!err); }

$("demo").onclick = () => { setMode(false); say(""); show(demoPoints()); };
$("day").onchange = render;
$("connect").onclick = async () => {
  say("Connessione…");
  try {
    await login($("url").value, $("email").value, $("pw").value);
    const list = await loadFromServer();
    setMode(true);
    say(list.length ? "" : "Collegato, ma non ci sono ancora punti.");
    show(list);
  } catch (e) {
    say("Login fallito o server non raggiungibile (" + e.message + ")", true);
  }
};

// all'apertura: se c'è un token salvato prova a usarlo, altrimenti demo
$("url").value = store.get("url");
$("email").value = store.get("email");
(async () => {
  if (store.get("url") && store.get("token")) {
    try { const list = await loadFromServer(); setMode(true); show(list); return; } catch {}
  }
  show(demoPoints());
})();
