// Scheda Statistiche: calcolata sui punti (tutti, senza filtri). Dentro l'HTML finiscono solo numeri, date e nomi già filtrati (esc).
const MESI = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
const GIORNI = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
const GIORNI_LUNGHI = ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"];
const STAGIONI = ["Inverno", "Primavera", "Estate", "Autunno"];

const fmt1 = (n) => n.toLocaleString("it-IT", { maximumFractionDigits: 1 });
const fmt0 = (n) => Math.round(n).toLocaleString("it-IT");
const fmtData = (ts) => new Date(ts).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
const fmtDataBreve = (ts) => new Date(ts).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit" });
const dkey = (ts) => { const d = new Date(ts); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); };
const dkeyTs = (k) => new Date(Math.floor(k / 10000), Math.floor(k / 100) % 100 - 1, k % 100, 12).getTime();
const epochDay = (ts) => { const d = new Date(ts); return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5); };
const season = (m) => [0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 0][m];
const argmax = (a) => a.indexOf(Math.max(...a));

// Estremo "tondo" per l'asse verticale: 1, 2, 2,5, 5 o 10 per una potenza di dieci
function niceMax(v) {
  if (v <= 0) return 1;
  const e = 10 ** Math.floor(Math.log10(v)), f = v / e;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e;
}
const compact = (n) => (n >= 1000 ? `${(n / 1000).toLocaleString("it-IT", { maximumFractionDigits: 1 })}k` : n.toLocaleString("it-IT", { maximumFractionDigits: n < 10 ? 1 : 0 }));

// Grafico a barre con asse verticale (massimo, metà e zero) e unità di misura
function bars(labels, values, unit) {
  const top = niceMax(Math.max(...values, 1e-9));
  return `<div class="chart"><div class="yax"><span>${compact(top)}</span><span>${compact(top / 2)}</span><span>0</span></div>
    <div class="plot"><div class="grid"></div><div class="bars">${values.map((v, i) =>
    `<div class="bar" title="${labels[i]}: ${fmt1(v)} ${unit}"><div class="col"><i style="height:${Math.max(1.5, v / top * 100)}%"></i></div><b>${labels[i]}</b></div>`).join("")}</div></div></div>
    <div class="unit">${unit}</div>`;
}
const dur = (ms) => (ms >= 48 * 36e5 ? `${fmt1(ms / 864e5)} giorni` : `${fmt0(ms / 36e5)} ore`);
const tile = (big, label, small, id) => `<div class="tile"><b${id ? ` id="${id}"` : ""}>${big}</b><span>${label}</span>${small ? `<small>${small}</small>` : ""}</div>`;

// Riga etichetta/valore su una sola riga. Con `go` (lat, lon) la riga si tocca per aprire quel posto sulla mappa.
const row = (k, v, go) => `<div class="kv${go ? " go" : ""}"${go ? ` data-go="${go[0].toFixed(5)},${go[1].toFixed(5)}"` : ""}><span>${k}</span><b>${v}</b></div>`;
// Classifica: nome (o coordinate) a sinistra su una riga, valore a destra
const rank = (items) => `<ul class="rank">${items.map((it, i) =>
  `<li${it[2] ? ` class="go" data-go="${it[2][0].toFixed(5)},${it[2][1].toFixed(5)}"` : ""}><i>${i + 1}</i><em>${it[0]}</em><b>${it[1]}</b></li>`).join("")}</ul>`;

function renderStats(pts, periodo) {
  const el = document.getElementById("stats");
  if (!pts.length) { el.innerHTML = '<div class="card"><p>Ancora nessun punto registrato.</p></div>'; return; }

  // ---- distanze e tempi in movimento ----
  const byDay = new Map(), byMonth = new Map(), byYear = new Map();
  const hourKm = Array(24).fill(0), dowKm = Array(7).fill(0), seasonKm = Array(4).fill(0);
  let total = 0, movingMs = 0, weekendKm = 0;
  for (const s of moveSteps(pts)) {
    const d = new Date(s.ts), k = dkey(s.ts), mk = d.getFullYear() * 100 + d.getMonth(), dow = (d.getDay() + 6) % 7;
    total += s.d; movingMs += s.dt;
    byDay.set(k, (byDay.get(k) || 0) + s.d);
    byMonth.set(mk, (byMonth.get(mk) || 0) + s.d);
    byYear.set(d.getFullYear(), (byYear.get(d.getFullYear()) || 0) + s.d);
    hourKm[d.getHours()] += s.d; dowKm[dow] += s.d; seasonKm[season(d.getMonth())] += s.d;
    if (dow >= 5) weekendKm += s.d;
  }
  const avgSpeed = movingMs ? total / (movingMs / 36e5) : 0;

  // ---- giorni con dati e serie consecutiva ----
  const days = [...new Set(pts.map((p) => epochDay(p.ts)))].sort((a, b) => a - b);
  let streak = 1, bestStreak = 1, bestEnd = days[0];
  for (let i = 1; i < days.length; i++) {
    streak = days[i] === days[i - 1] + 1 ? streak + 1 : 1;
    if (streak > bestStreak) { bestStreak = streak; bestEnd = days[i]; }
  }

  // ---- notti, casa, lontananza, estremi ----
  const sleep = sleepPlaces(pts, Prefs.v.sleep.from, Prefs.v.sleep.to, Prefs.v.sleep.minPts, Prefs.v.sleep.radius);
  const stays = topStays(pts, 5);
  const home = sleep.places[0] || stays[0];
  const nearHome = (p) => home && km(home, p) < 0.4;
  const maxFromHome = new Map();
  let far = { d: 0, p: null };
  let N = pts[0], S = pts[0], E = pts[0], W = pts[0];
  pts.forEach((p) => {
    if (p.lat > N.lat) N = p; if (p.lat < S.lat) S = p; if (p.lon > E.lon) E = p; if (p.lon < W.lon) W = p;
    if (!home) return;
    const d = km(home, p), k = dkey(p.ts);
    if (d > (maxFromHome.get(k) || 0)) maxFromHome.set(k, d);
    if (d > far.d) far = { d, p };
  });
  let daysHome = 0, daysAway50 = 0, daysAway200 = 0;
  maxFromHome.forEach((d) => { if (d < 1) daysHome++; if (d > 50) daysAway50++; if (d > 200) daysAway200++; });
  const nightsAway = sleep.nights - (sleep.places[0] ? sleep.places[0].nights : 0);

  const visited = visitPlaces(pts);

  // ---- zone nuove per mese (esagoni da 800 m, interpolati) ----
  const z8 = hexVisits(pts, 800);
  const newByMonth = new Map();
  z8.cells.forEach((c) => { const d = new Date(c[4]), k = d.getFullYear() * 100 + d.getMonth(); newByMonth.set(k, (newByMonth.get(k) || 0) + 1); });

  // ---- classifiche ----
  const topDays = [...byDay.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const months = [...byMonth.keys()].sort((a, b) => a - b).slice(-12);
  const newMonths = [...newByMonth.keys()].sort((a, b) => a - b).slice(-12);
  const years = [...byYear.keys()].sort();
  const bestMonth = [...byMonth.entries()].sort((a, b) => b[1] - a[1])[0];
  const movingDays = [...byDay.values()].filter((v) => v >= 1).length;
  const first = pts[0].ts, last = pts[pts.length - 1].ts;
  const at = (p) => [p.lat, p.lon];
  const place = (p) => placeSpan(p.lat, p.lon);
  const tag = (p) => (nearHome(p) ? ' <small class="tag">casa</small>' : "");

  el.innerHTML = `
    ${periodo ? `<p class="period">Statistiche di <b>${esc(periodo)}</b></p>` : ""}
    <div class="tiles">
      ${tile(fmt0(total), "km percorsi", `${fmt0(days.length)} giorni con dati`)}
      ${tile(fmt1(total / 40075), "giri della Terra", `${fmt1(total / 384400 * 100)}% verso la Luna`)}
      ${tile(fmt1(avgSpeed), "km/h di media", "solo in movimento")}
      ${tile("…", "km² grattati", "esagoni da 100 m", "t-area")}
    </div>

    <div class="card"><h2>Panoramica</h2>
      ${row("Punti registrati", fmt0(pts.length))}
      ${row("Periodo", `${fmtDataBreve(first)} → ${fmtDataBreve(last)}`)}
      ${row("Giorni in movimento", `${fmt0(movingDays)} su ${fmt0(days.length)}`)}
      ${row("Media giorni attivi", `${fmt1(movingDays ? total / movingDays : 0)} km`)}
      ${row("Tempo in movimento", dur(movingMs))}
      ${row("Serie di giorni con dati", `${bestStreak} → ${fmtDataBreve(bestEnd * 864e5 + 12 * 36e5)}`)}
    </div>

    <div class="card"><h2>Dove hai dormito</h2>
      ${row("Notti rilevate", fmt0(sleep.nights))}
      ${row("Luoghi diversi", fmt0(sleep.places.length))}
      ${row("Notti fuori casa", fmt0(Math.max(0, nightsAway)))}
      ${sleep.places.length ? rank(sleep.places.slice(0, 5).map((p, i) => [place(p) + (i === 0 ? ' <small class="tag">casa</small>' : ""), `${fmt0(p.nights)} notti`, at(p)])) : ""}
    </div>

    <div class="card"><h2>I 10 giorni più lunghi</h2>
      ${rank(topDays.map(([k, v]) => [fmtData(dkeyTs(k)), `${fmt0(v)} km`]))}
    </div>

    <div class="card"><h2>Dove passi più tempo</h2>
      ${rank(stays.map((s) => [place(s) + tag(s), dur(s.ms), at(s)]))}
    </div>

    <div class="card"><h2>Posti visitati</h2>
      ${row("Posti diversi", fmt0(visited.length))}
      ${row("Visite in totale", fmt0(visited.reduce((a, p) => a + p.visits, 0)))}
      <h3>I più frequentati</h3>
      ${rank([...visited].sort((x, y) => y.visits - x.visits).slice(0, 5).map((p) => [place(p) + tag(p), `${fmt0(p.visits)} visite`, at(p)]))}
    </div>

    <div class="card"><h2>Casa e lontananza</h2>
      ${home ? row("Casa", place(home), at(home)) : ""}
      ${row("Giorni a casa (< 1 km)", fmt0(daysHome))}
      ${row("Giorni a più di 50 km", fmt0(daysAway50))}
      ${row("Giorni a più di 200 km", fmt0(daysAway200))}
      ${far.p ? row("Punto più lontano", `${fmt0(far.d)} km`, at(far.p)) : ""}
      ${far.p ? row("&nbsp;", `${place(far.p)} · ${fmtDataBreve(far.p.ts)}`, at(far.p)) : ""}
    </div>

    <div class="card"><h2>Estremi raggiunti</h2>
      ${row("Più a nord", place(N), at(N))}
      ${row("Più a sud", place(S), at(S))}
      ${row("Più a est", place(E), at(E))}
      ${row("Più a ovest", place(W), at(W))}
    </div>

    <div class="card"><h2>Km per mese</h2>${bars(months.map((m) => MESI[m % 100].slice(0, 3)), months.map((m) => byMonth.get(m)), "km")}
      ${bestMonth ? `<p class="msg">Mese più attivo: ${MESI[bestMonth[0] % 100]} ${Math.floor(bestMonth[0] / 100)} · ${fmt0(bestMonth[1])} km</p>` : ""}</div>

    <div class="card"><h2>Zone nuove per mese</h2>
      ${bars(newMonths.map((m) => MESI[m % 100].slice(0, 3)), newMonths.map((m) => newByMonth.get(m)), "zone da 800 m")}
      <p class="msg">Zone da 800 m mai viste prima · ${fmt0(z8.cells.length)} in totale</p></div>

    ${years.length > 1 ? `<div class="card"><h2>Km per anno</h2>${bars(years.map(String), years.map((y) => byYear.get(y)), "km")}</div>` : ""}

    <div class="card"><h2>Km per ora del giorno</h2>${bars(hourKm.map((_, h) => (h % 6 === 0 ? String(h) : "")), hourKm, "km")}
      <p class="msg">Ora di punta: ${argmax(hourKm)}:00</p></div>

    <div class="card"><h2>Km per giorno della settimana</h2>${bars(GIORNI, dowKm, "km")}
      <p class="msg">Viaggi di più di ${GIORNI_LUNGHI[argmax(dowKm)]}</p></div>

    <div class="card"><h2>Curiosità</h2>
      ${row("Stagione più viaggiata", `${STAGIONI[argmax(seasonKm)]} · ${fmt0(Math.max(...seasonKm))} km`)}
      ${row("Km nel weekend", `${fmt0(weekendKm)} (${fmt0(total ? weekendKm / total * 100 : 0)}%)`)}
      ${row("Bologna–Milano A/R", `${fmt1(total / 400)} volte`)}
      ${row("Punti al giorno", fmt0(pts.length / days.length))}
    </div>`;

  hydratePlaces(el);
  // l'area grattata richiede più calcoli: si completa subito dopo, senza bloccare la schermata
  setTimeout(() => {
    const z = hexVisits(pts, 100), t = document.getElementById("t-area");
    if (t) { t.textContent = fmt1(z.area); t.nextElementSibling.nextElementSibling.textContent = `${fmt0(z.cells.length)} esagoni da 100 m`; }
  }, 60);
}
