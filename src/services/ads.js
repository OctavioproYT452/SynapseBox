// Anuncios para usar la IA (2.19.0). El administrador decide, por ámbito, si la IA exige ver un anuncio:
//  · panel   → mensajes al asistente de archivos del panel
//  · discord → ejecución de comandos de Discord que usan $ai…
// Modos: "off" (sin anuncios) · "per_use" (cada anuncio da N usos: un mensaje / una ejecución) · "timed" (cada anuncio da N minutos de acceso, como el "host por anuncios" de BDFD).
// Proveedores que NO necesitan dominio propio:
//  · "shortener": acortadores de enlaces con API que pagan por visita (ShrinkMe, GPLinks, ouo.io…). Se acorta un enlace de retorno a este servidor.
//  · "direct": un enlace directo/"smartlink" de una red publicitaria (Adsterra, Monetag…). El usuario lo abre y espera un tiempo mínimo.
// Los cobros (mínimo de retirada, PayPal/cripto…) los gestiona cada servicio: SynapseBox solo enseña el enlace y comprueba que se esperó.
const crypto = require("crypto");
const { get, run, all, now } = require("../db");

const SCOPES = ["panel", "discord"], MODES = ["off", "per_use", "timed"];
const DEF = {
  provider: "none", template: "", key: "", direct_url: "", format: "text", public_url: "",
  min_seconds: 15, ttl_min: 30, cooldown_s: 20, daily_max: 20, exempt_admins: true,
  scopes: { panel: { mode: "off", uses: 1, minutes: 60 }, discord: { mode: "off", uses: 1, minutes: 60 } },
};
const PRESETS = [ // plantillas editables: comprueba en la web de cada servicio que siguen vigentes y sus condiciones de pago
  { id: "shrinkme", name: "ShrinkMe.io (acortador)", provider: "shortener", template: "https://shrinkme.io/api?api={key}&url={url}&format=text" },
  { id: "gplinks", name: "GPLinks (acortador)", provider: "shortener", template: "https://api.gplinks.com/api?api={key}&url={url}&format=text" },
  { id: "shrinkearn", name: "ShrinkEarn (acortador)", provider: "shortener", template: "https://shrinkearn.com/api?api={key}&url={url}&format=text" },
  { id: "ouo", name: "ouo.io (acortador)", provider: "shortener", template: "https://ouo.io/api/{key}?s={url}", format: "text" },
  { id: "adsterra", name: "Adsterra · Direct Link", provider: "direct" },
  { id: "monetag", name: "Monetag · Direct Link", provider: "direct" },
];

const getS = k => get("SELECT value FROM settings WHERE key=?", k)?.value;
const int = (v, lo, hi, d) => { v = Math.floor(Number(v)); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
let cache = null;
function cfg() {
  if (cache) return cache;
  let s = {}; try { s = JSON.parse(getS("ads_cfg") || "{}"); } catch { }
  const c = { ...DEF, ...s, scopes: {} };
  for (const k of SCOPES) { const x = s.scopes?.[k] || {}; c.scopes[k] = { mode: MODES.includes(x.mode) ? x.mode : "off", uses: int(x.uses, 1, 1000, 1), minutes: int(x.minutes, 1, 10080, 60) }; }
  c.min_seconds = int(c.min_seconds, 5, 300, 15); c.ttl_min = int(c.ttl_min, 5, 240, 30); c.cooldown_s = int(c.cooldown_s, 0, 3600, 20); c.daily_max = int(c.daily_max, 1, 1000, 20);
  return (cache = c);
}
const ready = c => c.provider === "direct" ? /^https:\/\//i.test(c.direct_url) : c.provider === "shortener" ? !!c.template && !!c.key : false;
const active = scope => { const c = cfg(); return ready(c) && c.scopes[scope]?.mode !== "off" && !!c.scopes[scope]; };

// Rechaza destinos internos (SSRF): solo https y nunca localhost ni redes privadas
function safeHttps(u, what) {
  let x; try { x = new URL(u); } catch { throw Error(what + ": URL no válida"); }
  const h = x.hostname.toLowerCase();
  if (x.protocol !== "https:") throw Error(what + " debe empezar por https://");
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || /^(\[|0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h) || h.includes(":")) throw Error(what + ": no puede apuntar a una red interna");
  return x;
}

function save(b) {
  const c = cfg(), o = { ...c, scopes: { ...c.scopes } };
  if (b.provider !== undefined) { if (!["none", "shortener", "direct"].includes(b.provider)) throw Error("Proveedor de anuncios inválido"); o.provider = b.provider; }
  if (b.template !== undefined) { const t = String(b.template).trim().slice(0, 400); if (t) { if (!t.includes("{url}")) throw Error("La plantilla debe incluir {url}"); safeHttps(t.replace(/\{[a-z]+\}/g, "x"), "La plantilla"); } o.template = t; }
  if (b.key) o.key = String(b.key).trim().slice(0, 200).replace(/[\s"'<>]/g, "");
  if (b.direct_url !== undefined) { const t = String(b.direct_url).trim().slice(0, 600); if (t) safeHttps(t, "El enlace directo"); o.direct_url = t; }
  if (b.format !== undefined) o.format = b.format === "json" ? "json" : "text";
  if (b.public_url !== undefined) { const t = String(b.public_url).trim().replace(/\/+$/, "").slice(0, 200); if (t && !/^https?:\/\/[^\s/]+$/i.test(t)) throw Error("URL pública: usa http(s)://dominio-o-ip:puerto, sin ruta"); o.public_url = t; }
  for (const k of ["min_seconds", "ttl_min", "cooldown_s", "daily_max"]) if (b[k] !== undefined) o[k] = b[k];
  if (b.exempt_admins !== undefined) o.exempt_admins = !!b.exempt_admins;
  for (const k of SCOPES) { const x = b.scopes?.[k]; if (x) { if (x.mode !== undefined && !MODES.includes(x.mode)) throw Error("Modo inválido"); o.scopes[k] = { ...o.scopes[k], ...x }; } }
  run("INSERT OR REPLACE INTO settings VALUES('ads_cfg',?)", JSON.stringify(o)); cache = null;
  const n = cfg();
  for (const k of SCOPES) if (n.scopes[k].mode !== "off" && !ready(n)) throw Error("Configura primero el proveedor de anuncios (clave/plantilla o enlace directo) antes de activar un modo");
}
const publicConfig = () => { const c = cfg(); return { ...c, key: undefined, has_key: !!c.key, ready: ready(c), presets: PRESETS, stats: stats() }; };
function stats() {
  const d = now() - 864e5;
  return { today: get("SELECT COUNT(*) n FROM ad_log WHERE ts>?", d).n, users_today: get("SELECT COUNT(DISTINCT key) n FROM ad_log WHERE ts>?", d).n, total: get("SELECT COUNT(*) n FROM ad_log").n };
}

// ---------- créditos ----------
const keyOf = w => w.u ? "u" + w.u.id : "d" + String(w.did || "0");
const NOOP = { refund() { } };
// Llamar ANTES de usar la IA. Si hace falta un anuncio lanza un error con code 402 (y, en Discord, con el enlace). Devuelve { refund } por si la IA falla.
function gate(scope, who, req) {
  const c = cfg(), s = c.scopes[scope];
  if (!active(scope)) return NOOP;
  if (who.u?.is_admin && c.exempt_admins) return NOOP;
  const key = keyOf(who), row = get("SELECT uses,until FROM ad_credits WHERE key=? AND scope=?", key, scope);
  if (s.mode === "timed") { if (row && row.until > now()) return NOOP; }
  else if (row && row.uses > 0 && run("UPDATE ad_credits SET uses=uses-1 WHERE key=? AND scope=? AND uses>0", key, scope).changes)
    return { refund: () => run("UPDATE ad_credits SET uses=uses+1 WHERE key=? AND scope=?", key, scope) };
  const what = s.mode === "timed" ? `Mira un anuncio para usar la IA durante ${fmtMin(s.minutes)}.` : `Mira un anuncio para ${s.uses === 1 ? "un uso" : s.uses + " usos"} de la IA.`;
  let link = "";
  if (scope === "discord") { try { link = " " + start(scope, who, req); } catch (e) { link = " (" + e.message + ")"; } }
  throw Object.assign(Error(what + link), { code: 402, ad: true, scope });
}
const fmtMin = m => m >= 60 && m % 60 === 0 ? (m / 60) + " h" : m + " min";

// ---------- sesiones de anuncio ----------
function base(req) { const c = cfg(); const b = c.public_url || process.env.PUBLIC_URL || (req ? `${req.protocol}://${req.get("host")}` : ""); if (!b) throw Error("el administrador debe configurar la URL pública en Ajustes de anuncios"); return b.replace(/\/+$/, ""); }
function start(scope, who, req) {
  const c = cfg(); if (!active(scope)) throw Error("Los anuncios no están activados");
  const key = keyOf(who), t = now();
  const last = get("SELECT MAX(ts) t FROM ad_log WHERE key=?", key).t || 0;
  if (t - last < c.cooldown_s * 1000) throw Error(`espera ${Math.ceil((last + c.cooldown_s * 1000 - t) / 1000)} s antes del siguiente anuncio`);
  if (get("SELECT COUNT(*) n FROM ad_log WHERE key=? AND ts>?", key, t - 864e5).n >= c.daily_max) throw Error("has alcanzado el máximo de anuncios por día");
  if (get("SELECT COUNT(*) n FROM ad_sessions WHERE key=? AND done=0 AND created>?", key, t - c.ttl_min * 6e4).n >= 5) run("DELETE FROM ad_sessions WHERE key=? AND done=0", key); // demasiadas abiertas: se reinician
  const b = base(req), token = crypto.randomBytes(24).toString("base64url");
  run("INSERT INTO ad_sessions(token,key,scope,created,done) VALUES(?,?,?,?,0)", crypto.createHash("sha256").update(token).digest("hex"), key, scope, t);
  return `${b}/ads/w/${token}`;
}
const hashT = t => crypto.createHash("sha256").update(String(t)).digest("hex");
function session(token) {
  const c = cfg(), r = get("SELECT * FROM ad_sessions WHERE token=?", hashT(token));
  if (!r || r.done || r.created < now() - c.ttl_min * 6e4) return null;
  return r;
}
async function shorten(dest) {
  const c = cfg(), url = c.template.replace("{key}", encodeURIComponent(c.key)).replace("{url}", encodeURIComponent(dest));
  safeHttps(url, "La plantilla");
  const r = await fetch(url, { signal: AbortSignal.timeout(10000), redirect: "error", headers: { "User-Agent": "SynapseBox", Accept: "application/json,text/plain" } });
  const txt = (await r.text()).slice(0, 4000); let out = txt.trim();
  try { const j = JSON.parse(txt); if (String(j.status || "").toLowerCase() === "error") throw Error(String(j.message || "error del servicio").slice(0, 120)); out = String(j.shortenedUrl || j.short || j.shortlink || j.result_url || j.url || (typeof j === "string" ? j : "")); } catch (e) { if (e.message && !/JSON/.test(e.message)) throw e; }
  if (!/^https:\/\/[^\s]+$/i.test(out)) throw Error("El servicio de anuncios no devolvió un enlace válido (revisa la API key)");
  return out;
}
async function open(token, req) {
  const s = session(token), c = cfg(); if (!s || !active(s.scope)) throw Error("Este anuncio ya no es válido. Pide uno nuevo.");
  let url = s.short;
  if (!url) {
    url = c.provider === "direct" ? c.direct_url : await shorten(`${base(req)}/ads/r/${token}`);
    run("UPDATE ad_sessions SET short=?, opened=COALESCE(opened,?) WHERE token=?", url, now(), s.token);
  } else run("UPDATE ad_sessions SET opened=COALESCE(opened,?) WHERE token=?", now(), s.token);
  return { url, direct: c.provider === "direct", min: c.min_seconds };
}
function claim(token) {
  const s = session(token), c = cfg(); if (!s) throw Error("Este anuncio ya se usó o caducó.");
  if (!s.opened) throw Error("Primero abre el anuncio.");
  const wait = s.opened + c.min_seconds * 1000 - now(); if (wait > 0) throw Object.assign(Error(`Aún falta tiempo: espera ${Math.ceil(wait / 1000)} s viendo el anuncio.`), { wait: Math.ceil(wait / 1000) });
  if (!run("UPDATE ad_sessions SET done=1 WHERE token=? AND done=0", s.token).changes) throw Error("Este anuncio ya se usó.");
  const sc = c.scopes[s.scope] || { mode: "off" }, t = now();
  run("INSERT INTO ad_log VALUES(?,?,?)", s.key, s.scope, t);
  const row = get("SELECT uses,until FROM ad_credits WHERE key=? AND scope=?", s.key, s.scope);
  if (sc.mode === "timed") { const until = Math.max(t, row?.until || 0) + sc.minutes * 6e4; run("INSERT OR REPLACE INTO ad_credits VALUES(?,?,?,?)", s.key, s.scope, row?.uses || 0, Math.min(until, t + 7 * 864e5)); }
  else run("INSERT OR REPLACE INTO ad_credits VALUES(?,?,?,?)", s.key, s.scope, Math.min(1000, (row?.uses || 0) + sc.uses), row?.until || 0);
  return { scope: s.scope, mode: sc.mode, uses: sc.uses, minutes: sc.minutes };
}
const done = token => { const r = get("SELECT done FROM ad_sessions WHERE token=?", hashT(token)); return !!r?.done; };
function mine(u) {
  const c = cfg(), out = {};
  for (const k of SCOPES) { if (!active(k)) continue; const r = get("SELECT uses,until FROM ad_credits WHERE key=? AND scope=?", "u" + u.id, k); out[k] = { mode: c.scopes[k].mode, uses: r?.uses || 0, until: r?.until > now() ? r.until : null, exempt: !!(u.is_admin && c.exempt_admins) }; }
  return out;
}
async function test() { const c = cfg(); if (c.provider === "direct") { safeHttps(c.direct_url, "El enlace directo"); return "Enlace directo válido"; } if (!ready(c)) throw Error("Falta la plantilla o la API key"); return await shorten(base(null) + "/ads/r/test"); }
function purge() { const t = now(); run("DELETE FROM ad_sessions WHERE created<?", t - 864e5); run("DELETE FROM ad_log WHERE ts<?", t - 2 * 864e5); run("DELETE FROM ad_credits WHERE uses<=0 AND until<?", t); }

module.exports = { cfg, active, save, publicConfig, gate, start, open, claim, session, done, mine, test, purge, PRESETS };
