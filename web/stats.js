// Scheda Statistiche: calcolata sui punti (tutti, senza filtri). Dentro l'HTML finiscono solo numeri e date calcolati qui.
const MESI = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
const GIORNI = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
const GIORNI_LUNGHI = ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"];
const STAGIONI = ["Inverno", "Primavera", "Estate", "Autunno"];

const fmt1 = (n) => n.toLocaleString("it-IT", { maximumFractionDigits: 1 });
const fmt0 = (n) => Math.round(n).toLocaleString("it-IT");
const fmtData = (ts) => new Date(ts).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
const fmtDataBreve = (ts) => new Date(ts).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" });
const dkey = (ts) => { const d = new Date(ts); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); };
const dkeyTs = (k) => new Date(Math.floor(k / 10000), Math.floor(k / 100) % 100 - 1, k % 100, 12).getTime();
const epochDay = (ts) => { const d = new Date(ts); return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5); };
const season = (m) => [0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 0][m];
const argmax = (a) => a.indexOf(Math.max(...a));

function bars(labels, values, unit) {
  const max = Math.max(...values, 1e-9);
  return `<div class="bars">${values.map((v, i) =>
    `<div class="bar" title="${labels[i]}: ${fmt1(v)} ${unit}"><i style="height:${Math.max(2, v / max * 100)}%"></i><b>${labels[i]}</b></div>`).join("")}</div>`;
}
const dur = (ms) => (ms >= 48 * 36e5 ? `${fmt1(ms / 864e5)} giorni` : `${fmt0(ms / 36e5)} ore`);
const tile = (big, label, small) => `<div class="tile"><b>${big}</b><span>${label}</span>${small ? `<small>${small}</small>` : ""}</div>`;
const row = (k, v) => `<dt>${k}</dt><dd>${v}</dd>`;
const rank = (items) => `<ul class="rank">${items.map((it, i) => `<li><i>${i + 1}</i><em>${it[0]}</em><b>${it[1]}</b></li>`).join("")}</ul>`;

function renderStats(pts) {
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

  // ---- casa, lontananza, estremi ----
  const stays = topStays(pts, 5), home = stays[0];
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

  // ---- zone esplorate ----
  const z0 = hexCells(pts, 0);                       // esagoni da 200 m
  const z2 = hexCells(pts, 2).cells;                 // zone da 800 m: si contano le nuove per mese
  const newByMonth = new Map();
  z2.forEach((c) => { const d = new Date(c[4]), k = d.getFullYear() * 100 + d.getMonth(); newByMonth.set(k, (newByMonth.get(k) || 0) + 1); });

  // ---- classifiche ----
  const topDays = [...byDay.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const months = [...byMonth.keys()].sort((a, b) => a - b).slice(-12);
  const newMonths = [...newByMonth.keys()].sort((a, b) => a - b).slice(-12);
  const years = [...byYear.keys()].sort();
  const bestMonth = [...byMonth.entries()].sort((a, b) => b[1] - a[1])[0];
  const movingDays = [...byDay.values()].filter((v) => v >= 1).length;
  const first = pts[0].ts, last = pts[pts.length - 1].ts;
  const loc = (p) => `${p.lat.toFixed(3)}, ${p.lon.toFixed(3)}`;

  el.innerHTML = `
    <div class="tiles">
      ${tile(fmt0(total), "km percorsi", `in ${fmt0(days.length)} giorni con dati`)}
      ${tile(fmt1(total / 40075), "giri della Terra", `${fmt1(total / 384400 * 100)}% della strada per la Luna`)}
      ${tile(fmt1(avgSpeed), "km/h in media", "solo quando ti muovi")}
      ${tile(fmt1(z0.area), "km² grattati", `${fmt0(z0.cells.length)} esagoni da 200 m`)}
    </div>

    <div class="card"><h2>Panoramica</h2><dl>
      ${row("Punti registrati", fmt0(pts.length))}
      ${row("Periodo", `${fmtDataBreve(first)} – ${fmtDataBreve(last)}`)}
      ${row("Giorni in movimento", `${fmt0(movingDays)} su ${fmt0(days.length)}`)}
      ${row("Media nei giorni in movimento", `${fmt1(movingDays ? total / movingDays : 0)} km`)}
      ${row("Tempo in movimento", dur(movingMs))}
      ${row("Giorni consecutivi con dati", `${bestStreak} (fino al ${fmtDataBreve(bestEnd * 864e5 + 12 * 36e5)})`)}
    </dl></div>

    <div class="card"><h2>Giorni più lunghi</h2>
      ${rank(topDays.map(([k, v]) => [fmtData(dkeyTs(k)), `${fmt0(v)} km`]))}
    </div>

    <div class="card"><h2>Casa e lontananza</h2><dl>
      ${home ? row("Casa (luogo dove stai di più)", loc(home)) : ""}
      ${row("Giorni restati a meno di 1 km da casa", fmt0(daysHome))}
      ${row("Giorni a più di 50 km da casa", fmt0(daysAway50))}
      ${row("Giorni a più di 200 km da casa", fmt0(daysAway200))}
      ${far.p ? row("Punto più lontano", `${fmt0(far.d)} km · ${fmtDataBreve(far.p.ts)}`) : ""}
    </dl></div>

    <div class="card"><h2>Estremi raggiunti</h2><dl>
      ${row("Più a nord", `${loc(N)} · ${fmtDataBreve(N.ts)}`)}
      ${row("Più a sud", `${loc(S)} · ${fmtDataBreve(S.ts)}`)}
      ${row("Più a est", `${loc(E)} · ${fmtDataBreve(E.ts)}`)}
      ${row("Più a ovest", `${loc(W)} · ${fmtDataBreve(W.ts)}`)}
    </dl></div>

    <div class="card"><h2>Dove passi più tempo</h2>
      ${rank(stays.map((s) => [`${s.lat.toFixed(3)}, ${s.lon.toFixed(3)}`, dur(s.ms)]))}
    </div>

    <div class="card"><h2>Km per mese</h2>${bars(months.map((m) => MESI[m % 100].slice(0, 3)), months.map((m) => byMonth.get(m)), "km")}
      ${bestMonth ? `<p class="msg">Mese più attivo: ${MESI[bestMonth[0] % 100]} ${Math.floor(bestMonth[0] / 100)}, ${fmt0(bestMonth[1])} km.</p>` : ""}</div>

    <div class="card"><h2>Zone nuove scoperte per mese</h2>
      ${bars(newMonths.map((m) => MESI[m % 100].slice(0, 3)), newMonths.map((m) => newByMonth.get(m)), "zone da 800 m")}
      <p class="msg">Quante zone da 800 m mai visitate prima hai toccato ogni mese: ${fmt0(z2.length)} in totale.</p></div>

    ${years.length > 1 ? `<div class="card"><h2>Km per anno</h2>${bars(years.map(String), years.map((y) => byYear.get(y)), "km")}</div>` : ""}

    <div class="card"><h2>Km per ora del giorno</h2>${bars(hourKm.map((_, h) => (h % 6 === 0 ? String(h) : "")), hourKm, "km")}
      <p class="msg">Ora di punta: ${argmax(hourKm)}:00.</p></div>

    <div class="card"><h2>Km per giorno della settimana</h2>${bars(GIORNI, dowKm, "km")}
      <p class="msg">Giorno in cui viaggi di più: ${GIORNI_LUNGHI[argmax(dowKm)]}.</p></div>

    <div class="card"><h2>Curiosità</h2><dl>
      ${row("Stagione più viaggiata", `${STAGIONI[argmax(seasonKm)]} (${fmt0(Math.max(...seasonKm))} km)`)}
      ${row("Km nel weekend", `${fmt0(weekendKm)} (${fmt0(total ? weekendKm / total * 100 : 0)}%)`)}
      ${row("Come andare e tornare da Bologna a Milano", `${fmt1(total / 400)} volte`)}
      ${row("Punti registrati al giorno", fmt0(pts.length / days.length))}
    </dl></div>`;
}
