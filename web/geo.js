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
    yield { ts: a.ts, d };
  }
}

// ---------- griglia esagonale (scratch map) ----------
// Raggio in metri "mercatore": a 45° N sono circa 300 m reali, e sullo schermo gli esagoni risultano regolari.
const HEX_S = 420;
const SQ3 = Math.sqrt(3);

function hexOf(lat, lon) {
  const p = L.CRS.EPSG3857.project(L.latLng(lat, lon));
  const fq = (SQ3 / 3 * p.x - p.y / 3) / HEX_S, fr = (2 / 3 * p.y) / HEX_S;
  let x = fq, z = fr, y = -x - z;
  let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
  const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
  if (dx > dy && dx > dz) rx = -ry - rz; else if (dy > dz) ry = -rx - rz; else rz = -rx - ry;
  return [rx, rz];
}

function hexCorners(q, r) {
  const cx = HEX_S * SQ3 * (q + r / 2), cy = HEX_S * 1.5 * r;
  const out = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i + 30);
    const ll = L.CRS.EPSG3857.unproject(L.point(cx + HEX_S * Math.cos(a), cy + HEX_S * Math.sin(a)));
    out.push([ll.lat, ll.lng]);
  }
  return out;
}

// Esagoni visitati (Map chiave -> [q, r]) e area totale in km² (raggio reale ≈ HEX_S·cos(lat))
function hexCells(pts) {
  const cells = new Map();
  pts.forEach((p) => {
    const [q, r] = hexOf(p.lat, p.lon);
    cells.set((q + 50000) * 100000 + (r + 50000), [q, r, p.lat]);
  });
  let area = 0;
  cells.forEach(([, , lat]) => {
    const s = (HEX_S * Math.cos(lat * Math.PI / 180)) / 1000;
    area += 1.5 * SQ3 * s * s;
  });
  return { cells: [...cells.values()], area };
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
