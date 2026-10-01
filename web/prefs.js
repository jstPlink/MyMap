// Preferenze dell'utente (salvate nel telefono): dimensione degli esagoni per zoom, heatmap, notti, nomi dei luoghi.
const ZMIN = 5, ZMAX = 17;
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

function prefDefaults() {
  const hex = {};
  for (let z = ZMIN; z <= ZMAX; z++) hex[z] = defaultHexDiam(z);
  return {
    hex,
    heat: { radius: 9, blur: 12, max: 30, minOpacity: 35, step: 100, preset: "classico", colors: [...HEAT_PRESETS.classico] },
    sleep: { from: 1, to: 5, minPts: 3, radius: 300 },
    names: true,
  };
}

const Prefs = {
  v: prefDefaults(),
  onChange: null, // (gruppo) => void, impostato da app.js
  load() {
    try {
      const saved = JSON.parse(localStorage.getItem("mymap.prefs") || "{}"), d = prefDefaults();
      this.v = { hex: { ...d.hex, ...saved.hex }, heat: { ...d.heat, ...saved.heat }, sleep: { ...d.sleep, ...saved.sleep }, names: saved.names ?? d.names };
    } catch { this.v = prefDefaults(); }
  },
  save() { try { localStorage.setItem("mymap.prefs", JSON.stringify(this.v)); } catch {} },
  hexDiam(zoom) { return Math.max(20, +this.v.hex[Math.max(ZMIN, Math.min(ZMAX, Math.round(zoom)))] || 100); },
  heatGradient() { const g = {}; this.v.heat.colors.forEach((c, i) => (g[HEAT_STOPS[i]] = c)); return g; },
  reset(group) { const d = prefDefaults(); this.v[group] = d[group]; this.save(); },
};
Prefs.load();

// ---------- schermata delle impostazioni ----------
const fmtM = (m) => (m >= 1000 ? `${(m / 1000).toLocaleString("it-IT", { maximumFractionDigits: 1 })} km` : `${m} m`);
const setPath = (o, path, val) => { const k = path.split("."); const last = k.pop(); k.reduce((a, b) => a[b], o)[last] = val; };

function field(label, k, attrs, hint) {
  return `<label class="field"><span>${label}${hint ? `<small>${hint}</small>` : ""}</span><input data-k="${k}" ${attrs}></label>`;
}

function buildPrefsUI() {
  const root = document.getElementById("prefs-ui");
  if (!root) return;
  const v = Prefs.v;
  const hexRows = Object.keys(v.hex).map((z) =>
    `<label class="zrow"><span>Zoom ${z}${+z === ZMAX ? "+" : +z === ZMIN ? "−" : ""}</span><input data-k="hex.${z}" type="number" min="20" step="10" value="${v.hex[z]}"><em>m</em></label>`).join("");
  const presets = Object.keys(HEAT_PRESETS).map((p) => `<option value="${p}" ${v.heat.preset === p ? "selected" : ""}>${p[0].toUpperCase() + p.slice(1)}</option>`).join("") +
    `<option value="custom" ${v.heat.preset === "custom" ? "selected" : ""}>Personalizzato</option>`;
  const hours = (sel) => Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${h === sel ? "selected" : ""}>${String(h).padStart(2, "0")}:00</option>`).join("");

  root.innerHTML = `
    <div class="card"><h2>Scratch map · esagoni</h2>
      <p class="hint">Diametro dell'esagono (da vertice a vertice) per ogni livello di zoom. Più lo zoom è lontano, più gli esagoni crescono per non appesantire la mappa. Il minimo consigliato è 100 m.</p>
      <div class="zgrid">${hexRows}</div>
      <button class="secondary" data-reset="hex">Ripristina dimensioni</button>
    </div>

    <div class="card"><h2>Heatmap</h2>
      ${field("Raggio", "heat.radius", `type="number" min="2" max="60" step="1" value="${v.heat.radius}"`, "px di ogni punto")}
      ${field("Sfocatura", "heat.blur", `type="number" min="0" max="60" step="1" value="${v.heat.blur}"`, "px")}
      ${field("Quantità di calore", "heat.max", `type="number" min="1" max="300" step="1" value="${v.heat.max}"`, "soglia di saturazione: più bassa = più caldo")}
      ${field("Opacità minima", "heat.minOpacity", `type="number" min="0" max="100" step="5" value="${v.heat.minOpacity}"`, "%")}
      ${field("Densità dei percorsi", "heat.step", `type="number" min="0" max="1000" step="10" value="${v.heat.step}"`, "un punto ogni N metri tra due fix; 0 = nessuno")}
      <label class="field"><span>Gradiente<small>colori dal meno al più frequentato</small></span>
        <select data-k="heat.preset" id="heat-preset">${presets}</select></label>
      <div class="colors">${v.heat.colors.map((c, i) => `<input type="color" data-k="heat.colors.${i}" value="${c}">`).join("")}</div>
      <div class="gradbar" id="gradbar"></div>
      <button class="secondary" data-reset="heat">Ripristina heatmap</button>
    </div>

    <div class="card"><h2>Notti</h2>
      <p class="hint">Una notte conta come dormita in un posto se, tra queste ore, ci sono almeno N punti che coprono metà della finestra e l'80% di quei punti sta entro il raggio scelto dalla loro posizione media (eri fermo, non in viaggio). Le notti entro 400 m si contano nello stesso posto.</p>
      <label class="field"><span>Dalle</span><select data-k="sleep.from">${hours(v.sleep.from)}</select></label>
      <label class="field"><span>Alle</span><select data-k="sleep.to">${hours(v.sleep.to)}</select></label>
      ${field("Punti minimi", "sleep.minPts", `type="number" min="1" max="500" step="1" value="${v.sleep.minPts}"`, "per contare la notte")}
      ${field("Raggio massimo", "sleep.radius", `type="number" min="20" max="5000" step="10" value="${v.sleep.radius}"`, "metri di movimento ammessi")}
      <button class="secondary" data-reset="sleep">Ripristina notti</button>
    </div>

    <div class="card"><h2>Nomi dei posti</h2>
      <p class="hint">I nomi che hai dato tu hanno la precedenza su quelli di OpenStreetMap. Tocca un posto sulla mappa (vista Posti o Notti) e scegli Rinomina.</p>
      <div id="names-list"></div>
    </div>

    <div class="card"><h2>Nomi dei luoghi</h2>
      <label class="field check"><span>Mostra i nomi<small>cerca via e città su OpenStreetMap (Nominatim): invia al servizio le coordinate dei soli luoghi mostrati. Se spento vedi le coordinate.</small></span>
        <input data-k="names" type="checkbox" ${v.names ? "checked" : ""}></label>
    </div>

    <div class="card"><h2>Dati</h2>
      <button class="secondary" id="repull">Riscarica lo storico dal server</button>
      <p class="msg" id="repull-msg"></p>
    </div>`;
  paintGradbar();
  buildNamesCard();
}

function paintGradbar() {
  const el = document.getElementById("gradbar");
  if (el) el.style.background = `linear-gradient(90deg, ${Prefs.v.heat.colors.map((c, i) => `${c} ${Math.round(HEAT_STOPS[i] * 100)}%`).join(", ")})`;
}

let prefsTimer = null;
function bindPrefsUI() {
  const root = document.getElementById("prefs-ui");
  if (!root) return;
  root.addEventListener("input", (e) => {
    const el = e.target, k = el.dataset.k;
    if (!k) return;
    let val = el.type === "checkbox" ? el.checked : el.type === "number" || el.tagName === "SELECT" && k.startsWith("sleep") ? +el.value : el.value;
    if (el.type === "number" && (el.value === "" || isNaN(val))) return;
    if (k === "heat.preset") {
      if (val !== "custom") {
        Prefs.v.heat.colors = [...HEAT_PRESETS[val]];
        root.querySelectorAll('[data-k^="heat.colors."]').forEach((c, i) => (c.value = Prefs.v.heat.colors[i]));
      }
    } else if (k.startsWith("heat.colors.")) {
      Prefs.v.heat.preset = "custom";
      document.getElementById("heat-preset").value = "custom";
    }
    setPath(Prefs.v, k, val);
    paintGradbar();
    Prefs.save();
    clearTimeout(prefsTimer);
    prefsTimer = setTimeout(() => Prefs.onChange && Prefs.onChange(k.split(".")[0]), 250);
  });
  root.addEventListener("click", (e) => {
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
