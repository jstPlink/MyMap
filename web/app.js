// Interfaccia di MyMap: mappa, statistiche, tracker, impostazioni. Il motore (Native) è in native.js.
const $ = (id) => document.getElementById(id);

const map = L.map("map").setView([45.4642, 9.19], 13);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19, attribution: "&copy; OpenStreetMap",
}).addTo(map);
const layer = L.layerGroup().addTo(map);
const meLayer = L.layerGroup().addTo(map);
let points = [];      // tutti i punti (statistiche, filtri)
let drawPts = [];      // versione alleggerita per il disegno
let statsFor = -2;     // per quanti punti sono state calcolate le statistiche
let loadedTotal = -1;  // quanti punti c'erano all'ultimo caricamento

// ---------- schede ----------
function show(view) {
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + view));
  document.querySelectorAll("nav button").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  if (view === "map") { map.invalidateSize(); loadPoints(); }
  if (view === "stats" && statsFor !== loadedTotal) { renderStats(points); statsFor = loadedTotal; } // si ricalcola solo se ci sono punti nuovi
  if (view === "tracker") refreshStatus();
}
document.querySelectorAll("nav button").forEach((b) => (b.onclick = () => show(b.dataset.view)));

// ---------- filtri: anno, mese, giorno ----------
const ts2 = (ts) => { const d = new Date(ts); return [d.getFullYear(), d.getMonth(), d.getDate()]; };
const opt = (v, t) => `<option value="${v}">${t}</option>`;

function fillFilters() {
  const ys = $("f-year"), ms = $("f-month"), ds = $("f-day");
  const keep = [ys.value, ms.value, ds.value];
  const dates = points.map((p) => ts2(p.ts));
  const years = [...new Set(dates.map((d) => d[0]))].sort((a, b) => b - a);
  ys.innerHTML = opt("", "Tutti gli anni") + years.map((y) => opt(y, y)).join("");
  if (years.map(String).includes(keep[0])) ys.value = keep[0];

  const inYear = dates.filter((d) => !ys.value || d[0] === +ys.value);
  const months = [...new Set(inYear.map((d) => d[1]))].sort((a, b) => a - b);
  ms.innerHTML = opt("", "Tutti i mesi") + months.map((m) => opt(m, MESI[m])).join("");
  if (months.map(String).includes(keep[1])) ms.value = keep[1];

  const inMonth = inYear.filter((d) => ms.value === "" || d[1] === +ms.value);
  const days = [...new Set(inMonth.map((d) => d[2]))].sort((a, b) => a - b);
  ds.innerHTML = opt("", "Tutti i giorni") + days.map((d) => opt(d, d)).join("");
  ds.disabled = ms.value === "";
  if (ms.value !== "" && days.map(String).includes(keep[2])) ds.value = keep[2];
}

function filtered() {
  const y = $("f-year").value, m = $("f-month").value, d = $("f-day").value;
  if (!y && m === "" && !d) return drawPts;
  return drawPts.filter((p) => {
    const [py, pm, pd] = ts2(p.ts);
    return (!y || py === +y) && (m === "" || pm === +m) && (!d || pd === +d);
  });
}

["f-year", "f-month", "f-day"].forEach((id) => ($(id).onchange = () => { fillFilters(); render(true); }));

// ---------- posizione attuale ----------
let here = null;
async function locate() {
  try { here = await Native.location(); } catch { here = null; }
  if (!here && points.length) { const p = points[points.length - 1]; here = { lat: p.lat, lon: p.lon, approx: true }; }
  return here;
}
function drawMe() {
  meLayer.clearLayers();
  if (!here) return;
  L.circleMarker([here.lat, here.lon], { radius: 8, color: "#fff", weight: 3, fillColor: "#1e88e5", fillOpacity: 1 }).addTo(meLayer);
}
$("locate").onclick = async () => { await locate(); if (here) { drawMe(); map.setView([here.lat, here.lon], 15); } };

// ---------- viste della mappa ----------
let mode = "scratch"; // vista principale
let firstRender = true; // all'apertura la mappa si centra su dove sei, non sull'intero storico
// SVG e non canvas: nella WebView di Android il canvas 2D di Leaflet bloccava l'interfaccia per ~2 secondi a ogni disegno
const canvas = L.svg({ padding: 0.1 });
const fmtDay = (ts) => new Date(ts).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });

// Percorsi, Heatmap e Scratch si ridisegnano da soli quando la mappa si muove (repaint) e disegnano
// solo quello che si vede, semplificato in base allo zoom: decine di migliaia di vertici bloccavano il telefono.
let repaint = null;

function bbox(pts, lat = (p) => p.lat, lon = (p) => p.lon) {
  let a = 90, b = 180, c = -90, d = -180;
  for (const p of pts) { const y = lat(p), x = lon(p); if (y < a) a = y; if (y > c) c = y; if (x < b) b = x; if (x > d) d = x; }
  return [[a, b], [c, d]];
}

// Punti nell'area visibile (più un margine), con distanza minima tra loro proporzionale allo zoom
function viewPts(pts, minMeters) {
  const bnd = map.getBounds().pad(0.5), c = map.getCenter();
  const mpp = 156543 * Math.cos(c.lat * Math.PI / 180) / 2 ** map.getZoom(); // metri per pixel
  const inside = pts.filter((p) => bnd.contains([p.lat, p.lon]));
  return thin(inside, Math.max(minMeters, mpp * 2), 5 * 60000);
}

// Percorsi: la traccia si spezza dove c'è un buco di più di 5 minuti (sosta o tracking fermo)
function drawRoutes(pts) {
  let dist = 0;
  for (let i = 1; i < pts.length; i++) if (pts[i].ts - pts[i - 1].ts <= 5 * 60000) dist += km(pts[i - 1], pts[i]);
  repaint = () => {
    layer.clearLayers();
    const segs = [];
    let cur = [];
    const v = viewPts(pts, 10);
    v.forEach((p, i) => {
      if (i && p.ts - v[i - 1].ts > 5 * 60000) { segs.push(cur); cur = []; }
      cur.push([p.lat, p.lon]);
    });
    if (cur.length) segs.push(cur);
    segs.forEach((s) => {
      if (s.length > 1) L.polyline(s, { color: "#00796b", weight: 2.5, opacity: .3, renderer: canvas }).addTo(layer);
      else L.circleMarker(s[0], { radius: 3, color: "#009688", weight: 1, fillOpacity: .8, renderer: canvas }).addTo(layer); // punto isolato (sosta)
    });
  };
  return { dist, fit: bbox(pts), info: "Il tuo tracciato. Filtra per anno, mese o giorno per vedere un solo periodo." };
}

// Heatmap: tra due punti vicini nel tempo si aggiungono punti intermedi, così i percorsi fatti più volte "si scaldano"
function drawHeat(pts) {
  repaint = () => {
    layer.clearLayers();
    const v = viewPts(pts, 15), heat = [];
    v.forEach((p, i) => {
      heat.push([p.lat, p.lon, 1]);
      const q = v[i - 1];
      if (!q || p.ts - q.ts > 20 * 60000) return;
      const d = km(q, p);
      if (d < 0.1 || d > 30) return;
      const steps = heat.length > 40000 ? 1 : Math.min(40, Math.floor(d / 0.1));
      for (let k = 1; k < steps; k++) heat.push([q.lat + (p.lat - q.lat) * k / steps, q.lon + (p.lon - q.lon) * k / steps, 1]);
    });
    L.heatLayer(heat, { radius: 9, blur: 12, minOpacity: .35, max: 30, gradient: { .2: "#3b82f6", .45: "#22c55e", .7: "#facc15", 1: "#ef4444" } }).addTo(layer);
  };
  return { fit: bbox(pts), info: "Più il colore è caldo, più spesso sei passato di lì." };
}

// Scratch map: esagoni azzurri sulle zone visitate. Il più piccolo è largo 200 m; più si allontana lo zoom, più crescono.
function drawScratch(pts) {
  const cache = new Map();   // livello -> esagoni visitati a quel livello
  let shown = -1;
  repaint = () => {
    const level = hexLevelFor(map);
    if (!cache.has(level)) cache.set(level, hexCells(pts, level));
    const hex = cache.get(level), S = hex.S;
    layer.clearLayers();
    const bnd = map.getBounds().pad(0.3);
    hex.cells.filter((h) => bnd.contains([h[2], h[3]])).forEach((h) => {
      L.polygon(hexCorners(h[0], h[1], S), {
        renderer: canvas, color: "#0284c7", weight: 1, opacity: .55, fillColor: "#38bdf8", fillOpacity: .5, interactive: false, smoothFactor: 0,
      }).addTo(layer);
    });
    if (level !== shown) {
      shown = level;
      if (!cache.has(0)) cache.set(0, hexCells(pts, 0));
      const fine = cache.get(0); // i numeri si danno sempre sugli esagoni più piccoli: a zoom lontano gli esagoni grandi sovrastimano l'area
      const width = Math.round(2 * S / HEX_K / 10) * 10; // diametro reale (da vertice a vertice), in metri
      $("modeinfo").textContent = `${fine.cells.length.toLocaleString("it-IT")} esagoni visitati · ≈ ${fine.area.toFixed(0)} km² grattati · ora esagoni da ${width >= 1000 ? (width / 1000).toFixed(1) + " km" : width + " m"}`;
    }
  };
  return { fit: bbox(pts), info: "" };
}

// fit = true quando l'utente cambia vista o filtro: allora la mappa inquadra i dati; all'avvio resta su dove sei
function render(fit) {
  layer.clearLayers();
  repaint = null;
  const pts = filtered();
  const last = pts[pts.length - 1];
  const draw = { scratch: drawScratch, heat: drawHeat, routes: drawRoutes }[mode];
  const r = pts.length ? draw(pts) : { dist: 0, fit: [], info: "Nessun punto nel periodo scelto." };
  map.invalidateSize();
  if (firstRender && here) {
    map.setView([here.lat, here.lon], 15);
  } else if (fit && r.fit.length) {
    map.fitBounds(L.latLngBounds(r.fit), { padding: [30, 30], maxZoom: 17 });
  }
  firstRender = false;
  if (r.info) $("modeinfo").textContent = r.info;
  if (repaint) repaint();
  let dist = r.dist;
  if (dist === undefined) { dist = 0; for (const s of moveSteps(pts)) dist += s.d; }
  $("s-points").textContent = pts.length;
  $("s-km").textContent = dist.toFixed(1);
  $("s-last").textContent = last ? new Date(last.ts).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "–";
}
let moveTimer = null;
map.on("moveend", () => { clearTimeout(moveTimer); moveTimer = setTimeout(() => repaint && repaint(), 120); });

document.querySelectorAll("#modes button").forEach((b) => (b.onclick = () => {
  mode = b.dataset.mode;
  document.querySelectorAll("#modes button").forEach((x) => x.classList.toggle("active", x === b));
  render(true);
}));

async function loadPoints() {
  const total = Native.status().total;
  if (total === loadedTotal && points.length) return; // niente ricarico se non ci sono punti nuovi
  points = clean(await Native.points());
  loadedTotal = total;
  drawPts = thin(points, 15, 5 * 60000);
  if (firstRender) { await locate(); drawMe(); }
  fillFilters();
  render(false);
}

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
setInterval(() => { if ($("view-tracker").classList.contains("active")) refreshStatus(); }, 3000);

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
