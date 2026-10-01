// Nomi dei luoghi al posto delle coordinate: geocodifica inversa con OpenStreetMap (Nominatim), una richiesta alla volta,
// con cache nel telefono. Si cercano solo i luoghi che l'interfaccia sta mostrando; con "Nomi dei luoghi" spento restano le coordinate.
const Places = (() => {
  let cache = {};
  try { cache = JSON.parse(localStorage.getItem("mymap.places") || "{}"); } catch {}
  const save = () => { try { localStorage.setItem("mymap.places", JSON.stringify(cache)); } catch {} };
  const key = (lat, lon) => `${lat.toFixed(3)},${lon.toFixed(3)}`; // ~100 m
  let chain = Promise.resolve();

  function nameOf(j) {
    const a = j.address || {};
    const town = a.city || a.town || a.village || a.hamlet || a.municipality || a.county || "";
    const spot = a.road || a.pedestrian || a.neighbourhood || a.suburb || a.leisure || a.amenity || a.tourism || "";
    const full = [spot, town].filter(Boolean).join(", ");
    return full || (j.display_name || "").split(",").slice(0, 2).join(",").trim();
  }

  function lookup(lat, lon) {
    const k = key(lat, lon);
    if (cache[k]) return Promise.resolve(cache[k]);
    chain = chain.then(async () => {
      if (cache[k]) return cache[k];
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=16&accept-language=it&lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}`);
        if (r.ok) { const n = nameOf(await r.json()); if (n) { cache[k] = n; save(); } }
      } catch {}
      await new Promise((res) => setTimeout(res, 1100)); // il servizio accetta al massimo una richiesta al secondo
      return cache[k] || null;
    });
    return chain;
  }

  return { key, cached: (lat, lon) => cache[key(lat, lon)] || null, lookup };
})();

// Nomi dati dall'utente: hanno la precedenza su quelli di OpenStreetMap. Un nome vale per tutti i punti entro 120 m.
const Names = (() => {
  let list = [], skipped = [];
  try { list = JSON.parse(localStorage.getItem("mymap.names") || "[]"); skipped = JSON.parse(localStorage.getItem("mymap.skipped") || "[]"); } catch {}
  let onSave = null;
  const save = () => { try { localStorage.setItem("mymap.names", JSON.stringify(list)); localStorage.setItem("mymap.skipped", JSON.stringify(skipped)); } catch {} if (onSave) onSave(); };
  const R = 0.12;
  const near = (arr, lat, lon) => { let best = null, bd = R; arr.forEach((n) => { const d = km(n, { lat, lon }); if (d < bd) { bd = d; best = n; } }); return best; };
  return {
    list: () => list,
    setOnSave: (f) => { onSave = f; },
    snapshot: () => ({ list, skipped }),
    adopt(o) { list = Array.isArray(o.list) ? o.list : []; skipped = Array.isArray(o.skipped) ? o.skipped : []; try { localStorage.setItem("mymap.names", JSON.stringify(list)); localStorage.setItem("mymap.skipped", JSON.stringify(skipped)); } catch {} },
    find: (lat, lon) => near(list, lat, lon),
    set(lat, lon, name) {
      const cur = near(list, lat, lon);
      if (!name) { if (cur) list.splice(list.indexOf(cur), 1); }
      else if (cur) cur.name = name;
      else list.push({ lat, lon, name });
      save();
    },
    removeAt(i) { list.splice(i, 1); save(); },
    isSkipped: (lat, lon) => !!near(skipped, lat, lon),
    skip(lat, lon) { if (!near(skipped, lat, lon)) skipped.push({ lat, lon }); save(); },
  };
})();

const coords = (lat, lon) => `${lat.toFixed(3)}, ${lon.toFixed(3)}`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Segnaposto da usare nell'HTML: mostra subito il nome in cache o le coordinate, poi hydratePlaces() cerca i mancanti
function placeSpan(lat, lon) {
  const mine = Names.find(lat, lon); // il nome scelto dall'utente vince su tutto
  if (mine) return `<span data-custom="1">${esc(mine.name)}</span>`;
  const known = Prefs.v.names ? Places.cached(lat, lon) : null;
  return `<span data-place="${lat.toFixed(5)},${lon.toFixed(5)}">${esc(known || coords(lat, lon))}</span>`;
}

async function hydratePlaces(root) {
  if (!Prefs.v.names) return;
  for (const el of root.querySelectorAll("[data-place]")) {
    const [lat, lon] = el.dataset.place.split(",").map(Number);
    if (Places.cached(lat, lon)) continue;
    const name = await Places.lookup(lat, lon);
    if (name && el.isConnected) el.textContent = name;
  }
}
