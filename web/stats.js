// Scheda Statistiche: calcolata sui punti (tutti, senza filtri). Dentro l'HTML finiscono solo numeri e date calcolati qui.
const MESI = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
const GIORNI = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

const fmt1 = (n) => n.toLocaleString("it-IT", { maximumFractionDigits: 1 });
const fmt0 = (n) => Math.round(n).toLocaleString("it-IT");
const fmtData = (ts) => new Date(ts).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
const dkey = (ts) => { const d = new Date(ts); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); };
const epochDay = (ts) => { const d = new Date(ts); return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5); };

function bars(labels, values, unit) {
  const max = Math.max(...values, 1e-9);
  return `<div class="bars">${values.map((v, i) =>
    `<div class="bar" title="${labels[i]}: ${fmt1(v)} ${unit}"><i style="height:${Math.max(2, v / max * 100)}%"></i><b>${labels[i]}</b></div>`).join("")}</div>`;
}

function renderStats(pts) {
  const el = document.getElementById("stats");
  if (!pts.length) { el.innerHTML = '<div class="card"><p>Ancora nessun punto registrato.</p></div>'; return; }

  const byDay = new Map(), byMonth = new Map(), hourKm = Array(24).fill(0), dowKm = Array(7).fill(0);
  let total = 0;
  for (const s of moveSteps(pts)) {
    const d = new Date(s.ts), k = dkey(s.ts), mk = d.getFullYear() * 100 + d.getMonth();
    total += s.d;
    byDay.set(k, (byDay.get(k) || 0) + s.d);
    byMonth.set(mk, (byMonth.get(mk) || 0) + s.d);
    hourKm[d.getHours()] += s.d;
    dowKm[(d.getDay() + 6) % 7] += s.d;
  }

  const days = [...new Set(pts.map((p) => epochDay(p.ts)))].sort((a, b) => a - b);
  let streak = 1, bestStreak = 1, bestEnd = days[0];
  for (let i = 1; i < days.length; i++) {
    streak = days[i] === days[i - 1] + 1 ? streak + 1 : 1;
    if (streak > bestStreak) { bestStreak = streak; bestEnd = days[i]; }
  }

  let bestDay = [0, 0];
  byDay.forEach((v, k) => { if (v > bestDay[1]) bestDay = [k, v]; });
  const bestDayTs = bestDay[0] ? new Date(Math.floor(bestDay[0] / 10000), Math.floor(bestDay[0] / 100) % 100 - 1, bestDay[0] % 100).getTime() : 0;
  let bestMonth = [0, 0];
  byMonth.forEach((v, k) => { if (v > bestMonth[1]) bestMonth = [k, v]; });

  const stays = topStays(pts, 5);
  const home = stays[0];
  let far = { d: 0, p: null };
  if (home) pts.forEach((p) => { const d = km(home, p); if (d > far.d) far = { d, p }; });

  const hex = hexCells(pts);
  const first = pts[0].ts, last = pts[pts.length - 1].ts;
  const movingDays = byDay.size;
  const perDay = movingDays ? total / movingDays : 0;

  // km per mese, in ordine cronologico, massimo gli ultimi 12 mesi con dati
  const months = [...byMonth.keys()].sort((a, b) => a - b).slice(-12);

  const row = (k, v) => `<dt>${k}</dt><dd>${v}</dd>`;
  el.innerHTML = `
    <div class="card"><h2>Panoramica</h2><dl>
      ${row("Punti registrati", fmt0(pts.length))}
      ${row("Periodo", `${fmtData(first)} – ${fmtData(last)}`)}
      ${row("Giorni con dati", fmt0(days.length))}
      ${row("Km percorsi", fmt0(total))}
      ${row("Media nei giorni in movimento", `${fmt1(perDay)} km`)}
    </dl></div>
    <div class="card"><h2>Record</h2><dl>
      ${bestDay[0] ? row("Giorno più lungo", `${fmt1(bestDay[1])} km · ${fmtData(bestDayTs)}`) : ""}
      ${bestMonth[1] ? row("Mese più attivo", `${MESI[bestMonth[0] % 100]} ${Math.floor(bestMonth[0] / 100)} · ${fmt0(bestMonth[1])} km`) : ""}
      ${row("Giorni consecutivi con dati", `${bestStreak} (fino al ${fmtData(bestEnd * 864e5 + 12 * 36e5)})`)}
      ${far.p ? row("Punto più lontano da casa", `${fmt0(far.d)} km · ${fmtData(far.p.ts)}`) : ""}
    </dl></div>
    <div class="card"><h2>Scratch map</h2><dl>
      ${row("Esagoni visitati", fmt0(hex.cells.length))}
      ${row("Area grattata", `≈ ${fmt1(hex.area)} km²`)}
    </dl></div>
    <div class="card"><h2>Dove passi più tempo</h2><dl>
      ${stays.map((s, i) => row(`#${i + 1} · ${s.lat.toFixed(3)}, ${s.lon.toFixed(3)}`, s.ms >= 48 * 36e5 ? `${fmt1(s.ms / 864e5)} giorni` : `${fmt0(s.ms / 36e5)} ore`)).join("")}
    </dl></div>
    <div class="card"><h2>Km per mese</h2>${bars(months.map((m) => MESI[m % 100].slice(0, 3)), months.map((m) => byMonth.get(m)), "km")}</div>
    <div class="card"><h2>Km per ora del giorno</h2>${bars(hourKm.map((_, h) => (h % 6 === 0 ? String(h) : "")), hourKm, "km")}</div>
    <div class="card"><h2>Km per giorno della settimana</h2>${bars(GIORNI, dowKm, "km")}</div>`;
}
