// Layout del sito su schermi larghi (in qualsiasi browser, non nell'app): una colonna a sinistra con logo, menu e controlli della mappa,
// e a destra la mappa (o statistiche e impostazioni). Gli elementi della versione per telefono si spostano senza cambiare id,
// quindi app.js e gli altri script non se ne accorgono; sotto i 1000 px tutto torna com'era.
(() => {
  const html = document.documentElement;
  if (window.MyMapNative) return; // nell'app Android resta l'interfaccia per telefono
  const $ = (id) => document.getElementById(id);
  const mq = matchMedia("(min-width: 1000px)");
  const app = $("app"), nav = document.querySelector("#app > nav"), mapwrap = $("mapwrap");
  const el = (tag, cls, html_) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html_ !== undefined) e.innerHTML = html_; return e; };
  const home = new Map(); // elemento → { parent, next }: dove stava nella versione per telefono

  const brand = el("div", "brand", '<span class="logo"></span><b>MyMap</b>');
  const group = (title) => { const g = el("section", "sgroup"); if (title) g.append(el("h4", "", title)); return g; };
  const gView = group("Vista"), gPeriod = group("Periodo"), gData = group(""), gMap = group("Mappa");
  const periodBox = el("div", "period"); gPeriod.append(periodBox);
  const sideMap = el("div", "side-map"); sideMap.append(gView, gPeriod, gData, gMap);
  const side = el("aside"); side.id = "side";

  // le scritte accanto alle icone dei pulsanti "Personalizza" e "Dove sono"
  [["tune", "Personalizza la vista"], ["locate", "Dove sono"]].forEach(([id, t]) => { $(id).append(el("span", "lbl", t)); });

  function put(e, parent, before) {
    if (!home.has(e)) home.set(e, { parent: e.parentNode, next: e.nextSibling });
    parent.insertBefore(e, before || null);
  }
  function restore(e) { const h = home.get(e); if (h) h.parent.insertBefore(e, h.next && h.next.parentNode === h.parent ? h.next : null); }

  function wide() {
    app.insertBefore(side, app.firstChild);
    side.append(brand, nav, sideMap);
    put($("s-ver"), brand);
    put($("modes"), gView);
    put($("panel"), gData);
    put($("tune"), gMap);
    put($("locate"), gMap);
    put($("zoomlevel"), mapwrap);
    put(document.querySelector(".fgroup"), periodBox);
    put(document.querySelector(".qfs"), periodBox);
    html.dataset.wide = "1";
  }
  function narrow() {
    ["s-ver", "zoomlevel"].forEach((id) => restore($(id)));
    restore(document.querySelector(".fgroup")); restore(document.querySelector(".qfs"));
    ["modes", "panel", "tune", "locate"].forEach((id) => restore($(id)));
    app.append(nav); // la barra in basso torna ultima
    side.remove();
    delete html.dataset.wide;
  }
  function apply() {
    if (mq.matches) wide(); else narrow();
    try { map.invalidateSize(); } catch {}
  }
  mq.addEventListener("change", apply);
  apply();
})();
