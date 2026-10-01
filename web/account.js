// Accesso (email, Google, database locale), logout, esportazione dei dati e finestre di conferma.
let session = Native.session();
const GOOGLE_ENABLED = false; // da portare a true quando il provider Google è attivo in PocketBase (client ID e secret)

// ---------- finestra di conferma (la WebView non mostra confirm() del browser) ----------
function confirmDialog(text, okLabel) {
  return new Promise((resolve) => {
    $("modal-text").textContent = text;
    $("modal-input").hidden = true; $("modal-skip").hidden = true;
    $("modal-ok").textContent = okLabel || "Conferma"; $("modal-ok").classList.add("danger"); $("modal-no").textContent = "Annulla";
    $("modal").hidden = false;
    const done = (v) => { $("modal").hidden = true; $("modal-ok").onclick = $("modal-no").onclick = null; resolve(v); };
    $("modal-ok").onclick = () => done(true);
    $("modal-no").onclick = () => done(false);
  });
}

// Finestra con un campo di testo. Risolve {action: "save" | "skip" | "cancel", value}
function promptDialog({ text, value = "", placeholder = "", okLabel = "Salva", skipLabel = "", noLabel = "Annulla" }) {
  return new Promise((resolve) => {
    const inp = $("modal-input");
    $("modal-text").textContent = text;
    inp.hidden = false; inp.value = value; inp.placeholder = placeholder;
    $("modal-ok").textContent = okLabel; $("modal-ok").classList.remove("danger");
    $("modal-skip").hidden = !skipLabel; $("modal-skip").textContent = skipLabel;
    $("modal-no").textContent = noLabel;
    $("modal").hidden = false;
    setTimeout(() => { inp.focus(); inp.select(); }, 80);
    const done = (r) => { $("modal").hidden = true; inp.hidden = true; $("modal-skip").hidden = true; $("modal-ok").onclick = $("modal-no").onclick = $("modal-skip").onclick = null; resolve(r); };
    $("modal-ok").onclick = () => done({ action: "save", value: inp.value.trim() });
    $("modal-skip").onclick = () => done({ action: "skip" });
    $("modal-no").onclick = () => done({ action: "cancel" });
  });
}

// ---------- schermata di accesso ----------
function loginSay(text, err) { $("l-msg").textContent = text; $("l-msg").classList.toggle("err", !!err); }

function showLogin() {
  $("l-url").value = session.url || "";
  $("l-email").value = session.mode === "server" ? session.email || "" : "";
  $("l-pw").value = "";
  $("l-pw2").value = "";
  loginSay("");
  pickDb("local"); // di default i dati restano sul telefono
  pickMode("login");
  $("login").hidden = false;
}

function pickDb(db) {
  document.querySelectorAll("#login-db button").forEach((b) => b.classList.toggle("active", b.dataset.db === db));
  $("login-server").hidden = db !== "server";
  $("login-local").hidden = db !== "local";
  loginSay("");
}
document.querySelectorAll("#login-db button").forEach((b) => (b.onclick = () => pickDb(b.dataset.db)));

// "Accedi" e "Nuovo account" sono schede separate, con campi e pulsanti propri
function pickMode(m) {
  document.querySelectorAll("#login-mode button").forEach((b) => b.classList.toggle("active", b.dataset.lm === m));
  $("lm-login").hidden = m !== "login";
  $("lm-create").hidden = m !== "create";
  $("l-pw2").hidden = m !== "create";
  $("l-pw").autocomplete = m === "create" ? "new-password" : "current-password";
  loginSay("");
}
document.querySelectorAll("#login-mode button").forEach((b) => (b.onclick = () => pickMode(b.dataset.lm)));

function setBusy(on) {
  document.querySelectorAll("#login button").forEach((b) => (b.disabled = on));
  if (!GOOGLE_ENABLED) $("l-google").disabled = true; // resta grigio finché Google non è attivo
}

// Dopo l'accesso: i punti locali non ancora inviati salgono sull'account e lo storico dell'account scende sul telefono
function afterLogin() {
  session = Native.session();
  $("login").hidden = true;
  setBusy(false);
  refreshAccount();
  points = []; movePts = []; loadedTotal = -1; statsFor = "";
  setTimeout(loadPoints, 1500);
  Profile.sync();
}

async function doEmailLogin(create) {
  const url = $("l-url").value.trim(), email = $("l-email").value.trim(), password = $("l-pw").value;
  if (!/^https?:\/\//i.test(url)) return loginSay("Inserisci l'URL del database, ad esempio https://pocketbase.tuodominio.it", true);
  if (!email || !password) return loginSay("Inserisci email e password", true);
  if (create && password.length < 5) return loginSay("La password deve avere almeno 5 caratteri", true);
  if (create && password !== $("l-pw2").value) return loginSay("Le due password non coincidono", true);
  setBusy(true);
  loginSay(create ? "Creazione dell'account…" : "Accesso…");
  const r = await Native.loginEmail({ url, email, password, create });
  if (r.ok) afterLogin(); else { setBusy(false); loginSay(r.error || "Accesso non riuscito", true); }
}
$("l-login").onclick = () => doEmailLogin(false);
$("l-create").onclick = () => doEmailLogin(true);

// Password dimenticata: il server manda all'email il link per sceglierne una nuova
$("l-forgot").onclick = async () => {
  const url = $("l-url").value.trim(), email = $("l-email").value.trim();
  if (!/^https?:\/\//i.test(url)) return loginSay("Inserisci prima l'URL del database", true);
  if (!/^\S+@\S+\.\S+$/.test(email)) return loginSay("Scrivi l'email dell'account nel campo Email, poi tocca \"Password dimenticata?\"", true);
  setBusy(true);
  loginSay("Invio dell'email…");
  const r = await Native.resetPassword({ url, email });
  setBusy(false);
  if (r.ok) loginSay(`Se esiste un account per ${email}, è in arrivo un'email con il link per scegliere una nuova password (controlla anche lo spam; se non arriva, il server di posta potrebbe non essere configurato). Aprilo, poi torna qui e accedi.`);
  else loginSay(r.error || "Invio non riuscito", true);
};

$("l-google").onclick = async () => {
  if (!GOOGLE_ENABLED) return;
  const url = $("l-url").value.trim();
  if (!/^https?:\/\//i.test(url)) return loginSay("Inserisci prima l'URL del database", true);
  setBusy(true);
  $("l-cancel").hidden = false;
  loginSay("Completa l'accesso con Google nel browser, poi torna qui…");
  const r = await Native.loginGoogle(url);
  $("l-cancel").hidden = true;
  if (r.ok) afterLogin(); else { setBusy(false); loginSay(r.error || "Accesso non riuscito", true); }
};
$("l-cancel").onclick = () => { Native.cancelGoogle(); $("l-cancel").hidden = true; };

$("l-local").onclick = () => { Native.useLocal(); session = Native.session(); $("login").hidden = true; refreshAccount(); };

// ---------- account nelle impostazioni ----------
function refreshAccount() {
  const s = session;
  const kv = (k, v) => `<div class="kv"><span>${k}</span><b>${esc(v)}</b></div>`;
  if (s.mode === "server") {
    $("acct-info").innerHTML = kv("Accesso", s.oauth ? "Google" : "Email") + kv("Account", s.email || "–") + kv("Database", s.url.replace(/^https?:\/\//, "")) + kv("Impostazioni", Profile.label());
    $("logout").textContent = "Esci dall'account";
    $("logout").classList.add("danger");
    $("pc-open").hidden = !!s.oauth;
  } else {
    $("acct-info").innerHTML = kv("Database", s.mode === "local" ? "Solo su questo telefono" : "Non collegato");
    $("pc-open").hidden = true; $("pc-form").hidden = true;
    $("logout").textContent = "Collegati a un server";
    $("logout").classList.remove("danger");
  }
}

// Cambio password: solo per gli account con email (con Google non c'è una password)
function pcSay(t, err) { $("pc-msg").textContent = t; $("pc-msg").classList.toggle("err", !!err); }
$("pc-open").onclick = () => {
  $("pc-form").hidden = !$("pc-form").hidden;
  pcSay("");
  if (!$("pc-form").hidden) $("pc-old").focus();
};
$("pc-save").onclick = async () => {
  const old = $("pc-old").value, nw = $("pc-new").value;
  if (!old) return pcSay("Scrivi la password attuale", true);
  if (nw.length < 5) return pcSay("La nuova password deve avere almeno 5 caratteri", true);
  if (nw !== $("pc-new2").value) return pcSay("Le due nuove password non coincidono", true);
  if (nw === old) return pcSay("La nuova password è uguale a quella attuale", true);
  $("pc-save").disabled = true;
  pcSay("Salvataggio…");
  const r = await Native.changePassword({ old, new: nw });
  $("pc-save").disabled = false;
  if (!r.ok) return pcSay(r.error || "Cambio non riuscito", true);
  ["pc-old", "pc-new", "pc-new2"].forEach((id) => ($(id).value = ""));
  $("pc-form").hidden = true;
  $("pc-open").textContent = "Password cambiata";
  setTimeout(() => ($("pc-open").textContent = "Cambia password"), 4000);
};

$("logout").onclick = async () => {
  if (session.mode !== "server") { showLogin(); pickDb("server"); return; }
  const pending = Native.status().pending;
  const ok = await confirmDialog(
    `Uscire dall'account ${session.email}? I punti salvati su questo telefono vengono cancellati (restano nel database online).` +
    (pending ? ` Attenzione: ${pending} punti non sono ancora stati sincronizzati e andranno persi.` : ""), "Esci");
  if (!ok) return;
  Native.logout(true);
  session = Native.session();
  points = []; movePts = []; loadedTotal = -1; statsFor = "";
  render(false);
  refreshAccount();
  showLogin(); pickDb("server");
};

// ---------- esportazione ----------
function say2(t) { $("export-msg").textContent = t; }
document.querySelectorAll("[data-export]").forEach((b) => (b.onclick = () => {
  const fmt = b.dataset.export;
  if (Native.isApp) { Native.exportData(fmt); say2("Scegli dove salvare il file…"); return; }
  // nel browser (demo) si esporta quello che c'è in pagina
  const iso = (t) => new Date(t).toISOString();
  let text, type;
  if (fmt === "json") { text = JSON.stringify(points.map((p) => ({ time: iso(p.ts), lat: p.lat, lon: p.lon }))); type = "application/json"; }
  else if (fmt === "gpx") {
    text = `<?xml version="1.0"?><gpx version="1.1" creator="MyMap" xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg>${points.map((p) => `<trkpt lat="${p.lat}" lon="${p.lon}"><time>${iso(p.ts)}</time></trkpt>`).join("")}</trkseg></trk></gpx>`;
    type = "application/gpx+xml";
  } else { text = "time_iso,ts_ms,lat,lon\n" + points.map((p) => `${iso(p.ts)},${p.ts},${p.lat},${p.lon}`).join("\n"); type = "text/csv"; }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = `mymap.${fmt}`;
  a.click();
  say2(`Esportati ${points.length} punti`);
}));

refreshAccount();
if (Native.isApp && session.mode === "none") showLogin();
Profile.onState = refreshAccount;
if (Native.isApp && session.mode === "server") Profile.sync();
