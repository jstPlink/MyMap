// Preferenze dell'utente (salvate nel telefono): dimensione degli esagoni per zoom, heatmap, notti, nomi dei luoghi.
const ZMIN = 5, ZMAX = 17;

// Stili della mappa di base (tutti senza chiave: Esri e OpenStreetMap). `cls` è la classe con i filtri di colore in style.css.
const ESRI = (p) => `https://server.arcgisonline.com/ArcGIS/rest/services/${p}/MapServer/tile/{z}/{y}/{x}`;
const ESRI_ATTR = "Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap";
const MAP_STYLES = {
  color: { label: "Colorata", url: ESRI("World_Street_Map"), max: 19, cls: "tiles-color", attr: ESRI_ATTR },
  pastel: { label: "Pastello", url: ESRI("World_Street_Map"), max: 19, cls: "tiles-pastel", attr: ESRI_ATTR },
  sepia: { label: "Seppia", url: ESRI("World_Street_Map"), max: 19, cls: "tiles-sepia", attr: ESRI_ATTR },
  osm: { label: "OpenStreetMap", url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", max: 19, cls: "tiles-osm", attr: "&copy; OpenStreetMap contributors" },
  topo: { label: "Topografica", url: ESRI("World_Topo_Map"), max: 19, cls: "tiles-topo", attr: ESRI_ATTR },
  natgeo: { label: "National Geographic", url: ESRI("NatGeo_World_Map"), max: 12, cls: "tiles-natgeo", attr: ESRI_ATTR },
  sat: { label: "Satellite", url: ESRI("World_Imagery"), max: 19, cls: "tiles-sat", attr: ESRI_ATTR, ref: ESRI("Reference/World_Boundaries_and_Places") },
  simple: { label: "Semplice (grigia)", url: (d) => ESRI(`Canvas/World_${d ? "Dark" : "Light"}_Gray_Base`), max: 16, attr: ESRI_ATTR, ref: (d) => ESRI(`Canvas/World_${d ? "Dark" : "Light"}_Gray_Reference`) },
};
const NICE = [100, 150, 200, 300, 500, 800, 1000, 1500, 2000, 3000, 5000, 8000, 10000, 15000, 20000, 30000, 50000, 80000, 100000, 200000, 300000];

// Diametro predefinito per ogni zoom: circa 52 px sullo schermo, arrotondato a un valore "tondo", mai sotto i 100 m
function defaultHexDiam(z) {
  const target = 52 * 156543 * Math.cos(44.5 * Math.PI / 180) / 2 ** z;
  let best = NICE[0];
  NICE.forEach((n) => { if (Math.abs(Math.log(n / target)) < Math.abs(Math.log(best / target))) best = n; });
  return Math.max(100, best);
}

const HEAT_PRESETS = {
  classico: ["#3b82f6", "#22c55e", "#facc15", "#ef4444"],
  fuoco: ["#7f1d1d", "#ea580c", "#fbbf24", "#fff7ed"],
  oceano: ["#1e3a8a", "#0ea5e9", "#2dd4bf", "#ecfeff"],
  viola: ["#4c1d95", "#c026d3", "#fb7185", "#fef9c3"],
};
const HEAT_STOPS = [0.2, 0.45, 0.7, 1];

const DEFAULTS_V = 2; // da alzare quando cambiano i valori di partenza di aspetto, esagoni, heatmap e percorsi

function prefDefaults() {
  const hex = { zooms: [3, 13, 16], diams: [50000, 170, 50] }; // tre livelli di zoom; in mezzo si interpola
  return {
    hex,
    heat: { zooms: [7, 11, 15], widths: [5, 3, 2], blur: 1, max: 1, minOpacity: 16, step: 1, preset: "fuoco", colors: [...HEAT_PRESETS.fuoco] },
    sleep: { v: 2, from: 23, to: 9, minPts: 2, radius: 300, accMax: 0, minSpan: 0, coreMin: 0, coreFrom: 1, coreTo: 5, merge: 400 }, // v: versione della formula
    route: { mode: "freq", color: "#00796b", zooms: [7, 11, 15], widths: [1.5, 2.5, 5], opacity: 0, blur: 1, max: 6, minOpacity: 30, detail: 1, preset: "fuoco", colors: [...HEAT_PRESETS.fuoco] },
    theme: "dark", // system | light | dark
    mapStyle: "topo", // una chiave di MAP_STYLES
    outline: "auto", // auto (sottile nel tema chiaro) | thin (sempre) | off (mai): linea attorno a pannelli e pulsanti
    // ritocchi alla mappa di base (cursori in Aspetto): filtri di colore e tinta sovrapposta
    mapFx: { hue: 0, sat: 150, bright: 100, contrast: 95, gray: 0, sepia: 0, invert: 0, blur: 0, tint: "#3b82f6", tintOpacity: 0, tintMode: "multiply" },
    hidden: { places: [], nights: [] }, // posti e notti nascosti dall'utente (i dati restano): posti = {lat, lon, label}, notti = chiavi AAAAMMGG della sera
    presets: {}, // preset salvati dall'utente: { gruppo: { nome: valori } }, gruppi hex, heat, route, sleep, look
    view: "scratch", // vista della mappa, condivisa tra i dispositivi
    names: true,
  };
}

// Esagoni della scratch map: tre coppie zoom → diametro. Il vecchio formato (un diametro per ogni zoom da 5 a 17) si converte
// prendendo i valori agli zoom di partenza.
function hexAdopt(s, d) {
  if (s && Array.isArray(s.zooms) && Array.isArray(s.diams) && s.zooms.length === 3 && s.diams.length === 3) {
    return { zooms: s.zooms.map(Number), diams: s.diams.map(Number) };
  }
  if (s && typeof s === "object") return { zooms: [...d.zooms], diams: d.zooms.map((z, i) => +s[z] || d.diams[i]) };
  return d;
}

const Prefs = {
  v: prefDefaults(),
  onChange: null, // (gruppo) => void, impostato da app.js
  onSaved: null, // () => void, impostato da profile.js: ogni modifica delle impostazioni sale anche sul profilo
  adopt(saved) {
    const d = prefDefaults();
    // versione dei valori di partenza: se cambia, aspetto, esagoni, heatmap e percorsi salvati tornano ai nuovi valori (una volta sola)
    if (saved.dv !== DEFAULTS_V) {
      if (["hex", "heat", "route", "theme", "mapStyle", "mapFx"].some((k) => saved[k] !== undefined)) this.migrated = true;
      saved = { ...saved, hex: undefined, heat: undefined, route: undefined, theme: undefined, mapStyle: undefined, mapFx: undefined };
    }
    this.v = { dv: DEFAULTS_V, hex: hexAdopt(saved.hex, d.hex), heat: { ...d.heat, ...saved.heat }, sleep: saved.sleep && saved.sleep.v === d.sleep.v ? { ...d.sleep, ...saved.sleep } : d.sleep, route: { ...d.route, ...saved.route }, theme: saved.theme ?? d.theme, mapStyle: saved.mapStyle ?? d.mapStyle, outline: ["thin", "off", "auto"].includes(saved.outline) ? saved.outline : "auto", mapFx: { ...d.mapFx, ...saved.mapFx }, presets: saved.presets && typeof saved.presets === "object" ? saved.presets : {}, view: typeof saved.view === "string" ? saved.view : d.view, hidden: { places: Array.isArray(saved.hidden && saved.hidden.places) ? saved.hidden.places : [], nights: Array.isArray(saved.hidden && saved.hidden.nights) ? saved.hidden.nights : [] }, names: saved.names ?? d.names };
  },
  load() {
    try { this.adopt(JSON.parse(localStorage.getItem("mymap.prefs") || "{}")); } catch { this.v = prefDefaults(); }
  },
  save() { try { localStorage.setItem("mymap.prefs", JSON.stringify(this.v)); } catch {} if (this.onSaved) this.onSaved(); },
  // Diametro dell'esagono allo zoom dato: tra due livelli si interpola (in scala logaritmica, perché i diametri crescono di
  // molto), fuori dal primo e dall'ultimo resta il valore più vicino. Si arrotonda a due cifre per non cambiare griglia a ogni frazione di zoom.
  hexDiam(zoom) {
    const o = this.v.hex, P = o.zooms.map((z, i) => [+z, Math.max(20, +o.diams[i] || 100)]).sort((a, b) => a[0] - b[0]);
    let d = P[P.length - 1][1];
    if (zoom <= P[0][0]) d = P[0][1];
    else for (let i = 1; i < P.length; i++) {
      if (zoom <= P[i][0]) {
        const [z0, d0] = P[i - 1], [z1, d1] = P[i];
        d = z1 === z0 ? d1 : Math.exp(Math.log(d0) + (Math.log(d1) - Math.log(d0)) * (zoom - z0) / (z1 - z0));
        break;
      }
    }
    return Math.max(20, Number(d.toPrecision(2)));
  },
  heatGradient() { const g = {}; this.v.heat.colors.forEach((c, i) => (g[HEAT_STOPS[i]] = c)); return g; },
  // tema effettivo: la scelta dell'utente, oppure quello del telefono (l'app lo passa nell'indirizzo come sys=0/1)
  sysDark() { const m = /[?&]sys=(\d)/.exec(location.search); return m ? m[1] === "1" : matchMedia("(prefers-color-scheme: dark)").matches; },
  isDark() { return this.v.theme === "dark" || (this.v.theme === "system" && this.sysDark()); },
  // contorno effettivo dei pannelli: "auto" è sottile nel tema chiaro e assente nello scuro
  effOutline() { const o = this.v.outline; return o === "thin" ? "thin" : o === "off" ? "none" : "thin"; },
  applyTheme() { document.documentElement.dataset.theme = this.isDark() ? "dark" : "light"; document.documentElement.dataset.outline = this.effOutline(); },
  // Spessore in px allo zoom `z` per "heat" (raggio) o "route" (linea): tre livelli di zoom, ciascuno col suo valore; tra un livello
  // e l'altro si interpola, fuori dal primo e dall'ultimo resta il valore più vicino.
  widthAt(g, z) {
    const o = this.v[g], pts = o.zooms.map((zz, i) => [+zz, +o.widths[i]]).sort((a, b) => a[0] - b[0]);
    if (z <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) {
      if (z <= pts[i][0]) { const [z0, w0] = pts[i - 1], [z1, w1] = pts[i]; return z1 === z0 ? w1 : w0 + (w1 - w0) * (z - z0) / (z1 - z0); }
    }
    return pts[pts.length - 1][1];
  },
  // Preset: copia dei valori di un gruppo di impostazioni ("look" = tema + stile mappa)
  groupGet(g) { return g === "look" ? { theme: this.v.theme, mapStyle: this.v.mapStyle, outline: this.v.outline, mapFx: { ...this.v.mapFx } } : JSON.parse(JSON.stringify(this.v[g])); },
  groupSet(g, data) {
    const d = prefDefaults();
    if (g === "look") { this.v.theme = data.theme ?? d.theme; this.v.mapStyle = data.mapStyle ?? d.mapStyle; this.v.outline = data.outline ?? d.outline; this.v.mapFx = { ...d.mapFx, ...data.mapFx }; }
    else if (g === "hex") this.v.hex = hexAdopt(data, d.hex);
    else this.v[g] = { ...d[g], ...JSON.parse(JSON.stringify(data)) };
  },
  // Notti trovate con le impostazioni correnti (comprese le opzioni di prova)
  sleepOf(pts) { const s = this.v.sleep; return sleepPlaces(pts, s.from, s.to, s.minPts, s.radius, this.hiddenNights(), s); },
  hiddenNights() { return new Set(this.v.hidden.nights); },
  isPlaceHidden(lat, lon) { return this.v.hidden.places.some((h) => km(h, { lat, lon }) < 0.15); },
  reset(group) { const d = prefDefaults(); this.v[group] = d[group]; this.save(); },
};
Prefs.load();

// ---------- schermata delle impostazioni ----------
const fmtM = (m) => (m >= 1000 ? `${(m / 1000).toLocaleString("it-IT", { maximumFractionDigits: 1 })} km` : `${m} m`);
const setPath = (o, path, val) => { const k = path.split("."); const last = k.pop(); k.reduce((a, b) => a[b], o)[last] = val; };

// Tre righe "Zoom → spessore": ogni livello di zoom ha il suo spessore in pixel
function zoomWidthRows(g, label, maxPx) {
  const o = Prefs.v[g];
  return `<div class="zw"><p class="zwt">${label}<small>px a tre livelli di zoom (3 lontano, 19 vicino); tra un livello e l'altro si interpola</small></p>${[0, 1, 2].map((i) =>
    `<div class="zwrow"><span>Zoom</span><input data-k="${g}.zooms.${i}" type="number" min="3" max="19" step="0.5" value="${o.zooms[i]}"><span>→</span><input data-k="${g}.widths.${i}" type="number" min="0.5" max="${maxPx}" step="0.5" value="${o.widths[i]}"><em>px</em></div>`).join("")}</div>`;
}

// Cursore dei ritocchi alla mappa, con il valore a destra
function fxRange(k, label, min, max, step, unit) {
  const v = Prefs.v.mapFx[k];
  return `<label class="field fx"><span>${label}</span><input type="range" data-k="mapFx.${k}" min="${min}" max="${max}" step="${step}" value="${v}"><output data-out="${k}" data-unit="${unit}">${v}${unit}</output></label>`;
}
function fxLabels(root) { root.querySelectorAll("output[data-out]").forEach((o) => { o.textContent = Prefs.v.mapFx[o.dataset.out] + o.dataset.unit; }); }

function field(label, k, attrs, hint) {
  return `<label class="field"><span>${label}${hint ? `<small>${hint}</small>` : ""}</span><input data-k="${k}" ${attrs}></label>`;
}

// Sezione richiudibile: lo stato aperto/chiuso si ricorda tra una visita e l'altra
const fold = (id, title, body) => `<details class="card fold" data-fold="${id}"><summary>${title}</summary><div class="foldbody">${body}</div></details>`;
const foldOpen = () => { try { const s = localStorage.getItem("mymap.folds"); return s ? JSON.parse(s) : ["tracker"]; } catch { return ["tracker"]; } }; // la prima volta è aperto il tracker
function restoreFolds(root) {
  const open = foldOpen();
  root.querySelectorAll("details[data-fold]").forEach((d) => (d.open = open.includes(d.dataset.fold)));
}
document.addEventListener("toggle", (e) => {
  const d = e.target;
  if (!d.matches || !d.matches("details[data-fold]")) return;
  const set = new Set(foldOpen());
  d.open ? set.add(d.dataset.fold) : set.delete(d.dataset.fold);
  if (d.open && d.dataset.fold === "theme" && window.paintFxPreview) setTimeout(paintFxPreview, 60); // l'anteprima si disegna quando la sezione è visibile
  try { localStorage.setItem("mymap.folds", JSON.stringify([...set])); } catch {}
}, true);

// ---------- preset: ogni gruppo (esagoni, heatmap, percorsi, notti, aspetto) può avere i suoi, salvati nel profilo ----------
const presetSel = {}; // preset applicato per gruppo (solo finché non si modifica un valore)
function presetBar(g) {
  const names = Object.keys((Prefs.v.presets || {})[g] || {}).sort((a, b) => a.localeCompare(b, "it"));
  const cur = presetSel[g] && names.includes(presetSel[g]) ? presetSel[g] : "";
  return `<div class="presetbar" data-pgroup="${g}">
    <select data-psel="${g}"><option value="">Preset…</option>${names.map((n) => `<option value="${esc(n)}" ${n === cur ? "selected" : ""}>${esc(n)}</option>`).join("")}</select>
    <button class="secondary" data-psave="${g}">Salva</button>
    <button class="secondary" data-pdel="${g}" ${cur ? "" : "disabled"}>Elimina</button>
  </div>`;
}
const presetGroupOf = (k) => { const g = k.split(".")[0]; return g === "theme" || g === "mapStyle" || g === "mapFx" || g === "outline" ? "look" : ["hex", "heat", "route", "sleep"].includes(g) ? g : null; };
function clearPresetSel(k) { // modificando un valore a mano il gruppo non corrisponde più al preset scelto
  const g = presetGroupOf(k);
  if (!g || !presetSel[g]) return;
  presetSel[g] = "";
  const bar = document.querySelector(`.presetbar[data-pgroup="${g}"]`);
  if (bar) { bar.querySelector("select").value = ""; bar.querySelector("[data-pdel]").disabled = true; }
}
function applyPreset(g, name) {
  const data = name && ((Prefs.v.presets || {})[g] || {})[name];
  presetSel[g] = data ? name : "";
  if (!data) { buildPrefsUI(); return; }
  Prefs.groupSet(g, data);
  Prefs.save();
  buildPrefsUI();
  if (g === "look") { Prefs.applyTheme(); Native.setTheme(Prefs.v.theme); if (window.setBase) setBase(); if (window.paintFxPreview) paintFxPreview(); }
  Prefs.onChange && Prefs.onChange(g);
}
async function savePreset(g) {
  const r = await promptDialog({ text: "Nome del preset. Se esiste già viene sostituito.", value: presetSel[g] || "", placeholder: "Es. Città, Mare, Notte…", okLabel: "Salva" });
  if (r.action !== "save" || !r.value) return;
  Prefs.v.presets = Prefs.v.presets || {};
  (Prefs.v.presets[g] = Prefs.v.presets[g] || {})[r.value] = Prefs.groupGet(g);
  presetSel[g] = r.value;
  Prefs.save();
  buildPrefsUI();
}
async function deletePreset(g) {
  const name = presetSel[g];
  if (!name || !(await confirmDialog(`Eliminare il preset "${name}"?`, "Elimina"))) return;
  delete Prefs.v.presets[g][name];
  presetSel[g] = "";
  Prefs.save();
  buildPrefsUI();
}

function buildPrefsUI() {
  const root = document.getElementById("prefs-ui");
  if (!root) return;
  const v = Prefs.v;
  const hexRows = `<div class="zw"><p class="zwt">Diametro<small>metri a tre livelli di zoom (3 lontano, 19 vicino); tra un livello e l'altro si interpola</small></p>${[0, 1, 2].map((i) =>
    `<div class="zwrow"><span>Zoom</span><input data-k="hex.zooms.${i}" type="number" min="3" max="19" step="0.5" value="${v.hex.zooms[i]}"><span>→</span><input data-k="hex.diams.${i}" type="number" min="20" step="10" value="${v.hex.diams[i]}"><em>m</em></div>`).join("")}</div>`;
  const presets = Object.keys(HEAT_PRESETS).map((p) => `<option value="${p}" ${v.heat.preset === p ? "selected" : ""}>${p[0].toUpperCase() + p.slice(1)}</option>`).join("") +
    `<option value="custom" ${v.heat.preset === "custom" ? "selected" : ""}>Personalizzato</option>`;
  const hours = (sel) => Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${h === sel ? "selected" : ""}>${String(h).padStart(2, "0")}:00</option>`).join("");

  const themes = [["system", "Come il telefono"], ["light", "Chiaro"], ["dark", "Scuro"]]
    .map(([k, t]) => `<option value="${k}" ${v.theme === k ? "selected" : ""}>${t}</option>`).join("");

  const routeModes = [["single", "Colore unico"], ["freq", "Per frequenza"]]
    .map(([k, t]) => `<option value="${k}" ${v.route.mode === k ? "selected" : ""}>${t}</option>`).join("");
  const routePresets = Object.keys(HEAT_PRESETS).map((p) => `<option value="${p}" ${v.route.preset === p ? "selected" : ""}>${p[0].toUpperCase() + p.slice(1)}</option>`).join("") +
    `<option value="custom" ${v.route.preset === "custom" ? "selected" : ""}>Personalizzato</option>`;
  const tintModes = [["multiply", "Moltiplica (scurisce)"], ["screen", "Schermo (schiarisce)"], ["overlay", "Sovrapponi"], ["color", "Colore (ricolora)"], ["normal", "Normale"]]
    .map(([k, t]) => `<option value="${k}" ${v.mapFx.tintMode === k ? "selected" : ""}>${t}</option>`).join("");
  const outlines = [["auto", "Automatico"], ["thin", "Sempre"], ["off", "Nessuno"]]
    .map(([k, t]) => `<option value="${k}" ${v.outline === k ? "selected" : ""}>${t}</option>`).join("");
  const mapStyles = Object.entries(MAP_STYLES)
    .map(([k, s]) => `<option value="${k}" ${v.mapStyle === k ? "selected" : ""}>${s.label}</option>`).join("");

  root.innerHTML =
    fold("theme", "Aspetto", `
      ${presetBar("look")}
      <label class="field"><span>Tema<small>chiaro, scuro o quello impostato nel telefono</small></span>
        <select data-k="theme">${themes}</select></label>
      <label class="field"><span>Mappa<small>stile della mappa di base</small></span>
        <select data-k="mapStyle">${mapStyles}</select></label>
      <label class="field"><span>Contorno dei pannelli<small>linea sottile attorno a pannelli e pulsanti; automatico = nel tema chiaro</small></span>
        <select data-k="outline">${outlines}</select></label>
      <h3>Ritocchi alla mappa</h3>
      <p class="hint">Regolano i colori della mappa di base, qualunque stile tu abbia scelto. L'anteprima mostra il risultato.</p>
      <div class="fxprev" id="fxprev"></div>
      ${fxRange("hue", "Tonalità", -180, 180, 5, "°")}
      ${fxRange("sat", "Saturazione", 0, 300, 5, "%")}
      ${fxRange("bright", "Luminosità", 30, 170, 5, "%")}
      ${fxRange("contrast", "Contrasto", 30, 170, 5, "%")}
      ${fxRange("gray", "Grigio", 0, 100, 5, "%")}
      ${fxRange("sepia", "Seppia", 0, 100, 5, "%")}
      ${fxRange("invert", "Inversione", 0, 100, 5, "%")}
      ${fxRange("blur", "Sfocatura", 0, 8, 0.5, " px")}
      <label class="field"><span>Tinta<small>colore sovrapposto alla mappa; può rallentare i telefoni meno potenti</small></span><input type="color" data-k="mapFx.tint" value="${v.mapFx.tint}" class="colorbtn"></label>
      ${fxRange("tintOpacity", "Intensità tinta", 0, 80, 5, "%")}
      <label class="field"><span>Modo della tinta</span><select data-k="mapFx.tintMode">${tintModes}</select></label>
      <button class="secondary" data-reset="mapFx">Azzera ritocchi</button>`) +

    fold("route", "Percorsi · linee", `
      ${presetBar("route")}
      <label class="field"><span>Stile<small>colore unico, oppure colori per frequenza come la heatmap</small></span>
        <select data-k="route.mode">${routeModes}</select></label>
      <label class="field"><span>Colore<small>solo con colore unico</small></span><input type="color" data-k="route.color" value="${v.route.color}" class="colorbtn"></label>
      ${zoomWidthRows("route", "Spessore", 20)}
      ${field("Opacità", "route.opacity", `type="number" min="5" max="100" step="5" value="${v.route.opacity}"`, "% · solo con colore unico: bassa = i tratti ripetuti si scuriscono")}
      ${field("Sfocatura", "route.blur", `type="number" min="0" max="40" step="1" value="${v.route.blur}"`, "px · solo per frequenza")}
      ${field("Quantità di calore", "route.max", `type="number" min="1" max="200" step="1" value="${v.route.max}"`, "passaggi sovrapposti per il colore più caldo: più bassa = più caldo · solo per frequenza")}
      ${field("Opacità minima", "route.minOpacity", `type="number" min="0" max="100" step="5" value="${v.route.minOpacity}"`, "% · solo per frequenza")}
      ${field("Dettaglio", "route.detail", `type="number" min="0.5" max="8" step="0.5" value="${v.route.detail}"`, "px di semplificazione dei tratti: più alto = più semplice e leggero")}
      <label class="field"><span>Gradiente<small>colori dal meno al più percorso · solo per frequenza</small></span>
        <select data-k="route.preset" id="route-preset">${routePresets}</select></label>
      <div class="colors">${v.route.colors.map((c, i) => `<input type="color" data-k="route.colors.${i}" value="${c}">`).join("")}</div>
      <div class="gradbar" id="routebar"></div>
      <div class="routeprev" id="routeprev"></div>
      <button class="secondary" data-reset="route">Ripristina percorsi</button>`) +

    fold("hex", "Scratch map · esagoni", `
      ${presetBar("hex")}
      <p class="hint">Diametro dell'esagono (da vertice a vertice). Scegli lo zoom e la dimensione per tre livelli: agli zoom intermedi la dimensione si calcola da sola. Più lo zoom è lontano, più gli esagoni devono crescere per non appesantire la mappa. Il minimo consigliato è 100 m.</p>
      ${hexRows}
      <button class="secondary" data-reset="hex">Ripristina dimensioni</button>`) +

    fold("heat", "Heatmap", `
      ${presetBar("heat")}
      ${zoomWidthRows("heat", "Raggio", 60)}
      ${field("Sfocatura", "heat.blur", `type="number" min="0" max="60" step="1" value="${v.heat.blur}"`, "px")}
      ${field("Quantità di calore", "heat.max", `type="number" min="1" max="300" step="1" value="${v.heat.max}"`, "soglia di saturazione: più bassa = più caldo")}
      ${field("Opacità minima", "heat.minOpacity", `type="number" min="0" max="100" step="5" value="${v.heat.minOpacity}"`, "%")}
      ${field("Densità dei percorsi", "heat.step", `type="number" min="0" max="1000" step="10" value="${v.heat.step}"`, "un punto ogni N metri tra due fix; 0 = nessuno")}
      <label class="field"><span>Gradiente<small>colori dal meno al più frequentato</small></span>
        <select data-k="heat.preset" id="heat-preset">${presets}</select></label>
      <div class="colors">${v.heat.colors.map((c, i) => `<input type="color" data-k="heat.colors.${i}" value="${c}">`).join("")}</div>
      <div class="gradbar" id="gradbar"></div>
      <button class="secondary" data-reset="heat">Ripristina heatmap</button>`) +

    fold("sleep", "Notti", `
      ${presetBar("sleep")}
      <p class="hint">Una notte viene registrata se, tra queste ore (anche a cavallo della mezzanotte), ci sono almeno N punti entro il raggio scelto uno dall'altro. Il luogo è il centro di quei punti; le notti entro la distanza di unione (400 m) si contano nello stesso posto.</p>
      <label class="field"><span>Dalle</span><select data-k="sleep.from">${hours(v.sleep.from)}</select></label>
      <label class="field"><span>Alle</span><select data-k="sleep.to">${hours(v.sleep.to)}</select></label>
      ${field("Punti minimi", "sleep.minPts", `type="number" min="1" max="500" step="1" value="${v.sleep.minPts}"`, "entro il raggio, per registrare la notte")}
      ${field("Raggio", "sleep.radius", `type="number" min="20" max="5000" step="10" value="${v.sleep.radius}"`, "metri entro cui devono stare i punti")}
      <p class="hint">Parametri di prova (0 = disattivato):</p>
      ${field("Accuratezza massima", "sleep.accMax", `type="number" min="0" max="500" step="5" value="${v.sleep.accMax}"`, "metri: ignora i punti più imprecisi")}
      ${field("Durata minima", "sleep.minSpan", `type="number" min="0" max="720" step="10" value="${v.sleep.minSpan}"`, "minuti tra il primo e l'ultimo punto del gruppo")}
      ${field("Punti nella fascia centrale", "sleep.coreMin", `type="number" min="0" max="500" step="1" value="${v.sleep.coreMin}"`, "minimo di punti tra le due ore qui sotto")}
      <label class="field"><span>Fascia centrale dalle</span><select data-k="sleep.coreFrom">${hours(v.sleep.coreFrom)}</select></label>
      <label class="field"><span>Fascia centrale alle</span><select data-k="sleep.coreTo">${hours(v.sleep.coreTo)}</select></label>
      ${field("Unione dei luoghi", "sleep.merge", `type="number" min="50" max="3000" step="50" value="${v.sleep.merge}"`, "metri: notti più vicine contano nello stesso posto")}
      <button class="secondary" data-reset="sleep">Ripristina notti</button>`) +

    fold("nightslist", "Notti salvate", `<div id="saved-nights"></div>`) +

    fold("places", "Nomi dei posti", `
      <p class="hint">I nomi che hai dato tu hanno la precedenza su quelli di OpenStreetMap. Tocca un posto sulla mappa (vista Posti o Notti) e scegli Rinomina.</p>
      <div id="names-list"></div>
      <label class="field check"><span>Mostra i nomi di OpenStreetMap<small>cerca via e città su OpenStreetMap (Nominatim): invia al servizio le coordinate dei soli luoghi mostrati. Se spento vedi le coordinate.</small></span>
        <input data-k="names" type="checkbox" ${v.names ? "checked" : ""}></label>`) +

    fold("placeslist", "Posti salvati", `<div id="saved-places"></div>`);
  restoreFolds(document);
  paintGradbar();
  paintRoutePreview();
  buildNamesCard();
  if (window.paintFxPreview) setTimeout(paintFxPreview, 30);
  if (window.tuneRefresh) tuneRefresh();
}

// anteprima della linea dei percorsi con colore, spessore e opacità scelti
function paintRoutePreview() {
  const el = document.getElementById("routeprev"), r = Prefs.v.route;
  if (el) el.innerHTML = `<svg viewBox="0 0 240 36" preserveAspectRatio="none"><path d="M6 26 C 50 4, 90 34, 130 14 S 200 6, 234 22" fill="none" stroke="${r.color}" stroke-width="${Prefs.widthAt('route', r.zooms[1])}" stroke-opacity="${r.opacity / 100}" stroke-linecap="round"/></svg>`;
}

function paintGradbar() {
  [["gradbar", "heat"], ["routebar", "route"]].forEach(([id, g]) => {
    const el = document.getElementById(id);
    if (el) el.style.background = `linear-gradient(90deg, ${Prefs.v[g].colors.map((c, i) => `${c} ${Math.round(HEAT_STOPS[i] * 100)}%`).join(", ")})`;
  });
}

let prefsTimer = null;
function bindPrefsUI() {
  const root = document.getElementById("prefs-ui");
  if (!root) return;
  root.addEventListener("input", (e) => {
    const el = e.target, k = el.dataset.k;
    if (!k) return;
    let val = el.type === "checkbox" ? el.checked : el.type === "number" || el.type === "range" || el.tagName === "SELECT" && k.startsWith("sleep") ? +el.value : el.value;
    if (el.type === "number" && (el.value === "" || isNaN(val))) return;
    const grp = k.split(".")[0]; // heatmap e percorsi hanno lo stesso gradiente: preset e quattro colori
    if ((grp === "heat" || grp === "route") && k === grp + ".preset") {
      if (val !== "custom") {
        Prefs.v[grp].colors = [...HEAT_PRESETS[val]];
        root.querySelectorAll(`[data-k^="${grp}.colors."]`).forEach((c, i) => (c.value = Prefs.v[grp].colors[i]));
      }
    } else if ((grp === "heat" || grp === "route") && k.startsWith(grp + ".colors.")) {
      Prefs.v[grp].preset = "custom";
      document.getElementById(grp + "-preset").value = "custom";
    }
    setPath(Prefs.v, k, val);
    clearPresetSel(k);
    paintGradbar();
    paintRoutePreview();
    if (k.startsWith("mapFx.")) { fxLabels(root); if (window.applyMapFx) applyMapFx(); if (window.paintFxPreview) paintFxPreview(); }
    if (k === "outline") Prefs.applyTheme();
    if (k === "theme") { Prefs.applyTheme(); Native.setTheme(val); if (window.setBase) setBase(); if (window.paintFxPreview) paintFxPreview(); }
    if (k === "mapStyle" && window.setBase) { setBase(); if (window.paintFxPreview) paintFxPreview(); }
    Prefs.save();
    if (k.startsWith("mapFx.")) return; // i ritocchi si applicano subito alla mappa di base, senza ridisegnare i dati
    clearTimeout(prefsTimer);
    prefsTimer = setTimeout(() => Prefs.onChange && Prefs.onChange(k.split(".")[0]), 250);
  });
  root.addEventListener("change", (e) => { const g = e.target.dataset && e.target.dataset.psel; if (g) applyPreset(g, e.target.value); });
  root.addEventListener("click", (e) => {
    const t = e.target;
    if (t.dataset && t.dataset.psave) { savePreset(t.dataset.psave); return; }
    if (t.dataset && t.dataset.pdel) { deletePreset(t.dataset.pdel); return; }
    const g = e.target.dataset && e.target.dataset.reset;
    if (g) { Prefs.reset(g); buildPrefsUI(); Prefs.onChange && Prefs.onChange(g); }
    const del = e.target.closest && e.target.closest("[data-del]");
    if (del) { Names.removeAt(+del.dataset.del); refreshAfterNames(); }
  });
}

function buildNamesCard() {
  const el = document.getElementById("names-list");
  if (!el) return;
  const list = Names.list();
  el.innerHTML = list.length
    ? list.map((n, i) => `<div class="kv"><span class="nm">${esc(n.name)}</span><b>${n.lat.toFixed(3)}, ${n.lon.toFixed(3)}</b><button class="x" data-del="${i}" aria-label="Elimina">&#10005;</button></div>`).join("")
    : '<p class="msg">Nessun nome personalizzato.</p>';
}
