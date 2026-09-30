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
// Il livello 0 ha esagoni larghi 200 m (raggio 100 m); ogni livello raddoppia il raggio. La dimensione dipende dallo zoom,
// così a mappa piena gli esagoni restano pochi e il disegno leggero. Le misure sono in metri "mercatore": sullo schermo
// gli esagoni risultano regolari e a 44,5° N coincidono con quelle reali.
const HEX_BASE_M = 100;
const HEX_K = 1 / Math.cos(44.5 * Math.PI / 180);
const SQ3 = Math.sqrt(3);
const hexSize = (level) => HEX_BASE_M * HEX_K * 2 ** level;

// Livello giusto per lo zoom attuale: esagoni di circa 26 px di raggio sullo schermo
function hexLevelFor(map) {
  const mpp = 156543 * Math.cos(map.getCenter().lat * Math.PI / 180) / 2 ** map.getZoom(); // metri reali per pixel
  return Math.max(0, Math.min(8, Math.ceil(Math.log2(Math.max(1, mpp * 26 / HEX_BASE_M)))));
}

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

// Esagoni visitati a un dato livello: celle [q, r, lat, lon, primoTs] e area totale in km²
function hexCells(pts, level) {
  const S = hexSize(level), cells = new Map();
  pts.forEach((p) => {
    const [q, r] = hexOf(p.lat, p.lon, S), k = (q + 50000) * 100000 + (r + 50000);
    if (!cells.has(k)) cells.set(k, [q, r, p.lat, 0, p.ts]);
  });
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
