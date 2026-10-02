// Calcoli geografici condivisi da mappa e statistiche.

function km(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Tratti percorsi: coppie di punti consecutivi vicini nel tempo, abbastanza lunghi da non essere rumore GPS.
function* moveSteps(pts) {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], dt = b.ts - a.ts;
    if (dt <= 0 || dt > 20 * 60000) continue;
    const d = km(a, b);
    if (d < 0.01 || d > 30 || d / (dt / 3600000) > 250) continue;
    yield { ts: a.ts, d, dt };
  }
}

// ---------- griglia esagonale (scratch map) ----------
// Gli esagoni si descrivono con il diametro reale (da vertice a vertice) in metri. Il calcolo è nel piano "mercatore":
// sullo schermo gli esagoni risultano regolari e a 44,5° N le misure coincidono con quelle reali.
const HEX_K = 1 / Math.cos(44.5 * Math.PI / 180);
const SQ3 = Math.sqrt(3);
const hexS = (diam) => (diam / 2) * HEX_K;   // raggio in metri mercatore

function hexOf(lat, lon, S) {
  const p = L.CRS.EPSG3857.project(L.latLng(lat, lon));
  const fq = (SQ3 / 3 * p.x - p.y / 3) / S, fr = (2 / 3 * p.y) / S;
  let x = fq, z = fr, y = -x - z;
  let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
  const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
  if (dx > dy && dx > dz) rx = -ry - rz; else if (dy > dz) ry = -rx - rz; else rz = -rx - ry;
  return [rx, rz];
}

function hexCenter(q, r, S) {
  const ll = L.CRS.EPSG3857.unproject(L.point(S * SQ3 * (q + r / 2), S * 1.5 * r));
  return [ll.lat, ll.lng];
}

function hexCorners(q, r, S) {
  const cx = S * SQ3 * (q + r / 2), cy = S * 1.5 * r;
  const out = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i + 30);
    const ll = L.CRS.EPSG3857.unproject(L.point(cx + S * Math.cos(a), cy + S * Math.sin(a)));
    out.push([ll.lat, ll.lng]);
  }
  return out;
}

// Esagoni visitati. Tra due punti vicini nel tempo si "gratta" anche il tratto in mezzo (un passo per raggio), perché
// i dati hanno un punto ogni qualche minuto. Con `bounds` si considera solo la parte di mappa visibile (veloce a zoom vicino).
// Ritorna celle [q, r, lat, lon, primoTs], il raggio S e l'area totale in km².
function hexVisits(pts, diam, bounds) {
  const S = hexS(diam), cells = new Map(), step = diam / 2 / 1000;
  const so = bounds ? bounds.getSouth() : -90, no = bounds ? bounds.getNorth() : 90;
  const we = bounds ? bounds.getWest() : -180, ea = bounds ? bounds.getEast() : 180;
  const add = (la, lo, ts) => {
    const [q, r] = hexOf(la, lo, S), k = (q + 50000) * 100000 + (r + 50000);
    if (!cells.has(k)) cells.set(k, [q, r, 0, 0, ts]);
  };
  let prev = null;
  for (const p of pts) {
    if (prev && p.ts - prev.ts <= 20 * 60000 && !(Math.max(prev.lat, p.lat) < so || Math.min(prev.lat, p.lat) > no || Math.max(prev.lon, p.lon) < we || Math.min(prev.lon, p.lon) > ea)) {
      const d = km(prev, p);
      if (d > step * 1.5 && d < 60) {
        const n = Math.min(3000, Math.floor(d / step));
        for (let i = 1; i < n; i++) {
          const f = i / n;
          add(prev.lat + (p.lat - prev.lat) * f, prev.lon + (p.lon - prev.lon) * f, prev.ts + (p.ts - prev.ts) * f);
        }
      }
    }
    if (p.lat >= so && p.lat <= no && p.lon >= we && p.lon <= ea) add(p.lat, p.lon, p.ts);
    prev = p;
  }
  let area = 0;
  const list = [...cells.values()];
  list.forEach((c) => {
    const ctr = hexCenter(c[0], c[1], S);
    c[2] = ctr[0]; c[3] = ctr[1];
    const s = (S * Math.cos(c[2] * Math.PI / 180)) / 1000;
    area += 1.5 * SQ3 * s * s;
  });
  return { cells: list, area, S };
}

// ---------- durate lunghe ----------
// Oltre 365 giorni un conteggio si scrive in anni, mesi e giorni ("2 anni, 3 mesi e 12 giorni"), più leggibile di "812 giorni".
// Un anno è 365 giorni e un mese 365/12 (circa 30,4); le parti a zero si omettono.
function fmtSpan(n, one = "giorno", many = "giorni") {
  n = Math.round(n);
  const plain = (v, o, m) => `${v.toLocaleString("it-IT")} ${v === 1 ? o : m}`;
  if (n <= 365) return plain(n, one, many);
  const MESE = 365 / 12, y = Math.floor(n / 365), rest = n - y * 365;
  const mo = Math.floor(rest / MESE), d = Math.round(rest - mo * MESE);
  const parts = [plain(y, "anno", "anni")];
  if (mo) parts.push(plain(mo, "mese", "mesi"));
  if (d) parts.push(plain(d, one, many));
  return parts.length > 1 ? parts.slice(0, -1).join(", ") + " e " + parts[parts.length - 1] : parts[0];
}
// Come fmtSpan, ma sotto i 365 dà il solo numero (per le righe che hanno già l'unità nell'etichetta)
const fmtCount = (n, one, many) => (Math.round(n) <= 365 ? Math.round(n).toLocaleString("it-IT") : fmtSpan(n, one, many));
// Tempo trascorso in un posto, in ore (sotto 48 h), giorni, oppure anni e giorni
function fmtHoursLong(h) {
  if (h < 48) return h.toFixed(1) + " ore";
  const d = h / 24;
  return d > 365 ? fmtSpan(d) : d.toFixed(1) + " giorni";
}

// ---------- dove hai dormito ----------
// Una notte viene registrata se, nella finestra notturna (default 23:00–09:00, a cavallo della mezzanotte), ci sono almeno
// `minPts` punti (default 2) entro `radiusM` metri uno dall'altro. La notte porta la data della sera e il luogo è il centro del
// gruppo di punti più numeroso. Le notti vicine (entro 400 m) si raggruppano nello stesso posto.
// Finestra, punti minimi e raggio si regolano nelle impostazioni.
function sleepPlaces(pts, fromH, toH, minPts = 2, radiusM = 300, hidden = new Set()) {
  const inWin = (h) => (fromH <= toH ? h >= fromH && h < toH : h >= fromH || h < toH);
  const nights = new Map();
  for (const p of pts) {
    const d = new Date(p.ts), h = d.getHours();
    if (!inWin(h)) continue;
    if (fromH > toH && h < toH) d.setDate(d.getDate() - 1); // dopo la mezzanotte: è la notte iniziata la sera prima
    const k = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
    (nights.get(k) || nights.set(k, []).get(k)).push(p);
  }
  const r = radiusM / 1000, found = [];
  nights.forEach((all, key) => {
    if (all.length < minPts) return;
    const step = Math.ceil(all.length / 120), a = step > 1 ? all.filter((_, i) => i % step === 0) : all; // limita il lavoro nelle notti con molti punti
    let best = null;
    for (const p of a) {
      const g = a.filter((q) => km(p, q) <= r);
      if (!best || g.length > best.length) best = g;
    }
    if (!best || best.length < minPts) return;
    const lat = best.reduce((x, q) => x + q.lat, 0) / best.length, lon = best.reduce((x, q) => x + q.lon, 0) / best.length;
    found.push({ key, lat, lon, ts: best[0].ts });
  });
  const places = [];
  const shown = found.filter((n) => !hidden.has(n.key)); // le notti nascoste non contano ma restano nell'elenco
  for (const n of shown.sort((x, y) => x.ts - y.ts)) {
    let best = null, bd = 0.4;
    for (const pl of places) { const d = km(pl, n); if (d < bd) { bd = d; best = pl; } }
    if (!best) places.push(best = { lat: n.lat, lon: n.lon, nights: 0, first: n.ts, last: n.ts, sl: 0, so: 0, keys: [] });
    best.keys.push(n.key);
    best.nights++; best.sl += n.lat; best.so += n.lon;
    best.lat = best.sl / best.nights; best.lon = best.so / best.nights; best.last = n.ts;
  }
  // list: tutte le notti trovate (anche le nascoste), dalla più recente
  const list = [...found].sort((x, y) => y.ts - x.ts).map((n) => ({ ...n, hidden: hidden.has(n.key) }));
  return { places: places.sort((x, y) => y.nights - x.nights), nights: shown.length, list };
}

// ---------- posti visitati ----------
// Una visita è un periodo di almeno 20 minuti in cui i punti restano entro 150 m dal primo (con buchi di dati fino a 3 ore).
// Le visite vicine (entro 150 m) si raggruppano nello stesso posto. Ritorna i posti ordinati per tempo totale.
function visitEpisodes(pts) {
  const episodes = [];
  for (let i = 0; i < pts.length;) {
    const a = pts[i];
    let j = i + 1, sl = a.lat, so = a.lon;
    while (j < pts.length && pts[j].ts - pts[j - 1].ts <= 3 * 36e5 && km(a, pts[j]) < 0.15) { sl += pts[j].lat; so += pts[j].lon; j++; }
    const n = j - i, end = pts[j - 1].ts;
    if (end - a.ts >= 20 * 60000) episodes.push({ lat: sl / n, lon: so / n, start: a.ts, end });
    i = j;
  }
  return episodes; // soste singole in ordine di tempo: {lat, lon, start, end}
}
function visitPlaces(pts) {
  const episodes = visitEpisodes(pts);
  const grid = new Map(), places = [], CELL = 0.0015;
  const cellOf = (la, lo) => [Math.round(la / CELL), Math.round(lo / CELL)];
  for (const e of episodes) {
    const [cy, cx] = cellOf(e.lat, e.lon);
    let best = null, bd = 0.15;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      for (const pl of grid.get(`${cy + dy},${cx + dx}`) || []) { const d = km(pl, e); if (d < bd) { bd = d; best = pl; } }
    }
    if (!best) {
      places.push(best = { lat: e.lat, lon: e.lon, visits: 0, ms: 0, first: e.start, last: e.end, sl: 0, so: 0 });
      const k = `${cy},${cx}`;
      (grid.get(k) || grid.set(k, []).get(k)).push(best);
    }
    best.visits++; best.ms += e.end - e.start; best.sl += e.lat; best.so += e.lon;
    best.lat = best.sl / best.visits; best.lon = best.so / best.visits; best.last = e.end;
  }
  return places.sort((x, y) => y.ms - x.ms);
}

// ---------- spostamenti ----------
// Uno spostamento è il tragitto tra due soste consecutive (visitEpisodes: almeno 20 minuti fermo entro 150 m) in luoghi diversi
// (almeno 300 m) a meno di 12 ore l'una dall'altra. I km sono i passi tra i punti del tragitto (come moveSteps); se in mezzo non ci
// sono punti, la distanza in linea retta (approx). Dopo l'ultima sosta, se ci si è allontanati di più di 300 m, c'è uno spostamento
// senza arrivo (open): "in corso" se l'ultimo punto è recente. Ritorna gli spostamenti in ordine di tempo; i0 e i1 sono gli indici
// dei punti del tragitto in `pts`, che deve essere ordinato per tempo.
function computeTrips(pts) {
  const eps = visitEpisodes(pts), trips = [];
  const lb = (ts) => { let lo = 0, hi = pts.length; while (lo < hi) { const m = (lo + hi) >> 1; if (pts[m].ts < ts) lo = m + 1; else hi = m; } return lo; };
  const dist = (i0, i1) => { let d = 0; for (const s of moveSteps(pts.slice(i0, i1))) d += s.d; return d; };
  for (let i = 0; i + 1 < eps.length; i++) {
    const a = eps[i], b = eps[i + 1], gap = b.start - a.end;
    if (gap <= 0 || gap > 12 * 36e5 || km(a, b) < 0.3) continue;
    const i0 = lb(a.end), i1 = lb(b.start), d = i1 - i0 >= 2 ? dist(i0, i1) : 0;
    trips.push({ from: { lat: a.lat, lon: a.lon }, to: { lat: b.lat, lon: b.lon }, start: a.end, end: b.start, km: d || km(a, b), approx: !d, i0, i1 });
  }
  const last = eps[eps.length - 1], lastPt = pts[pts.length - 1];
  if (last && lastPt && lastPt.ts > last.end && km(last, lastPt) >= 0.3) {
    const i0 = lb(last.end), d = dist(i0, pts.length);
    trips.push({ from: { lat: last.lat, lon: last.lon }, to: { lat: lastPt.lat, lon: lastPt.lon }, start: last.end, end: lastPt.ts, km: d || km(last, lastPt), approx: !d, i0, i1: pts.length, open: true, ongoing: Date.now() - lastPt.ts < 30 * 60000 });
  }
  return trips;
}

// Posti visitati senza quelli nascosti dall'utente (un posto nascosto copre i posti entro 150 m)
function visiblePlaces(pts) {
  const all = visitPlaces(pts);
  return Prefs.v.hidden.places.length ? all.filter((p) => !Prefs.isPlaceHidden(p.lat, p.lon)) : all;
}

// ---------- soste ----------
// Il tempo tra due punti vicini (<150 m, <3 h) va alla cella di partenza (~200 m). Ritorna le prime n.
function topStays(pts, n) {
  const S = 0.002, cells = new Map();
  pts.forEach((p, i) => {
    const nx = pts[i + 1];
    if (!nx) return;
    const dt = nx.ts - p.ts;
    if (dt <= 0 || dt > 3 * 3600000 || km(p, nx) > 0.15) return;
    const key = Math.floor(p.lat / S) * 100000 + Math.floor(p.lon / S);
    const c = cells.get(key) || { ms: 0, lat: 0, lon: 0, w: 0, first: p.ts, last: p.ts };
    c.ms += dt; c.lat += p.lat * dt; c.lon += p.lon * dt; c.w += dt;
    c.first = Math.min(c.first, p.ts); c.last = Math.max(c.last, nx.ts);
    cells.set(key, c);
  });
  return [...cells.values()].filter((c) => c.ms >= 20 * 60000).sort((a, b) => b.ms - a.ms).slice(0, n)
    .map((c) => ({ lat: c.lat / c.w, lon: c.lon / c.w, ms: c.ms, first: c.first, last: c.last }));
}

// Toglie i punti a meno di `meters` dall'ultimo tenuto (soste, rumore GPS): stessa forma, molti meno vertici da disegnare.
// Un punto si tiene comunque se è passato più di `gapMs`, così le interruzioni del tracciato restano visibili.
function thin(pts, meters, gapMs) {
  const out = [];
  let last = null;
  for (const p of pts) {
    if (!last || p.ts - last.ts > gapMs || km(last, p) * 1000 >= meters) { out.push(p); last = p; }
  }
  return out;
}

// Toglie i fix inutilizzabili: accuratezza peggiore di 120 m (Wi-Fi, celle) e salti impossibili (>180 km/h per più di 300 m),
// che altrimenti disegnano righe lunghe chilometri e gonfiano i km. Dopo 3 scarti di fila il nuovo punto viene accettato.
function clean(pts) {
  const out = [];
  let last = null, bad = 0;
  for (const p of pts) {
    if (p.acc > 120) continue;
    if (last) {
      const h = (p.ts - last.ts) / 36e5, d = km(last, p);
      if (h > 0 && d > 0.3 && d / h > 180 && bad < 3) { bad++; continue; }
    }
    bad = 0; out.push(p); last = p;
  }
  return out;
}

const isStay = (p) => p.acc === -1; // visita di Google importata come punto ogni 30 minuti: serve per soste e notti, non per percorsi e heatmap
