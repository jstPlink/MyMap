// Interfaccia di MyMap: mappa, tracker, impostazioni. Il motore (Native) è in native.js.
const $ = (id) => document.getElementById(id);

const map = L.map("map").setView([45.4642, 9.19], 13);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19, attribution: "&copy; OpenStreetMap",
}).addTo(map);
const layer = L.layerGroup().addTo(map);
let points = [];

// ---------- schede ----------
let current = "map";
function show(view) {
  current = view;
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + view));
  document.querySelectorAll("nav button").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  if (view === "map") { map.invalidateSize(); loadPoints(); }
  if (view === "tracker") refreshStatus();
}
document.querySelectorAll("nav button").forEach((b) => (b.onclick = () => show(b.dataset.view)));

// ---------- mappa ----------
const dayKey = (ts) => new Date(ts).toLocaleDateString("it-IT");

function km(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function loadPoints() {
  points = await Native.points();
  const sel = $("day"), prev = sel.value;
  const days = [...new Set(points.map((p) => dayKey(p.ts)))];
  sel.innerHTML = '<option value="">Tutti i giorni</option>' + days.map((d) => `<option>${d}</option>`).join("");
  if (days.includes(prev)) sel.value = prev;
  render();
}

// ---------- viste della mappa ----------
let mode = "routes";
const canvas = L.canvas({ padding: 0.5 });
const fmtDay = (ts) => new Date(ts).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });

// Percorsi: la traccia si spezza dove c'è un buco di più di 5 minuti (sosta o tracking fermo)
function drawRoutes(pts) {
  const segs = [];
  let cur = [], dist = 0;
  pts.forEach((p, i) => {
    if (i && p.ts - pts[i - 1].ts > 5 * 60000) { segs.push(cur); cur = []; }
    else if (i) dist += km(pts[i - 1], p);
    cur.push([p.lat, p.lon]);
  });
  if (cur.length) segs.push(cur);
  segs.forEach((s) => {
    if (s.length > 1) L.polyline(s, { color: "#009688", weight: 4, opacity: .85, renderer: canvas }).addTo(layer);
    else L.circleMarker(s[0], { radius: 3, color: "#009688", weight: 1, fillOpacity: .8, renderer: canvas }).addTo(layer); // punto isolato (sosta)
  });
  const last = pts[pts.length - 1];
  if (last) L.circleMarker([last.lat, last.lon], { radius: 7, color: "#00796b", fillColor: "#fff", fillOpacity: 1 }).addTo(layer);
  return { dist, fit: segs.flat(), info: "Il tuo tracciato. Scegli un giorno per vedere un solo percorso." };
}

// Heatmap: tra due punti vicini nel tempo si aggiungono punti intermedi, così i percorsi fatti più volte "si scaldano"
function drawHeat(pts) {
  const heat = [];
  pts.forEach((p, i) => {
    heat.push([p.lat, p.lon, 1]);
    const q = pts[i - 1];
    if (!q || p.ts - q.ts > 20 * 60000) return;
    const d = km(q, p);
    if (d < 0.05 || d > 30) return;
    const steps = Math.min(200, Math.floor(d / 0.05));
    for (let k = 1; k < steps; k++) heat.push([q.lat + (p.lat - q.lat) * k / steps, q.lon + (p.lon - q.lon) * k / steps, 1]);
  });
  L.heatLayer(heat, { radius: 9, blur: 12, minOpacity: .35, max: 30, gradient: { .2: "#3b82f6", .45: "#22c55e", .7: "#facc15", 1: "#ef4444" } }).addTo(layer);
  return { fit: pts.map((p) => [p.lat, p.lon]), info: "Più il colore è caldo, più spesso sei passato di lì." };
}

// Scratch map: il mondo è coperto e le zone visitate si "grattano" (celle di circa 500 m)
function drawScratch(pts) {
  const S = 0.005, cells = new Map();
  pts.forEach((p) => {
    const y = Math.floor(p.lat / S), x = Math.floor(p.lon / S);
    cells.set(y * 100000 + x, [y, x]);
  });
  const rows = [...cells.values()];
  rows.forEach(([y, x]) => {
    L.rectangle([[y * S, x * S], [(y + 1) * S, (x + 1) * S]],
      { renderer: canvas, stroke: false, fillColor: "#ffb300", fillOpacity: .65, interactive: false }).addTo(layer);
  });
  const area = rows.reduce((a, [y]) => a + (S * 111.32) * (S * 111.32 * Math.cos((y + .5) * S * Math.PI / 180)), 0);
  const fit = rows.map(([y, x]) => [y * S, x * S]);
  return { fit, info: `${rows.length} celle visitate (≈ ${area.toFixed(0)} km² grattati). Ognuna è larga circa 500 m.` };
}

// Soste: dove hai passato più tempo. Il tempo tra due punti vicini (<150 m, <3 h) va alla cella di partenza
function drawStays(pts) {
  const S = 0.002, cells = new Map();
  pts.forEach((p, i) => {
    const n = pts[i + 1];
    if (!n) return;
    const dt = n.ts - p.ts;
    if (dt <= 0 || dt > 3 * 3600000 || km(p, n) > 0.15) return;
    const key = Math.floor(p.lat / S) * 100000 + Math.floor(p.lon / S);
    const c = cells.get(key) || { ms: 0, lat: 0, lon: 0, w: 0, first: p.ts, last: p.ts };
    c.ms += dt; c.lat += p.lat * dt; c.lon += p.lon * dt; c.w += dt; c.first = Math.min(c.first, p.ts); c.last = Math.max(c.last, n.ts);
    cells.set(key, c);
  });
  const top = [...cells.values()].filter((c) => c.ms >= 20 * 60000).sort((a, b) => b.ms - a.ms).slice(0, 60);
  const hours = (c) => c.ms / 3600000;
  top.forEach((c, i) => {
    const h = hours(c);
    L.circle([c.lat / c.w, c.lon / c.w], { radius: 40 + 40 * Math.sqrt(h), color: "#6a1b9a", weight: 1, fillColor: "#ab47bc", fillOpacity: .45 })
      .bindPopup(`<b>#${i + 1}</b> · ${h >= 48 ? (h / 24).toFixed(1) + " giorni" : h.toFixed(1) + " ore"}<br>${fmtDay(c.first)} – ${fmtDay(c.last)}`)
      .addTo(layer);
  });
  const best = top[0];
  return {
    fit: top.map((c) => [c.lat / c.w, c.lon / c.w]),
    info: best ? `Top ${top.length} luoghi dove ti sei fermato di più (il primo: ${hours(best).toFixed(0)} ore in totale). Tocca i cerchi per i dettagli.` : "Nessuna sosta lunga trovata.",
  };
}

function render() {
  layer.clearLayers();
  const day = $("day").value;
  const pts = day ? points.filter((p) => dayKey(p.ts) === day) : points;
  const last = pts[pts.length - 1];
  const draw = { routes: drawRoutes, heat: drawHeat, scratch: drawScratch, stays: drawStays }[mode];
  const r = pts.length ? draw(pts) : { dist: 0, fit: [], info: "Nessun punto." };
  map.invalidateSize();
  if (r.fit.length) map.fitBounds(L.latLngBounds(r.fit), { padding: [30, 30], maxZoom: 17 });
  $("modeinfo").textContent = r.info;
  let dist = r.dist;
  if (dist === undefined) { dist = 0; pts.forEach((p, i) => { if (i && p.ts - pts[i - 1].ts <= 5 * 60000) dist += km(pts[i - 1], p); }); }
  $("s-points").textContent = pts.length;
  $("s-km").textContent = dist.toFixed(1);
  $("s-last").textContent = last ? new Date(last.ts).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "–";
}
document.querySelectorAll("#modes button").forEach((b) => (b.onclick = () => {
  mode = b.dataset.mode;
  document.querySelectorAll("#modes button").forEach((x) => x.classList.toggle("active", x === b));
  render();
}));
$("day").onchange = render;

// ---------- tracker ----------
function refreshStatus() {
  const s = Native.status();
  $("version").textContent = s.build ? `v${s.version} (build ${s.build})` : s.version;
  $("badge").textContent = s.tracking ? "attivo" : "fermo";
  $("badge").classList.toggle("on", s.tracking);
  $("t-state").textContent = s.tracking ? "Tracking ATTIVO" : "Tracking fermo";
  $("t-state").classList.toggle("on", s.tracking);
  $("t-total").textContent = s.total;
  $("t-pending").textContent = s.pending;
  $("t-sync").textContent = s.lastSync;
  $("toggle").textContent = s.tracking ? "Ferma tracking" : "Avvia tracking";
  $("toggle").classList.toggle("danger", s.tracking);
}
$("toggle").onclick = () => {
  Native.status().tracking ? Native.stop() : Native.start();
  setTimeout(refreshStatus, 400);
};
$("sync").onclick = () => { Native.sync(); setTimeout(refreshStatus, 400); };
$("battery").onclick = () => Native.battery();
$("battery").hidden = !Native.isApp;
setInterval(() => { refreshStatus(); }, 3000);

// ---------- impostazioni ----------
function say(text, err) { $("msg").textContent = text; $("msg").classList.toggle("err", !!err); }
const cfg = Native.config();
$("url").value = cfg.url; $("email").value = cfg.email || "";
if (cfg.hasPassword) $("pw").placeholder = "Password (già salvata)";

$("save").onclick = async () => {
  say("Connessione…");
  const ok = await Native.saveConfig({ url: $("url").value, email: $("email").value, password: $("pw").value });
  say(ok ? "Login riuscito" : "Login fallito o server non raggiungibile", !ok);
  $("pw").value = "";
};

refreshStatus();
loadPoints();
