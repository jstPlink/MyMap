// Interfaccia di MyMap: mappa, statistiche, tracker, impostazioni. Il motore (Native) è in native.js.
const $ = (id) => document.getElementById(id);

const map = L.map("map").setView([45.4642, 9.19], 13);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19, attribution: "&copy; OpenStreetMap",
}).addTo(map);
const layer = L.layerGroup().addTo(map);
const meLayer = L.layerGroup().addTo(map);
let points = [];

// ---------- schede ----------
function show(view) {
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + view));
  document.querySelectorAll("nav button").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  if (view === "map") { map.invalidateSize(); loadPoints(); }
  if (view === "stats") { renderStats(points); }
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
  if (!y && m === "" && !d) return points;
  return points.filter((p) => {
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
let mode = "routes";
let firstRender = true; // all'apertura la mappa si centra su dove sei, non sull'intero storico
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
  return { dist, fit: segs.flat(), info: "Il tuo tracciato. Filtra per anno, mese o giorno per vedere un solo periodo." };
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

// Scratch map: esagoni azzurri sulle zone visitate (circa 300 m di lato)
function drawScratch(pts) {
  const hex = hexCells(pts);
  hex.cells.forEach(([q, r]) => {
    L.polygon(hexCorners(q, r), {
      renderer: canvas, color: "#0288d1", weight: 1, opacity: .7, fillColor: "#4fc3f7", fillOpacity: .6, interactive: false,
    }).addTo(layer);
  });
  return {
    fit: hex.cells.map(([q, r]) => hexCorners(q, r)[0]),
    info: `${hex.cells.length} esagoni visitati (≈ ${hex.area.toFixed(0)} km² grattati). Ognuno è largo circa 500 m.`,
  };
}

// Soste: dove hai passato più tempo
function drawStays(pts) {
  const top = topStays(pts, 60);
  top.forEach((c, i) => {
    const h = c.ms / 3600000;
    L.circle([c.lat, c.lon], { radius: 40 + 40 * Math.sqrt(h), color: "#6a1b9a", weight: 1, fillColor: "#ab47bc", fillOpacity: .45 })
      .bindPopup(`<b>#${i + 1}</b> · ${h >= 48 ? (h / 24).toFixed(1) + " giorni" : h.toFixed(1) + " ore"}<br>${fmtDay(c.first)} – ${fmtDay(c.last)}`)
      .addTo(layer);
  });
  const best = top[0];
  return {
    fit: top.map((c) => [c.lat, c.lon]),
    info: best ? `Top ${top.length} luoghi dove ti sei fermato di più (il primo: ${(best.ms / 36e5).toFixed(0)} ore in totale). Tocca i cerchi per i dettagli.` : "Nessuna sosta lunga trovata.",
  };
}

// fit = true quando l'utente cambia vista o filtro: allora la mappa inquadra i dati; all'avvio resta su dove sei
function render(fit) {
  layer.clearLayers();
  const pts = filtered();
  const last = pts[pts.length - 1];
  const draw = { routes: drawRoutes, heat: drawHeat, scratch: drawScratch, stays: drawStays }[mode];
  const r = pts.length ? draw(pts) : { dist: 0, fit: [], info: "Nessun punto nel periodo scelto." };
  map.invalidateSize();
  if (firstRender && here) {
    map.setView([here.lat, here.lon], 15);
  } else if (fit && r.fit.length) {
    map.fitBounds(L.latLngBounds(r.fit), { padding: [30, 30], maxZoom: 17 });
  }
  firstRender = false;
  $("modeinfo").textContent = r.info;
  let dist = r.dist;
  if (dist === undefined) { dist = 0; for (const s of moveSteps(pts)) dist += s.d; }
  $("s-points").textContent = pts.length;
  $("s-km").textContent = dist.toFixed(1);
  $("s-last").textContent = last ? new Date(last.ts).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "–";
}
document.querySelectorAll("#modes button").forEach((b) => (b.onclick = () => {
  mode = b.dataset.mode;
  document.querySelectorAll("#modes button").forEach((x) => x.classList.toggle("active", x === b));
  render(true);
}));

async function loadPoints() {
  points = await Native.points();
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
