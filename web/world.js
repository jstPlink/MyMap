// Stati visitati: i confini (web/countries-data.js, Natural Earth 1:50m) si caricano solo quando servono; poi ogni punto si assegna
// al paese in cui cade (punto in poligono, con i buchi: Lesotho, San Marino, Vaticano). Tutto offline, niente servizi esterni.
const World = (() => {
  // I 193 stati membri dell'ONU più Vaticano e Palestina: è il totale per la percentuale. I territori (Groenlandia, Porto Rico…) e le aree
  // senza codice (Kosovo…) si elencano a parte e non contano nella percentuale.
  const SOVEREIGN = new Set(("AF AL DZ AD AO AG AR AM AU AT AZ BS BH BD BB BY BE BZ BJ BT BO BA BW BR BN BG BF BI CV KH CM CA CF TD CL CN CO KM CG CD CR CI HR CU CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FJ FI FR GA GM GE DE GH GR GD GT GN GW GY HT HN HU IS IN ID IR IQ IE IL IT JM JP JO KZ KE KI KP KR KW KG LA LV LB LS LR LY LI LT LU MG MW MY MV ML MT MH MR MU MX FM MD MC MN ME MA MZ MM NA NR NP NL NZ NI NE NG MK NO OM PK PW PA PG PY PE PH PL PT QA RO RU RW KN LC VC WS SM ST SA SN RS SC SL SG SK SI SB SO ZA SS ES LK SD SR SE CH SY TJ TZ TH TL TG TO TT TN TR TM TV UG UA AE GB US UY UZ VU VE VN YE ZM ZW VA PS").split(" "));
  const CELL = 0.02;       // gradi (~2 km): i punti si raggruppano in celle e si controlla il centro della cella
  const MIN_POINTS = 3;    // punti minimi per dire "visitato": scarta un fix isolato vicino a un confine
  const MAX_KMH = 400;     // più veloce = aereo: si ignora, altrimenti ogni paese sorvolato risulterebbe visitato
  let feats = null, loading = null;
  const cellCountry = new Map(); // cella -> indice del paese (-1 = nessuno), si ricorda tra un calcolo e l'altro

  function decode(topo) {
    const { scale, translate } = topo.transform;
    const arcs = topo.arcs.map((a) => { let x = 0, y = 0; return a.map(([dx, dy]) => [(x += dx) * scale[0] + translate[0], (y += dy) * scale[1] + translate[1]]); });
    const ring = (idxs) => {
      const out = [];
      for (const i of idxs) { const a = i < 0 ? arcs[~i].slice().reverse() : arcs[i]; out.push(...(out.length ? a.slice(1) : a)); }
      return out;
    };
    const poly = (rings) => {
      const rs = rings.map(ring), b = [Infinity, Infinity, -Infinity, -Infinity];
      for (const [x, y] of rs[0]) { if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y; }
      return { rings: rs, b };
    };
    return topo.objects.countries.geometries.map((g) => ({
      name: g.properties.n, a2: g.properties.a || "",
      polys: g.type === "Polygon" ? [poly(g.arcs)] : g.arcs.map(poly),
    }));
  }

  function load() {
    if (feats) return Promise.resolve(feats);
    if (!loading) {
      loading = new Promise((res, rej) => {
        const s = document.createElement("script");
        s.src = "countries-data.js";
        s.onload = () => { feats = decode(window.COUNTRIES_TOPO); window.COUNTRIES_TOPO = null; res(feats); };
        s.onerror = () => { loading = null; rej(new Error("confini dei paesi non disponibili")); };
        document.head.appendChild(s);
      });
    }
    return loading;
  }

  function inRing(r, x, y) {
    let c = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  }
  function countryAt(lon, lat) {
    for (let k = 0; k < feats.length; k++) {
      for (const p of feats[k].polys) {
        if (lon < p.b[0] || lon > p.b[2] || lat < p.b[1] || lat > p.b[3]) continue;
        if (inRing(p.rings[0], lon, lat) && !p.rings.slice(1).some((h) => inRing(h, lon, lat))) return k;
      }
    }
    return -1;
  }

  // Nome in italiano dal codice ISO (con il nome inglese come ripiego) e bandiera
  const names = typeof Intl !== "undefined" && Intl.DisplayNames ? new Intl.DisplayNames(["it"], { type: "region" }) : null;
  const nameOf = (f) => { try { return (f.a2 && names && names.of(f.a2)) || f.name; } catch { return f.name; } };
  const flagOf = (a2) => (a2 && a2.length === 2 ? String.fromCodePoint(...[...a2].map((c) => 127397 + c.charCodeAt(0))) : "");

  // Paesi toccati dai punti `pts` (in ordine di tempo): stati sovrani e altre aree, con numero di punti e primo/ultimo passaggio
  function visited(pts) {
    const cells = new Map();
    let prev = null;
    for (const p of pts) {
      if (prev && p.ts > prev.ts && p.ts - prev.ts <= 20 * 60000 && km(prev, p) / ((p.ts - prev.ts) / 36e5) > MAX_KMH) { prev = p; continue; }
      prev = p;
      const cx = Math.round(p.lon / CELL), cy = Math.round(p.lat / CELL), k = cx * 100000 + cy;
      const c = cells.get(k);
      if (c) { c.n++; if (p.ts < c.first) c.first = p.ts; if (p.ts > c.last) c.last = p.ts; }
      else cells.set(k, { cx, cy, lat: p.lat, lon: p.lon, n: 1, first: p.ts, last: p.ts });
    }
    const byCountry = new Map();
    for (const [k, c] of cells) {
      let idx = cellCountry.get(k);
      if (idx === undefined) {
        // le città sul mare (New York, Istanbul…) in confini semplificati possono cadere in acqua: si prova il punto reale della cella,
        // poi il centro e quattro punti a ~1 km di distanza, e vale il primo che cade in un paese
        const h = CELL / 2, cx = c.cx * CELL, cy = c.cy * CELL;
        idx = -1;
        for (const [x, y] of [[c.lon, c.lat], [cx, cy], [c.lon + h, c.lat], [c.lon - h, c.lat], [c.lon, c.lat + h], [c.lon, c.lat - h]]) {
          idx = countryAt(x, y);
          if (idx >= 0) break;
        }
        cellCountry.set(k, idx);
      }
      if (idx < 0) continue;
      const e = byCountry.get(idx) || byCountry.set(idx, { n: 0, first: Infinity, last: 0 }).get(idx);
      e.n += c.n; if (c.first < e.first) e.first = c.first; if (c.last > e.last) e.last = c.last;
    }
    const states = [], others = [];
    byCountry.forEach((e, idx) => {
      if (e.n < MIN_POINTS) return;
      const f = feats[idx], item = { name: nameOf(f), flag: flagOf(f.a2), a2: f.a2, n: e.n, first: e.first, last: e.last };
      (SOVEREIGN.has(f.a2) ? states : others).push(item);
    });
    const byName = (a, b) => a.name.localeCompare(b.name, "it");
    states.sort(byName); others.sort(byName);
    const total = SOVEREIGN.size, pct = (states.length / total) * 100;
    return { states, others, count: states.length, total, pct, pctText: pct.toLocaleString("it-IT", { maximumFractionDigits: pct < 10 ? 1 : 0 }) + "%" };
  }

  return { load, ready: () => !!feats, visited, total: SOVEREIGN.size };
})();
