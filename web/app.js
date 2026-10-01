// Interfaccia di MyMap: mappa, statistiche, tracker, impostazioni. Il motore (Native) è in native.js.
const $ = (id) => document.getElementById(id);

const map = L.map("map").setView([45.4642, 9.19], 13);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19, attribution: "&copy; OpenStreetMap",
}).addTo(map);
const layer = L.layerGroup().addTo(map);
const meLayer = L.layerGroup().addTo(map);
let points = [];      // tutti i punti, comprese le soste (scratch, notti, statistiche)
let movePts = [];      // solo punti di movimento e alleggeriti, per percorsi e heatmap
const pin = L.layerGroup().addTo(map);
let statsFor = "";     // per quali punti e filtro sono state calcolate le statistiche
let loadedTotal = -1;  // quanti punti c'erano all'ultimo caricamento

// ---------- schede ----------
function show(view) {
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + view));
  document.querySelectorAll("nav button").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  if (view === "map") { map.invalidateSize(); loadPoints(); }
  if (view === "stats") refreshStats(); // si ricalcola solo se ci sono punti nuovi o è cambiato il filtro
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
  ys.innerHTML = opt("", "Anno") + years.map((y) => opt(y, y)).join("");
  if (years.map(String).includes(keep[0])) ys.value = keep[0];

  const inYear = dates.filter((d) => !ys.value || d[0] === +ys.value);
  const months = [...new Set(inYear.map((d) => d[1]))].sort((a, b) => a - b);
  ms.innerHTML = opt("", "Mese") + months.map((m) => opt(m, MESI[m])).join("");
  if (months.map(String).includes(keep[1])) ms.value = keep[1];

  const inMonth = inYear.filter((d) => ms.value === "" || d[1] === +ms.value);
  const days = [...new Set(inMonth.map((d) => d[2]))].sort((a, b) => a - b);
  ds.innerHTML = opt("", "Giorno") + days.map((d) => opt(d, d)).join("");
  ds.disabled = ms.value === "";
  if (ms.value !== "" && days.map(String).includes(keep[2])) ds.value = keep[2];
}

const filterState = () => ({ y: $("f-year").value, m: $("f-month").value, d: $("f-day").value, from: $("f-from").value, to: $("f-to").value });

// Il periodo (da data a data) ha la precedenza su anno/mese/giorno; scegliendone uno si azzera l'altro
function applyFilter(arr) {
  const { y, m, d, from, to } = filterState();
  if (from || to) {
    const a = from ? new Date(from + "T00:00:00").getTime() : -Infinity;
    const b = to ? new Date(to + "T23:59:59.999").getTime() : Infinity;
    return arr.filter((p) => p.ts >= a && p.ts <= b);
  }
  if (!y && m === "" && !d) return arr;
  return arr.filter((p) => {
    const [py, pm, pd] = ts2(p.ts);
    return (!y || py === +y) && (m === "" || pm === +m) && (!d || pd === +d);
  });
}

// il pulsante "rimuovi filtri" compare solo quando almeno un filtro è attivo
function updateFilterUI() {
  const { y, m, d, from, to } = filterState();
  const range = !!(from || to);
  $("f-reset").hidden = !(y || m !== "" || d || range);
  $("f-range-btn").classList.toggle("on", range || !$("f-range").hidden);
  const today = new Date().toLocaleDateString("sv-SE"); // AAAA-MM-GG in ora locale
  $("f-today").classList.toggle("on", from === today && to === today);
}

function clearRange() { $("f-from").value = ""; $("f-to").value = ""; }
["f-year", "f-month", "f-day"].forEach((id) => ($(id).onchange = () => { clearRange(); fillFilters(); render(true); }));
["f-from", "f-to"].forEach((id) => ($(id).onchange = () => {
  ["f-year", "f-month", "f-day"].forEach((x) => ($(x).value = ""));
  fillFilters(); render(true);
}));
$("f-range-btn").onclick = () => { $("f-range").hidden = !$("f-range").hidden; updateFilterUI(); };
$("f-today").onclick = () => {
  const today = new Date().toLocaleDateString("sv-SE");
  ["f-year", "f-month", "f-day"].forEach((x) => ($(x).value = ""));
  $("f-from").value = today; $("f-to").value = today;
  $("f-range").hidden = false;
  fillFilters(); render(true);
};
$("f-reset").onclick = () => {
  ["f-year", "f-month", "f-day"].forEach((id) => ($(id).value = ""));
  clearRange(); $("f-range").hidden = true;
  fillFilters(); render(true);
};

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

// Heatmap: tra due punti vicini nel tempo si aggiungono punti intermedi, così i percorsi fatti più volte "si scaldano".
// Raggio, sfocatura, quantità di calore, densità e gradiente si regolano nelle impostazioni.
function drawHeat(pts) {
  repaint = () => {
    layer.clearLayers();
    const H = Prefs.v.heat, stepKm = H.step / 1000;
    const v = viewPts(pts, 15), heat = [];
    v.forEach((p, i) => {
      heat.push([p.lat, p.lon, 1]);
      const q = v[i - 1];
      if (!q || !stepKm || p.ts - q.ts > 20 * 60000) return;
      const d = km(q, p);
      if (d < stepKm * 1.5 || d > 30) return;
      const steps = heat.length > 40000 ? 1 : Math.min(60, Math.floor(d / stepKm));
      for (let k = 1; k < steps; k++) heat.push([q.lat + (p.lat - q.lat) * k / steps, q.lon + (p.lon - q.lon) * k / steps, 1]);
    });
    L.heatLayer(heat, { radius: H.radius, blur: H.blur, minOpacity: H.minOpacity / 100, max: H.max, gradient: Prefs.heatGradient() }).addTo(layer);
  };
  return { fit: bbox(pts), info: "Più il colore è caldo, più spesso sei passato di lì. Regolazioni in Impostazioni." };
}

// Scratch map: la mappa è coperta e le zone in cui sei stato si "grattano" (buchi esagonali nella copertura).
// La dimensione degli esagoni dipende dallo zoom e si regola nelle impostazioni.
function drawScratch(pts) {
  repaint = () => {
    layer.clearLayers();
    const dark = document.documentElement.dataset.theme === "dark";
    const diam = Prefs.hexDiam(map.getZoom());
    const view = map.getBounds().pad(0.35), cover = map.getBounds().pad(0.25);
    const hex = hexVisits(pts, diam, view);
    const ring = [[cover.getSouth(), cover.getWest()], [cover.getNorth(), cover.getWest()], [cover.getNorth(), cover.getEast()], [cover.getSouth(), cover.getEast()]];
    L.polygon([ring, ...hex.cells.map(([q, r]) => hexCorners(q, r, hex.S))], {
      renderer: canvas, fillRule: "evenodd", smoothFactor: 0, interactive: false,
      color: dark ? "#64748b" : "#8693aa", weight: 1, opacity: .55,
      fillColor: dark ? "#334155" : "#a3b1c6", fillOpacity: .94,
    }).addTo(layer);
    $("modeinfo").textContent = `${hex.cells.length.toLocaleString("it-IT")} esagoni grattati in vista · esagoni da ${fmtM(diam)}`;
  };
  return { fit: bbox(pts), info: "" };
}

// Notti: i luoghi in cui hai dormito, con il numero di notti. Il calcolo è spiegato nelle impostazioni.
function drawSleep(pts) {
  const sl = sleepPlaces(pts, Prefs.v.sleep.from, Prefs.v.sleep.to, Prefs.v.sleep.minPts, Prefs.v.sleep.radius);
  const top = sl.places[0] ? sl.places[0].nights : 1;
  sl.places.forEach((p) => {
    const size = Math.round(28 + 26 * Math.sqrt(p.nights / top));
    const icon = L.divIcon({ className: "", iconSize: [size, size], iconAnchor: [size / 2, size / 2],
      html: `<div class="moon" style="width:${size}px;height:${size}px"><b>${p.nights}</b></div>` });
    const m = L.marker([p.lat, p.lon], { icon }).addTo(layer);
    m.bindPopup(() => `<div class="pop"><b>${placeSpan(p.lat, p.lon)}</b><br>${p.nights} ${p.nights === 1 ? "notte" : "notti"}<br>${fmtDay(p.first)} – ${fmtDay(p.last)}<br><button class="pop-btn" data-rename>Rinomina</button></div>`);
    m.on("popupopen", (e) => popupReady(e, p));
  });
  const info = sl.places.length
    ? `${sl.nights} notti · ${sl.places.length} ${sl.places.length === 1 ? "luogo" : "luoghi"} · il primo con ${top} notti. Tocca una luna per i dettagli.`
    : `Nessuna notte rilevata nel periodo: servono dati tra le ${String(Prefs.v.sleep.from).padStart(2, "0")}:00 e le ${String(Prefs.v.sleep.to).padStart(2, "0")}:00.`;
  return { fit: sl.places.map((p) => [p.lat, p.lon]), info };
}

// ---------- nomi dei posti ----------
const needsName = (p) => !Names.find(p.lat, p.lon) && !Names.isSkipped(p.lat, p.lon) && (p.visits >= 2 || p.ms >= 36e5);

function refreshAfterNames() {
  statsFor = "";
  buildNamesCard();
  render(false);
  if ($("view-stats").classList.contains("active")) refreshStats();
}

// popup di un posto: carica il nome da OpenStreetMap (se manca) e collega il pulsante Rinomina
function popupReady(e, p) {
  const el = e.popup.getElement();
  hydratePlaces(el);
  const btn = el.querySelector("[data-rename]");
  if (btn) btn.onclick = () => { map.closePopup(); renamePlace(p.lat, p.lon); };
}

async function renamePlace(lat, lon, suggestion) {
  const cur = Names.find(lat, lon);
  const r = await promptDialog({
    text: cur ? "Rinomina questo posto. Lascia vuoto per tornare al nome di OpenStreetMap." : "Dai un nome a questo posto.",
    value: cur ? cur.name : suggestion || Places.cached(lat, lon) || "", placeholder: "Es. Casa di Marco, Palestra, Ufficio…",
  });
  if (r.action !== "save") return false;
  Names.set(lat, lon, r.value);
  refreshAfterNames();
  return true;
}

// Passa in rassegna i posti scoperti che non hanno ancora un nome (i più frequentati per primi)
async function nameNewPlaces() {
  const list = visitPlaces(applyFilter(points)).filter(needsName).slice(0, 40);
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    pin.clearLayers();
    L.circleMarker([p.lat, p.lon], { radius: 10, color: "#fff", weight: 3, fillColor: "#f97316", fillOpacity: 1 }).addTo(pin);
    map.setView([p.lat, p.lon], 16, { animate: false });
    const guess = Prefs.v.names ? Places.cached(p.lat, p.lon) || (await Places.lookup(p.lat, p.lon)) || "" : "";
    const hours = p.ms / 36e5;
    const r = await promptDialog({
      text: `Nuovo posto ${i + 1} di ${list.length}: ${p.visits} ${p.visits === 1 ? "visita" : "visite"}, ${hours >= 48 ? (hours / 24).toFixed(1) + " giorni" : hours.toFixed(1) + " ore"}. Come lo chiami?`,
      value: guess, placeholder: "Es. Palestra, Nonna, Ufficio…", okLabel: "Salva", skipLabel: "Salta", noLabel: "Fine",
    });
    if (r.action === "cancel") break;
    if (r.action === "skip") Names.skip(p.lat, p.lon);
    else if (r.value) Names.set(p.lat, p.lon, r.value);
  }
  pin.clearLayers();
  refreshAfterNames();
}
$("name-new").onclick = nameNewPlaces;

// Posti visitati: dove ti sei fermato almeno 20 minuti, raggruppati per luogo (entro 150 m), con visite e tempo totale
function drawPlaces(pts) {
  const all = visitPlaces(pts), shown = all.slice(0, 400);
  const todo = all.filter(needsName).length;
  shown.forEach((p, i) => {
    const hours = p.ms / 36e5, r = Math.max(6, Math.min(24, 6 + 4 * Math.sqrt(hours)));
    const named = !!Names.find(p.lat, p.lon);
    const m = L.circleMarker([p.lat, p.lon], { radius: r, color: "#fff", weight: 2, fillColor: named ? "#10b981" : i === 0 ? "#f97316" : "#8b5cf6", fillOpacity: .78 }).addTo(layer);
    m.bindPopup(() => `<div class="pop"><b>${placeSpan(p.lat, p.lon)}</b><br>${p.visits} ${p.visits === 1 ? "visita" : "visite"} · ${hours >= 48 ? (hours / 24).toFixed(1) + " giorni" : hours.toFixed(1) + " ore"}<br>${fmtDay(p.first)} – ${fmtDay(p.last)}<br><button class="pop-btn" data-rename>${named ? "Rinomina" : "Dai un nome"}</button></div>`);
    m.on("popupopen", (e) => popupReady(e, p));
  });
  const tot = all.reduce((a, p) => a + p.visits, 0);
  $("name-new").hidden = !todo;
  $("name-new").textContent = `Nomina ${todo > 40 ? "i primi 40 dei " + todo : todo} nuovi posti`;
  return {
    fit: shown.map((p) => [p.lat, p.lon]),
    info: all.length ? `${all.length.toLocaleString("it-IT")} posti visitati · ${tot.toLocaleString("it-IT")} visite${all.length > shown.length ? ` · mostrati i ${shown.length} dove stai di più` : ""}. In verde quelli che hai già nominato.` : "Nessuna sosta trovata nel periodo.",
  };
}

// fit = true quando l'utente cambia vista o filtro: allora la mappa inquadra i dati; all'avvio resta su dove sei
function render(fit) {
  layer.clearLayers();
  $("name-new").hidden = true;
  repaint = null;
  const pts = applyFilter(mode === "scratch" || mode === "sleep" || mode === "places" ? points : movePts);
  const last = pts[pts.length - 1];
  const draw = { scratch: drawScratch, heat: drawHeat, routes: drawRoutes, sleep: drawSleep, places: drawPlaces }[mode];
  const r = pts.length ? draw(pts) : { dist: 0, fit: [], info: "Nessun punto nel periodo scelto." };
  updateFilterUI();
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

let lastLoad = 0, lastSeen = -1;
// ogni 4 s controlla se ci sono punti nuovi: ricarica quando il numero smette di crescere (scarico finito) o dopo un minuto
setInterval(() => {
  if (!$("view-map").classList.contains("active") || !points.length && loadedTotal === -1 && session && session.mode === "none") return;
  const t = Native.status().total;
  if (t !== loadedTotal && (t === lastSeen || Date.now() - lastLoad > 60000)) loadPoints();
  lastSeen = t;
}, 4000);

async function loadPoints() {
  lastLoad = Date.now();
  const total = Native.status().total;
  if (total === loadedTotal && points.length) return; // niente ricarico se non ci sono punti nuovi
  points = clean(await Native.points());
  loadedTotal = total;
  movePts = thin(points.filter((p) => !isStay(p)), 15, 5 * 60000);
  if (firstRender) { await locate(); drawMe(); }
  fillFilters();
  render(false);
}

// ---------- filtro delle statistiche: anno e mese ----------
function fillStatsFilter() {
  const sy = $("s-year"), sm = $("s-month"), keepY = sy.value, keepM = sm.value;
  const years = [...new Set(points.map((p) => new Date(p.ts).getFullYear()))].sort((a, b) => b - a);
  sy.innerHTML = opt("", "Tutti gli anni") + years.map((y) => opt(y, y)).join("");
  if (years.map(String).includes(keepY)) sy.value = keepY;
  sm.innerHTML = opt("", "Tutti i mesi") + MESI.map((m, i) => opt(i, m)).join("");
  sm.value = keepM;
}
function refreshStats() {
  if (!$("s-year").options.length || statsFor === "") fillStatsFilter();
  const y = $("s-year").value, m = $("s-month").value, key = `${loadedTotal}|${y}|${m}`;
  if (key === statsFor) return;
  statsFor = key;
  renderStats(y === "" && m === "" ? points : points.filter((p) => { const d = new Date(p.ts); return (y === "" || d.getFullYear() === +y) && (m === "" || d.getMonth() === +m); }),
    y === "" && m === "" ? "" : `${m === "" ? "" : MESI[+m] + " "}${y}`.trim());
}
["s-year", "s-month"].forEach((id) => ($(id).onchange = refreshStats));

// ---------- vai a un luogo (dalle statistiche) ----------
function gotoPlace(lat, lon) {
  show("map");
  pin.clearLayers();
  L.circleMarker([lat, lon], { radius: 9, color: "#fff", weight: 3, fillColor: "#f97316", fillOpacity: 1 }).addTo(pin);
  setTimeout(() => { map.invalidateSize(); map.setView([lat, lon], 16); }, 60);
  setTimeout(() => pin.clearLayers(), 12000);
}
$("stats").addEventListener("click", (e) => {
  const g = e.target.closest("[data-go]");
  if (g) { const [la, lo] = g.dataset.go.split(",").map(Number); gotoPlace(la, lo); }
});

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

// preferenze (esagoni, heatmap, notti, nomi): ogni modifica ridisegna la mappa
buildPrefsUI();
bindPrefsUI();
Prefs.onChange = () => { statsFor = ""; render(false); };
$("repull").onclick = () => { Native.repull(); $("repull-msg").textContent = "Scarico avviato: i punti nuovi compaiono al prossimo avvio dell'app."; };

refreshStatus();
loadPoints();
