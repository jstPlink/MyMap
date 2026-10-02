// Interfaccia di MyMap: mappa, statistiche, tracker, impostazioni. Il motore (Native) è in native.js.
const $ = (id) => document.getElementById(id);

const map = L.map("map", { zoomSnap: 0.1 }).setView([45.4642, 9.19], 13); // zoom frazionario: serve a inquadrare esattamente 100 km di raggio
// Mappa di base: lo stile si sceglie in Impostazioni → Aspetto → Mappa (elenco MAP_STYLES in prefs.js).
let base = [];
map.createPane("labels").style.zIndex = 450; // nomi sopra a coperta e percorsi, sotto ai marcatori
map.getPane("labels").style.pointerEvents = "none";
// Livelli della mappa di base per lo stile scelto, aggiunti alla mappa `m` (anche quella dell'anteprima nelle impostazioni)
function baseLayers(m) {
  const st = MAP_STYLES[Prefs.v.mapStyle] || MAP_STYLES.color, dark = Prefs.isDark();
  const val = (x) => (typeof x === "function" ? x(dark) : x);
  const layers = [L.tileLayer(val(st.url), { maxNativeZoom: st.max, maxZoom: 19, attribution: st.attr, className: st.cls })];
  if (st.ref) layers.push(L.tileLayer(val(st.ref), { maxNativeZoom: 16, maxZoom: 19, pane: "labels", opacity: .9 }));
  layers.forEach((l) => l.addTo(m));
  layers[0].bringToBack();
  return layers;
}
function setBase() {
  base.forEach((l) => map.removeLayer(l));
  base = baseLayers(map);
  applyMapFx();
}

// Ritocchi alla mappa di base (cursori in Aspetto): filtri CSS sul solo livello delle tessere (nomi, percorsi e marcatori restano
// com'erano) e, per la tinta, un filtro SVG che mescola un colore con l'immagine.
function mapFxFilter() {
  const f = Prefs.v.mapFx, p = [];
  if (f.hue) p.push(`hue-rotate(${f.hue}deg)`);
  if (f.sat !== 100) p.push(`saturate(${f.sat}%)`);
  if (f.bright !== 100) p.push(`brightness(${f.bright}%)`);
  if (f.contrast !== 100) p.push(`contrast(${f.contrast}%)`);
  if (f.gray) p.push(`grayscale(${f.gray}%)`);
  if (f.sepia) p.push(`sepia(${f.sepia}%)`);
  if (f.invert) p.push(`invert(${f.invert}%)`);
  if (f.blur) p.push(`blur(${f.blur}px)`);
  if (f.tintOpacity > 0) {
    $("tint-flood").setAttribute("flood-color", f.tint);
    $("tint-flood").setAttribute("flood-opacity", f.tintOpacity / 100);
    $("tint-blend").setAttribute("mode", f.tintMode);
    p.push("url(#maptint)");
  }
  return p.join(" ");
}
function applyMapFx() { map.getPane("tilePane").style.filter = mapFxFilter(); }

// Anteprima dei ritocchi: una mini mappa nelle impostazioni, con lo stesso stile e gli stessi filtri, centrata dove stai guardando
let fxMap = null, fxBase = [];
function paintFxPreview() {
  const el = document.getElementById("fxprev");
  if (!el || !el.offsetParent) return; // sezione chiusa o scheda nascosta
  if (fxMap && fxMap.getContainer() !== el) { fxMap.remove(); fxMap = null; fxBase = []; } // le impostazioni sono state ricostruite
  if (!fxMap) {
    fxMap = L.map(el, { zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false, touchZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, zoomSnap: 0.1 });
    fxMap.createPane("labels").style.zIndex = 450;
    fxMap.getPane("labels").style.pointerEvents = "none";
  }
  fxMap.invalidateSize();
  fxBase.forEach((l) => fxMap.removeLayer(l));
  fxBase = baseLayers(fxMap);
  const c = map.getCenter();
  fxMap.setView(c, Math.max(9, Math.min(15, map.getZoom())), { animate: false });
  fxMap.getPane("tilePane").style.filter = mapFxFilter();
}
setBase();
const layer = L.layerGroup().addTo(map);
const meLayer = L.layerGroup().addTo(map);
let points = [];      // tutti i punti, comprese le soste (scratch, notti, statistiche)
let movePts = [];      // solo punti di movimento e alleggeriti, per percorsi e heatmap
const pin = L.layerGroup().addTo(map);
let statsFor = "";     // per quali punti e filtro sono state calcolate le statistiche
let loadedTotal = -1;  // quanti punti c'erano all'ultimo caricamento

// Riepilogo della vista: numeri grandi con etichetta, e sotto un suggerimento breve
const sumHtml = (items, tip) => `<div class="chips sum">${items.map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join("")}</div>${tip ? `<p class="tip">${tip}</p>` : ""}`;

// Feedback aptico a ogni tocco su pulsanti, schede e controlli (se il telefono ha attiva la vibrazione al tocco)
let lastHaptic = 0;
document.addEventListener("click", (e) => {
  if (!e.target.closest || !e.target.closest("button, a, summary, select, label, input, [data-view], [data-mode], [data-go], .leaflet-interactive")) return;
  const t = Date.now();
  if (t - lastHaptic < 60) return; // un solo impulso anche se un tocco genera più eventi
  lastHaptic = t;
  Native.haptic("tap");
}, true);

// ---------- livello di zoom (uguale in tutte le viste): zoom e larghezza della mappa in km ----------
function showZoom() {
  const z = map.getZoom(), c = map.getCenter(), w = map.getSize().x;
  const km = (156543.03 * Math.cos((c.lat * Math.PI) / 180) / 2 ** z) * w / 1000;
  const kmText = km < 10 ? km.toLocaleString("it-IT", { maximumFractionDigits: 1 }) : Math.round(km).toLocaleString("it-IT");
  $("zoomlevel").innerHTML = `Zoom <b>${z.toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</b> · ${kmText} km`;
}
map.on("zoom zoomend moveend resize", showZoom);
showZoom();

// ---------- schede ----------
function show(view) {
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + view));
  document.querySelectorAll("nav button").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  if (view === "map") { map.invalidateSize(); loadPoints(); }
  if (view === "stats") refreshStats(); // si ricalcola solo se ci sono punti nuovi o è cambiato il filtro
  if (view === "settings") refreshStatus();
}
document.querySelectorAll("nav button").forEach((b) => (b.onclick = () => show(b.dataset.view)));

// ---------- filtro del periodo ----------
// Un solo pulsante sulla mappa mostra il periodo attivo e apre un pannello con scorciatoie (oggi, ultimi 7 giorni…),
// anno/mese/giorno, intervallo da data a data e fascia oraria. Il periodo da data a data ha la precedenza su anno/mese/giorno.
const ts2 = (ts) => { const d = new Date(ts); return [d.getFullYear(), d.getMonth(), d.getDate()]; };
const opt = (v, t) => `<option value="${v}">${t}</option>`;
const ymd = (d) => d.toLocaleDateString("sv-SE"); // AAAA-MM-GG in ora locale
const YMD = ["f-year", "f-month", "f-day"];

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

const filterState = () => ({ y: $("f-year").value, m: $("f-month").value, d: $("f-day").value, from: $("f-from").value, to: $("f-to").value, tf: $("f-tfrom").value, tt: $("f-tto").value });
const minutes = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };

function applyFilter(arr) {
  const { y, m, d, from, to, tf, tt } = filterState();
  if (from || to) {
    const a = from ? new Date(from + "T00:00:00").getTime() : -Infinity;
    const b = to ? new Date(to + "T23:59:59.999").getTime() : Infinity;
    arr = arr.filter((p) => p.ts >= a && p.ts <= b);
  } else if (y || m !== "" || d) {
    arr = arr.filter((p) => {
      const [py, pm, pd] = ts2(p.ts);
      return (!y || py === +y) && (m === "" || pm === +m) && (!d || pd === +d);
    });
  }
  if (tf || tt) { // fascia oraria: ogni giorno tra le due ore; se la seconda è prima della prima passa la mezzanotte
    const a = tf ? minutes(tf) : 0, b = tt ? minutes(tt) : 24 * 60 - 1;
    arr = arr.filter((p) => {
      const t = new Date(p.ts), mm = t.getHours() * 60 + t.getMinutes();
      return a <= b ? mm >= a && mm <= b : mm >= a || mm <= b;
    });
  }
  return arr;
}

const fmtShort = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" });

// testo del pulsante: descrive il filtro attivo
function filterSummary() {
  const { y, m, d, from, to, tf, tt } = filterState();
  let t = "Tutto il periodo";
  if (from || to) t = from && to ? (from === to ? fmtShort(from) : `${fmtShort(from)} – ${fmtShort(to)}`) : from ? `Dal ${fmtShort(from)}` : `Fino al ${fmtShort(to)}`;
  else if (y || m !== "" || d) t = [d, m !== "" ? MESI[+m] : "", y].filter((x) => x !== "").join(" ");
  if (tf || tt) t += `${t === "Tutto il periodo" ? "" : " · "}${tf || "00:00"}–${tt || "23:59"}`;
  return t;
}

function filterActive() { const f = filterState(); return !!(f.y || f.m !== "" || f.d || f.from || f.to || f.tf || f.tt); }

function updateFilterUI() {
  const on = filterActive();
  $("f-summary").textContent = filterSummary();
  $("f-open").title = on ? "Filtro: " + filterSummary() : "Filtra per periodo"; // il pulsante è solo un'icona
  $("f-open").classList.toggle("on", on);
  $("f-reset").hidden = !on;
  // evidenzia la scorciatoia che coincide con il periodo scelto
  const f = filterState();
  document.querySelectorAll("#f-quick [data-q]").forEach((b) => {
    const r = quickRange(b.dataset.q);
    b.classList.toggle("on", on ? r[0] === f.from && r[1] === f.to && !f.y && r[0] !== "" : b.dataset.q === "all");
  });
}

function quickRange(q) {
  const now = new Date(), day = (off) => { const d = new Date(now); d.setDate(d.getDate() + off); return ymd(d); };
  switch (q) {
    case "today": return [day(0), day(0)];
    case "yesterday": return [day(-1), day(-1)];
    case "7": return [day(-6), day(0)];
    case "30": return [day(-29), day(0)];
    case "month": return [ymd(new Date(now.getFullYear(), now.getMonth(), 1)), day(0)];
    case "lastmonth": return [ymd(new Date(now.getFullYear(), now.getMonth() - 1, 1)), ymd(new Date(now.getFullYear(), now.getMonth(), 0))];
    case "year": return [ymd(new Date(now.getFullYear(), 0, 1)), day(0)];
    default: return ["", ""];
  }
}

function clearRange() { $("f-from").value = ""; $("f-to").value = ""; }
function clearAllFilters() { YMD.forEach((id) => ($(id).value = "")); clearRange(); $("f-tfrom").value = ""; $("f-tto").value = ""; }
function refilter() { fillFilters(); render(true); }

YMD.forEach((id) => ($(id).onchange = () => { clearRange(); refilter(); }));
["f-from", "f-to"].forEach((id) => ($(id).onchange = () => { YMD.forEach((x) => ($(x).value = "")); refilter(); }));
["f-tfrom", "f-tto"].forEach((id) => ($(id).onchange = () => render(true)));
document.querySelectorAll("#f-quick [data-q]").forEach((b) => (b.onclick = () => {
  const [from, to] = quickRange(b.dataset.q);
  YMD.forEach((x) => ($(x).value = ""));
  $("f-from").value = from; $("f-to").value = to;
  refilter();
}));
$("f-open").onclick = () => { fillFilters(); updateFilterUI(); $("fsheet").hidden = false; };
$("f-close").onclick = $("f-done").onclick = () => { $("fsheet").hidden = true; };
$("fsheet").addEventListener("click", (e) => { if (e.target === $("fsheet")) $("fsheet").hidden = true; });
$("f-clear").onclick = () => { clearAllFilters(); refilter(); };
$("f-reset").onclick = () => { clearAllFilters(); refilter(); };

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
$("locate").onclick = async () => {
  $("locate").classList.add("busy");
  const r = Native.isApp ? await Native.fix(false) : null; // posizione fresca; se non arriva si ripiega sull'ultima nota
  if (r && r.ok) here = { lat: r.lat, lon: r.lon }; else await locate();
  $("locate").classList.remove("busy");
  if (here) { drawMe(); map.setView([here.lat, here.lon], 15); }
};

// ---------- viste della mappa ----------
const MODES = ["scratch", "heat", "routes", "mix", "sleep", "places", "stay"];
let mode = MODES.includes(Prefs.v.view) ? Prefs.v.view : "scratch"; // vista corrente: si ricorda ed è condivisa con le altre impostazioni
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

// Proiezione Mercator in pixel allo zoom z (stessa griglia di Leaflet): serve a semplificare in base a quello che si vede
function mercator(lat, lon, z) {
  const s = 256 * 2 ** z, sin = Math.sin((lat * Math.PI) / 180);
  return [((lon + 180) / 360) * s, (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * s];
}

// Ramer-Douglas-Peucker iterativo: indici dei punti da tenere perché la linea non si discosti più di `tol` pixel dall'originale
function rdp(P, tol) {
  const n = P.length, keep = new Uint8Array(n), stack = [[0, n - 1]];
  keep[0] = keep[n - 1] = 1;
  while (stack.length) {
    const [i, j] = stack.pop();
    if (j <= i + 1) continue;
    const [x1, y1] = P[i], dx = P[j][0] - x1, dy = P[j][1] - y1, len = Math.hypot(dx, dy);
    let best = -1, bd = tol;
    for (let k = i + 1; k < j; k++) {
      const d = len ? Math.abs(dy * (P[k][0] - x1) - dx * (P[k][1] - y1)) / len : Math.hypot(P[k][0] - x1, P[k][1] - y1);
      if (d > bd) { bd = d; best = k; }
    }
    if (best > 0) { keep[best] = 1; stack.push([i, best], [best, j]); }
  }
  const out = [];
  for (let k = 0; k < n; k++) if (keep[k]) out.push(k);
  return out;
}

// Palette di 256 colori (indice = intensità 0-255) dal gradiente a quattro colori, come nella heatmap
function heatPalette(colors) {
  const c = document.createElement("canvas"); c.width = 256; c.height = 1;
  const g = c.getContext("2d"), gr = g.createLinearGradient(0, 0, 256, 0);
  colors.forEach((col, i) => gr.addColorStop(HEAT_STOPS[i], col));
  g.fillStyle = gr; g.fillRect(0, 0, 256, 1);
  return g.getImageData(0, 0, 256, 1).data;
}

// Percorsi: la traccia si spezza dove c'è un buco di più di 5 minuti. Ogni tratto si semplifica (RDP, "Dettaglio" in px) allo zoom
// corrente: da lontano restano pochi vertici, da vicino il dettaglio pieno. Si disegnano solo i tratti visibili; i puntini
// isolati (soste) compaiono solo da zoom 12. I tratti semplificati si ricordano per zoom, così spostare la mappa è leggero.
// Due stili: colore unico (linee vettoriali) oppure per frequenza, con gli stessi controlli della heatmap: i tratti si sommano
// su una tela (ogni passaggio aggiunge opacità), si sfoca e si colora con il gradiente; più passaggi = più caldo.
function drawRoutes(pts) {
  let dist = 0;
  const segs = []; let cur = [];
  pts.forEach((p, i) => {
    if (i && p.ts - pts[i - 1].ts > 5 * 60000) { segs.push(cur); cur = []; } else if (i) dist += km(pts[i - 1], p);
    cur.push(p);
  });
  if (cur.length) segs.push(cur);
  const info = segs.map((s) => { const bb = bbox(s); return { s, a: bb[0][0], b: bb[0][1], c: bb[1][0], d: bb[1][1] }; });
  const cache = new Map();
  const simplified = (z) => {
    const tol = Prefs.v.route.detail || 1.5, key = z + "|" + tol;
    if (cache.has(key)) return cache.get(key);
    if (cache.size > 3) cache.delete(cache.keys().next().value);
    const out = info.map((g) => {
      if (g.s.length === 1) return { g, dot: [g.s[0].lat, g.s[0].lon] };
      const P = g.s.map((p) => mercator(p.lat, p.lon, z)), idx = rdp(P, tol);
      const tiny = Math.abs(mercator(g.a, g.b, z)[0] - mercator(g.c, g.d, z)[0]) < 3 && Math.abs(mercator(g.a, g.b, z)[1] - mercator(g.c, g.d, z)[1]) < 3;
      return tiny ? { g, dot: [(g.a + g.c) / 2, (g.b + g.d) / 2] } : { g, line: idx.map((k) => [g.s[k].lat, g.s[k].lon]) };
    });
    cache.set(key, out);
    return out;
  };

  // stile per frequenza: tela con i tratti sommati -> sfocatura -> colori del gradiente
  const freqLayer = (lines, R) => {
    const size = map.getSize(), sc = Math.min(2, window.devicePixelRatio || 1), W = Math.round(size.x * sc), Hh = Math.round(size.y * sc);
    if (!W || !Hh) return L.layerGroup(); // mappa nascosta (altra scheda): niente da disegnare, si ridisegna al ritorno
    const off = document.createElement("canvas"); off.width = W; off.height = Hh;
    const o = off.getContext("2d");
    o.lineCap = o.lineJoin = "round"; o.lineWidth = R.weight * sc; o.strokeStyle = "#000";
    o.globalAlpha = Math.min(1, 1 / Math.max(1, R.max)); // ogni passaggio aggiunge 1/max di opacità
    const z = map.getZoom(), min = map.getPixelBounds().min;
    for (const l of lines) {
      o.beginPath();
      l.forEach(([la, lo], i) => { const [x, y] = mercator(la, lo, z); i ? o.lineTo((x - min.x) * sc, (y - min.y) * sc) : o.moveTo((x - min.x) * sc, (y - min.y) * sc); });
      o.stroke();
    }
    let src = off, gain = 1;
    if (R.blur > 0) {
      const bl = document.createElement("canvas"); bl.width = W; bl.height = Hh;
      const b = bl.getContext("2d");
      if ("filter" in b) {
        b.filter = `blur(${R.blur * sc}px)`; b.drawImage(off, 0, 0); src = bl;
        // la sfocatura abbassa il picco di una linea sottile: lo si ricompensa, così i tratti ripetuti arrivano ai colori caldi
        const x = R.weight / (2 * Math.SQRT2 * R.blur), t = 1 / (1 + .278393 * x + .230389 * x * x + .000972 * x ** 3 + .078108 * x ** 4);
        gain = 1 / Math.max(.05, 1 - t ** 4);
      }
    }
    const img = src.getContext("2d").getImageData(0, 0, W, Hh), d = img.data, pal = heatPalette(R.colors), floor = Math.round(R.minOpacity * 2.55);
    for (let i = 0; i < d.length; i += 4) {
      const a0 = d[i + 3];
      if (a0 < 2) { d[i + 3] = 0; continue; }
      const a = Math.min(255, Math.round(a0 * gain)), p = a * 4;
      d[i] = pal[p]; d[i + 1] = pal[p + 1]; d[i + 2] = pal[p + 2]; d[i + 3] = Math.max(a, floor);
    }
    const cv = document.createElement("canvas"); cv.width = W; cv.height = Hh;
    cv.style.cssText = `width:${size.x}px;height:${size.y}px;pointer-events:none`;
    cv.className = "leaflet-zoom-hide";
    cv.getContext("2d").putImageData(img, 0, 0);
    return new (L.Layer.extend({
      onAdd(mp) { mp.getPanes().overlayPane.appendChild(cv); L.DomUtil.setPosition(cv, mp.containerPointToLayerPoint([0, 0])); },
      onRemove() { L.DomUtil.remove(cv); },
    }))();
  };

  const paint = (linesOnly) => { // linesOnly: nella vista Mix si disegnano sempre le linee, anche con lo stile per frequenza
    const R = { ...Prefs.v.route, weight: Prefs.widthAt("route", map.getZoom()) }, z = Math.round(map.getZoom()), bn = map.getBounds().pad(0.5); // spessore per lo zoom attuale
    const S = bn.getSouth(), N = bn.getNorth(), W = bn.getWest(), E = bn.getEast();
    const vis = simplified(z).filter((t) => { const g = t.g; return !(g.c < S || g.a > N || g.d < W || g.b > E); });
    if (R.mode === "freq" && !linesOnly) {
      freqLayer(vis.filter((t) => t.line).map((t) => t.line), R).addTo(layer);
      return;
    }
    let dots = 0;
    for (const t of vis) {
      if (t.line) L.polyline(t.line, { color: R.color, weight: R.weight, opacity: R.opacity / 100, renderer: canvas, interactive: false, smoothFactor: 0 }).addTo(layer);
      else if (z >= 12 && dots < 1500) { L.circleMarker(t.dot, { radius: Math.max(2, R.weight), color: R.color, weight: 1, fillOpacity: .8, renderer: canvas, interactive: false }).addTo(layer); dots++; }
    }
  };
  repaint = () => { layer.clearLayers(); paint(); };
  return { fit: bbox(pts), paint, info: "" };
}

// Heatmap: tra due punti vicini nel tempo si aggiungono punti intermedi, così i percorsi fatti più volte "si scaldano".
// Per non appesantire la mappa i punti si accorpano in celle di pochi pixel (il peso è il numero di punti) e i punti
// intermedi si fanno solo quanto serve a quello zoom: da lontano restano poche migliaia di punti pesati.
// Raggio, sfocatura, quantità di calore, densità e gradiente si regolano nelle impostazioni.
function drawHeat(pts) {
  const paint = () => {
    const H = Prefs.v.heat, z = map.getZoom(), rad = Prefs.widthAt("heat", z), cell = Math.max(2, rad / 3); // raggio per questo zoom; lato della cella in pixel
    const mpp = 156543 * Math.cos(map.getCenter().lat * Math.PI / 180) / 2 ** z;
    const stepKm = H.step ? Math.max(H.step, mpp * cell) / 1000 : 0; // da lontano non servono punti più fitti della cella
    const bn = map.getBounds().pad(0.5), bins = new Map();
    const add = (lat, lon) => {
      const [x, y] = mercator(lat, lon, z), k = Math.floor(x / cell) * 1e7 + Math.floor(y / cell);
      const b = bins.get(k);
      if (b) { b.la += lat; b.lo += lon; b.n++; } else bins.set(k, { la: lat, lo: lon, n: 1 });
    };
    let q = null;
    for (const p of pts) {
      const inside = bn.contains([p.lat, p.lon]), prevInside = q && bn.contains([q.lat, q.lon]);
      if (inside) add(p.lat, p.lon);
      if (q && stepKm && (inside || prevInside) && p.ts - q.ts <= 20 * 60000) {
        const d = km(q, p);
        if (d >= stepKm * 1.5 && d <= 30) {
          const steps = Math.min(60, Math.floor(d / stepKm));
          for (let k = 1; k < steps; k++) add(q.lat + (p.lat - q.lat) * k / steps, q.lon + (p.lon - q.lon) * k / steps);
        }
      }
      q = p;
    }
    const heat = [];
    bins.forEach((b) => heat.push([b.la / b.n, b.lo / b.n, b.n]));
    L.heatLayer(heat, { radius: rad, blur: H.blur, minOpacity: H.minOpacity / 100, max: H.max, gradient: Prefs.heatGradient() }).addTo(layer);
  };
  repaint = () => { layer.clearLayers(); paint(); };
  return { fit: bbox(pts), paint, info: "" };
}

// Mix: la heatmap con sopra i percorsi (sempre come linee, con colore, spessore e opacità scelti per i percorsi)
function drawMix(pts) {
  const h = drawHeat(pts), r = drawRoutes(pts);
  repaint = () => { layer.clearLayers(); h.paint(); r.paint(true); };
  return { fit: h.fit, info: "" };
}

// Contorni morbidi: si uniscono gli esagoni adiacenti in zone (si tolgono i lati condivisi), si concatenano i lati
// rimasti in anelli e si arrotondano gli angoli con raccordi uguali. Il calcolo è nel piano proiettato, poi si torna a lat/lon.
function softOutlines(cells, S) {
  const SQ = Math.sqrt(3), key = (x, y) => Math.round(x * 10) + "," + Math.round(y * 10);
  const edges = new Map(); // lato -> {a, b, ka, kb, n}
  for (const [q, r] of cells) {
    const cx = S * SQ * (q + r / 2), cy = S * 1.5 * r, v = [];
    for (let i = 0; i < 6; i++) { const a = (Math.PI / 180) * (60 * i + 30); v.push([cx + S * Math.cos(a), cy + S * Math.sin(a)]); }
    for (let i = 0; i < 6; i++) {
      const a = v[i], b = v[(i + 1) % 6], ka = key(a[0], a[1]), kb = key(b[0], b[1]), k = ka < kb ? ka + "|" + kb : kb + "|" + ka;
      const e = edges.get(k);
      if (e) e.n++; else edges.set(k, { a, b, ka, kb, n: 1, used: false });
    }
  }
  const adj = new Map();
  const link = (k, e) => { const l = adj.get(k); if (l) l.push(e); else adj.set(k, [e]); };
  for (const e of edges.values()) if (e.n === 1) { link(e.ka, e); link(e.kb, e); }
  const rounds = edges.size > 24000 ? 1 : 2, loops = [];
  for (const start of edges.values()) {
    if (start.n !== 1 || start.used) continue;
    start.used = true;
    const pts = [start.a];
    let k = start.kb, p = start.b;
    for (;;) {
      pts.push(p);
      const nx = (adj.get(k) || []).find((e) => !e.used);
      if (!nx) break;
      nx.used = true;
      if (nx.ka === k) { k = nx.kb; p = nx.b; } else { k = nx.ka; p = nx.a; }
    }
    if (k === start.ka && pts.length > 3) pts.pop(); // l'anello si chiude sul primo vertice
    // angoli arrotondati tutti uguali (raccordo al 30% del lato, curva di Bézier): i lati restano dritti e l'esagono resta regolare
    const n = pts.length, T = 0.3, steps = rounds > 1 ? 5 : 3, ring = [];
    for (let i = 0; i < n; i++) {
      const P = pts[(i + n - 1) % n], V = pts[i], Q = pts[(i + 1) % n];
      const a = [V[0] + (P[0] - V[0]) * T, V[1] + (P[1] - V[1]) * T], b = [V[0] + (Q[0] - V[0]) * T, V[1] + (Q[1] - V[1]) * T];
      for (let s = 0; s <= steps; s++) {
        const u = s / steps, w = 1 - u;
        ring.push([w * w * a[0] + 2 * w * u * V[0] + u * u * b[0], w * w * a[1] + 2 * w * u * V[1] + u * u * b[1]]);
      }
    }
    loops.push(ring.map(([x, y]) => { const ll = L.CRS.EPSG3857.unproject(L.point(x, y)); return [ll.lat, ll.lng]; }));
  }
  return loops;
}

// Scratch map: la mappa è coperta e le zone in cui sei stato si "grattano" (buchi esagonali nella copertura).
// La dimensione degli esagoni dipende dallo zoom e si regola nelle impostazioni.
const scratchCache = new Map();
let scratchTimer = null;
function scratchTotal(pts, diam) {
  const key = `${pts.length}|${pts[0].ts}|${pts[pts.length - 1].ts}|${diam}`;
  if (!scratchCache.has(key)) {
    if (scratchCache.size > 20) scratchCache.clear();
    scratchCache.set(key, hexVisits(pts, diam).cells.length);
  }
  return scratchCache.get(key);
}

function drawScratch(pts) {
  repaint = () => {
    layer.clearLayers();
    const dark = document.documentElement.dataset.theme === "dark";
    const diam = Prefs.hexDiam(map.getZoom());
    const view = map.getBounds().pad(0.35), cover = map.getBounds().pad(0.25);
    const hex = hexVisits(pts, diam, view);
    const ring = [[cover.getSouth(), cover.getWest()], [cover.getNorth(), cover.getWest()], [cover.getNorth(), cover.getEast()], [cover.getSouth(), cover.getEast()]];
    // coperta morbida e semitrasparente, senza bordi: le zone visitate sono "buchi" dai contorni arrotondati
    L.polygon([ring, ...softOutlines(hex.cells, hex.S)], {
      renderer: canvas, fillRule: "evenodd", smoothFactor: 0, interactive: false, stroke: false,
      fillColor: dark ? "#0b0b0b" : "#47536a", fillOpacity: dark ? .66 : .56,
    }).addTo(layer);
    // il totale degli esagoni grattati (su tutto il periodo scelto) si calcola subito dopo il disegno, così la mappa resta fluida
    const info = (n) => sumHtml([[n, "esagoni grattati"], [fmtM(diam), "diametro esagono"]]);
    $("modeinfo").innerHTML = info("…");
    clearTimeout(scratchTimer);
    scratchTimer = setTimeout(() => { if (mode === "scratch") $("modeinfo").innerHTML = info(scratchTotal(pts, diam).toLocaleString("it-IT")); }, 50);
  };
  return { fit: bbox(pts), info: "" };
}

// Notti: i luoghi in cui hai dormito, con il numero di notti. Il calcolo è spiegato nelle impostazioni.
function drawSleep(pts) {
  const sl = sleepPlaces(pts, Prefs.v.sleep.from, Prefs.v.sleep.to, Prefs.v.sleep.minPts, Prefs.v.sleep.radius);
  const top = sl.places[0] ? sl.places[0].nights : 1;
  // Con lo zoom lontano le lune si sovrapporrebbero: quelle vicine sullo schermo (entro ~60 px) si fondono in un gruppo
  // con il totale delle notti e il numero di luoghi. Toccando un gruppo la mappa si avvicina. Si ricalcola a ogni zoom.
  const paint = () => {
    const z = map.getZoom(), CELL = 60, cells = new Map();
    for (const p of sl.places) {
      const pt = map.project([p.lat, p.lon], z), k = Math.floor(pt.x / CELL) + "," + Math.floor(pt.y / CELL);
      const g = cells.get(k) || cells.set(k, { items: [], nights: 0, sl: 0, so: 0 }).get(k);
      g.items.push(p); g.nights += p.nights; g.sl += p.lat * p.nights; g.so += p.lon * p.nights;
    }
    const maxN = Math.max(1, ...[...cells.values()].map((g) => g.nights));
    cells.forEach((g) => {
      const size = Math.round(28 + 26 * Math.sqrt(g.nights / maxN));
      if (g.items.length === 1) {
        const p = g.items[0];
        const icon = L.divIcon({ className: "", iconSize: [size, size], iconAnchor: [size / 2, size / 2],
          html: `<div class="moon" style="width:${size}px;height:${size}px"><b>${p.nights}</b></div>` });
        const m = L.marker([p.lat, p.lon], { icon }).addTo(layer);
        m.bindPopup(() => `<div class="pop"><b>${placeSpan(p.lat, p.lon)}</b><br>${fmtSpan(p.nights, "notte", "notti")}<br>${fmtDay(p.first)} – ${fmtDay(p.last)}<br><button class="pop-btn" data-rename>Rinomina</button></div>`);
        m.on("popupopen", (e) => popupReady(e, p));
      } else {
        const lat = g.sl / g.nights, lon = g.so / g.nights;
        const icon = L.divIcon({ className: "", iconSize: [size, size], iconAnchor: [size / 2, size / 2],
          html: `<div class="moon cluster" style="width:${size}px;height:${size}px"><b>${g.nights}</b><i>${g.items.length}</i></div>` });
        const m = L.marker([lat, lon], { icon }).addTo(layer);
        m.on("click", () => map.fitBounds(L.latLngBounds(g.items.map((p) => [p.lat, p.lon])), { padding: [60, 60], maxZoom: 17 }));
      }
    });
  };
  repaint = () => { layer.clearLayers(); paint(); };
  const nights = sl.nights, n = sl.places.length;
  const info = n
    ? sumHtml([[nights.toLocaleString("it-IT"), "notti trovate"], [n.toLocaleString("it-IT"), "luoghi diversi"], [top.toLocaleString("it-IT"), "notti nel luogo principale"]])
    : `Nessuna notte rilevata nel periodo: servono almeno ${Prefs.v.sleep.minPts} punti entro ${Prefs.v.sleep.radius} m tra le ${String(Prefs.v.sleep.from).padStart(2, "0")}:00 e le ${String(Prefs.v.sleep.to).padStart(2, "0")}:00.`;
  return { fit: sl.places.map((p) => [p.lat, p.lon]), paint, info, nights, n };
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
      text: `Nuovo posto ${i + 1} di ${list.length}: ${p.visits} ${p.visits === 1 ? "visita" : "visite"}, ${fmtHoursLong(hours)}. Come lo chiami?`,
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

// Posti visitati: dove ti sei fermato almeno 20 minuti, raggruppati per luogo (entro 150 m), con visite e tempo totale.
// Con lo zoom lontano i posti vicini sullo schermo (entro ~56 px) si fondono in un gruppo con il totale di visite e il
// numero di posti; toccandolo la mappa si avvicina. Si ricalcola a ogni zoom.
function drawPlaces(pts) {
  const all = visitPlaces(pts), shown = all.slice(0, 1500);
  const todo = all.filter(needsName).length;
  const paint = () => {
    const z = map.getZoom(), CELL = 56, cells = new Map();
    for (const p of shown) {
      const pt = map.project([p.lat, p.lon], z), k = Math.floor(pt.x / CELL) + "," + Math.floor(pt.y / CELL);
      const g = cells.get(k) || cells.set(k, { items: [], visits: 0, ms: 0, sl: 0, so: 0 }).get(k);
      g.items.push(p); g.visits += p.visits; g.ms += p.ms; g.sl += p.lat * p.ms; g.so += p.lon * p.ms;
    }
    const maxMs = Math.max(1, ...[...cells.values()].map((g) => g.ms));
    cells.forEach((g) => {
      if (g.items.length === 1) {
        const p = g.items[0], hours = p.ms / 36e5, r = Math.max(6, Math.min(24, 6 + 4 * Math.sqrt(hours)));
        const named = !!Names.find(p.lat, p.lon);
        const m = L.circleMarker([p.lat, p.lon], { radius: r, color: "#fff", weight: 2, fillColor: named ? "#10b981" : p === all[0] ? "#f97316" : "#8b5cf6", fillOpacity: .78 }).addTo(layer);
        m.bindPopup(() => `<div class="pop"><b>${placeSpan(p.lat, p.lon)}</b><br>${p.visits} ${p.visits === 1 ? "visita" : "visite"} · ${fmtHoursLong(hours)}<br>${fmtDay(p.first)} – ${fmtDay(p.last)}<br><button class="pop-btn" data-rename>${named ? "Rinomina" : "Dai un nome"}</button></div>`);
        m.on("popupopen", (e) => popupReady(e, p));
      } else {
        const size = Math.round(30 + 24 * Math.sqrt(g.ms / maxMs)), lat = g.sl / g.ms, lon = g.so / g.ms;
        const icon = L.divIcon({ className: "", iconSize: [size, size], iconAnchor: [size / 2, size / 2],
          html: `<div class="moon cluster pl" style="width:${size}px;height:${size}px"><b>${g.visits}</b><i>${g.items.length}</i></div>` });
        L.marker([lat, lon], { icon }).addTo(layer)
          .on("click", () => map.fitBounds(L.latLngBounds(g.items.map((p) => [p.lat, p.lon])), { padding: [60, 60], maxZoom: 17 }));
      }
    });
  };
  repaint = () => { layer.clearLayers(); paint(); };
  const tot = all.reduce((a, p) => a + p.visits, 0), named = all.filter((p) => Names.find(p.lat, p.lon)).length;
  $("name-new").hidden = !todo;
  $("name-new").textContent = `Nomina ${todo > 40 ? "i primi 40 dei " + todo : todo} nuovi posti`;
  const f = (n) => n.toLocaleString("it-IT");
  return {
    fit: shown.map((p) => [p.lat, p.lon]), paint, n: all.length, tot,
    info: all.length ? sumHtml([[f(all.length), "posti totali"], [f(tot), "visite"], [f(named), "rinominati"], [f(todo), "da rinominare"]]) : "Nessuna sosta trovata nel periodo.",
  };
}

// Notti e posti insieme: i posti visitati con sopra le lune delle notti
function drawStay(pts) {
  const p = drawPlaces(pts), s = drawSleep(pts);
  repaint = () => { layer.clearLayers(); p.paint(); s.paint(); };
  const f = (n) => n.toLocaleString("it-IT");
  const info = p.n || s.n
    ? sumHtml([[f(s.nights), "notti trovate"], [f(s.n), "luoghi per dormire"], [f(p.n), "posti totali"], [f(p.tot), "visite"]])
    : "Nessuna sosta né notte trovata nel periodo.";
  return { fit: [...p.fit, ...s.fit], info };
}

// Inquadra la tua posizione (l'ultima nota se manca il GPS) con 100 km di raggio, cioè 200 km sulla larghezza della mappa
// (zoom frazionario); se non c'è nessuna posizione non muove la mappa
function goHere() {
  const c = here || (points.length ? points[points.length - 1] : null), w = map.getSize().x;
  if (!c || !w) return;
  const z = Math.log2(156543.03 * Math.cos((c.lat * Math.PI) / 180) / (200000 / w));
  map.setView([c.lat, c.lon], Math.max(3, Math.min(17, z)), { animate: false });
}

// fit = true quando l'utente cambia vista o filtro: allora la mappa inquadra i dati; all'avvio resta su dove sei
function render(fit) {
  layer.clearLayers();
  $("name-new").hidden = true;
  repaint = null;
  // I km si calcolano sempre sugli stessi dati (tutti i punti del filtro), così sono uguali in ogni vista; percorsi e heatmap
  // si disegnano invece sui punti alleggeriti (senza soste importate e con almeno 15 m tra due punti)
  const all = applyFilter(points);
  const pts = mode === "heat" || mode === "routes" || mode === "mix" ? applyFilter(movePts) : all;
  const draw = { scratch: drawScratch, heat: drawHeat, routes: drawRoutes, mix: drawMix, sleep: drawSleep, places: drawPlaces, stay: drawStay }[mode];
  const r = pts.length ? draw(pts) : { fit: [], info: "Nessun punto nel periodo scelto." };
  updateFilterUI();
  map.invalidateSize();
  if (firstRender && here) {
    map.setView([here.lat, here.lon], 15);
  } else if (fit) {
    goHere(); // cambiando vista o filtro non si inquadra tutto lo storico: si resta dove sei, con 100 km di raggio
  }
  firstRender = false;
  $("modeinfo").innerHTML = r.info || "";
  if (repaint) repaint();
  // Heatmap, Percorsi e Mix non mostrano dati: il pannello compare solo se c'è qualcosa da dire
  $("panel").hidden = !$("modeinfo").innerHTML && $("name-new").hidden;
}
let moveTimer = null;
map.on("moveend", () => { clearTimeout(moveTimer); moveTimer = setTimeout(() => repaint && repaint(), 120); });

// Vista corrente: le targhette a destra la mostrano e la cambiano. silent = arriva dalle impostazioni condivise (non si risalva).
const MODE_LABEL = {};
document.querySelectorAll("#modes [data-mode]").forEach((b) => (MODE_LABEL[b.dataset.mode] = b.textContent.trim()));
function showModeUI() {
  document.querySelectorAll("#modes button").forEach((x) => x.classList.toggle("active", x.dataset.mode === mode));
  document.querySelectorAll("#modes button").forEach((x) => x.classList.toggle("on", x.dataset.mode === mode));
  tuneRefresh();
}
function setMode(m, silent) {
  if (!MODES.includes(m) || (silent && m === mode)) return;
  mode = m;
  showModeUI();
  if (!silent) { Prefs.v.view = m; Prefs.save(); }
  render(!silent);
}
document.querySelectorAll("#modes button").forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));

// Personalizzazione nella mappa: il pannello mostra solo le sezioni della vista corrente (più l'Aspetto, che vale per tutte),
// così le modifiche si vedono subito sulla parte di mappa ancora visibile.
const TUNE = {
  scratch: ["hex"], heat: ["heat"], routes: ["route"], mix: ["route", "heat"],
  sleep: ["sleep", "places"], places: ["places"], stay: ["sleep", "places"],
};
function tuneRefresh() {
  const want = [...(TUNE[mode] || []), "theme"];
  $("p-title").textContent = "Personalizza · " + (MODE_LABEL[mode] || "");
  document.querySelectorAll("#prefs-ui details[data-fold]").forEach((d) => {
    d.hidden = !want.includes(d.dataset.fold);
    if (d.dataset.fold !== "theme") d.open = true; // le sezioni della vista sono sempre aperte; l'Aspetto si apre a richiesta
  });
}
function openTune(on) {
  $("psheet").hidden = !on;
  $("mapwrap").classList.toggle("tuning", on);
  $("tune").classList.toggle("on", on);
  if (on) { tuneRefresh(); $("psheet").scrollTop = 0; setTimeout(() => window.paintFxPreview && paintFxPreview(), 80); }
  setTimeout(() => map.invalidateSize(), 50);
}
$("tune").onclick = () => openTune($("psheet").hidden);
$("p-close").onclick = () => openTune(false);
showModeUI();

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
  $("s-ver").textContent = $("l-version").textContent = /^\d/.test(s.version) ? "v" + s.version : s.version;
  $("t-state").textContent = s.tracking ? "Tracking ATTIVO" : "Tracking fermo";
  $("t-state").classList.toggle("on", s.tracking);
  $("t-total").textContent = s.total;
  $("t-pending").textContent = s.pending;
  $("t-sync").textContent = s.lastSync;
  $("toggle").textContent = s.tracking ? "Ferma tracking" : "Avvia tracking";
  $("toggle").classList.toggle("danger", s.tracking);
  refreshHealth();
}
// ---------- salute del tracking e frequenza dei punti ----------
const agoText = (ms) => { const m = Math.round(ms / 60000); return m < 1 ? "adesso" : m < 60 ? `${m} min fa` : m < 1440 ? `${(m / 60).toFixed(1)} h fa` : `${Math.round(m / 1440)} giorni fa`; };
function trackHealth() {
  const h = Native.health(), c = Native.trackerConfig();
  const stillMs = Math.max(5000, c.stillMinutes * 60000 / Math.max(1, c.stillPoints));
  const age = h.lastTs ? Date.now() - h.lastTs : Infinity;
  const stale = h.tracking && (!h.running || age > Math.max(30 * 60000, 3 * stillMs));
  return { h, c, age, stale };
}
function refreshHealth() {
  const { h, age, stale } = trackHealth();
  $("trackwarn").hidden = !Native.isApp || !stale;
  const row = (k, state, text, act, label) => `<div class="kv"><span>${k}</span><b class="st ${state}">${text}</b>${act ? `<button class="hbtn secondary" data-act="${act}">${label}</button>` : ""}</div>`;
  $("t-health").innerHTML =
    row("Servizio", h.running ? "ok" : h.tracking ? "bad" : "warn", h.running ? "In esecuzione" : h.tracking ? "Fermo!" : "Spento", h.running ? "" : "start", "Avvia") +
    row("Ultimo punto", !h.lastTs ? "warn" : h.tracking && age > 30 * 60000 ? "bad" : "ok", h.lastTs ? agoText(age) : "mai") +
    row("Posizione «sempre»", h.bg ? "ok" : "bad", h.bg ? "Concessa" : "Manca", h.bg ? "" : "settings", "Apri") +
    row("Risparmio batteria", h.battery ? "ok" : "warn", h.battery ? "Escluso" : "Limitato", h.battery ? "" : "battery", "Escludi") +
    row("Notifiche", h.notif ? "ok" : "warn", h.notif ? "Attive" : "Disattivate", h.notif ? "" : "settings", "Apri");
}
$("t-health").addEventListener("click", (e) => {
  const a = e.target.dataset && e.target.dataset.act;
  if (a === "start") { Native.start(); setTimeout(() => { refreshStatus(); refreshHealth(); }, 800); }
  if (a === "battery") Native.battery();
  if (a === "settings") Native.openAppSettings();
});
$("trackwarn").onclick = () => { show("settings"); const d = document.querySelector('details[data-fold="tracker"]'); if (d) { d.open = true; d.scrollIntoView(); } };

function fillTrackerConfig() {
  const c = Native.trackerConfig();
  $("tc-moving").value = c.movingSec; $("tc-still-n").value = c.stillPoints; $("tc-still-m").value = c.stillMinutes;
}
$("tc-save").onclick = () => {
  const n = (id, lo, hi) => Math.min(hi, Math.max(lo, Math.round(+$(id).value) || lo));
  Native.setTrackerConfig({ movingSec: n("tc-moving", 1, 600), stillPoints: n("tc-still-n", 1, 60), stillMinutes: n("tc-still-m", 1, 240) });
  Prefs.save(); // la frequenza dei punti fa parte delle impostazioni condivise
  fillTrackerConfig();
  sumTrackerConfig();
  Native.haptic("ok");
  $("tc-msg").textContent = "Frequenza applicata.";
  setTimeout(() => ($("tc-msg").textContent = ""), 3000);
};
function sumTrackerConfig() {
  const mv = Math.max(1, +$("tc-moving").value || 1), n = Math.max(1, +$("tc-still-n").value || 1), m = Math.max(1, +$("tc-still-m").value || 1);
  const f = (x) => (x >= 10 ? Math.round(x) : Math.round(x * 10) / 10).toLocaleString("it-IT");
  $("tc-sum").textContent = `Circa ${f(3600 / mv)} punti all'ora in movimento e ${f(n * 60 / m)} all'ora da fermo.`;
}
["tc-moving", "tc-still-n", "tc-still-m"].forEach((id) => $(id).addEventListener("input", sumTrackerConfig));
$("fix-now").onclick = async () => {
  $("fix-now").disabled = true;
  $("fix-msg").classList.remove("err");
  $("fix-msg").textContent = "Cerco la posizione… (fino a 20 secondi)";
  const r = await Native.fix(true);
  $("fix-now").disabled = false;
  if (r.ok) {
    here = { lat: r.lat, lon: r.lon };
    $("fix-msg").textContent = `Posizione registrata: precisione ${r.acc == null ? "sconosciuta" : Math.round(r.acc) + " m"}, ${r.provider === "gps" ? "GPS" : r.provider === "network" ? "rete" : r.provider}.`;
    Native.haptic("ok");
    refreshStatus();
  } else {
    $("fix-msg").classList.add("err");
    $("fix-msg").textContent = r.error || "Posizione non disponibile";
    Native.haptic("error");
  }
};
fillTrackerConfig();
sumTrackerConfig();
refreshHealth();
setInterval(refreshHealth, 20000);

$("toggle").onclick = () => {
  Native.status().tracking ? Native.stop() : Native.start();
  setTimeout(refreshStatus, 400);
};
$("sync").onclick = () => { Native.sync(); setTimeout(refreshStatus, 400); };
$("battery").onclick = () => Native.battery();
$("battery").hidden = !Native.isApp;
setInterval(() => { if ($("view-settings").classList.contains("active")) refreshStatus(); }, 3000);

// preferenze (esagoni, heatmap, notti, nomi): ogni modifica ridisegna la mappa
buildPrefsUI();
bindPrefsUI();
Prefs.onChange = (g) => { if (g === "mapFx") { applyMapFx(); return; } statsFor = ""; render(false); };
Prefs.applyTheme();
Native.setTheme(Prefs.v.theme); // l'app lo ricorda per colorare le barre di sistema prima che la pagina si carichi
$("repull").onclick = () => { Native.repull(); $("repull-msg").textContent = "Scarico avviato: i punti nuovi compaiono al prossimo avvio dell'app."; };

refreshStatus();
loadPoints();
