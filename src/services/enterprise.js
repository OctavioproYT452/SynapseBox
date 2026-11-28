// Funciones para empresas (2.27.0): lista de IPs del panel admin, webhooks firmados y complejidad de contraseñas.
const crypto = require("crypto"), net = require("net"), dns = require("dns"), http = require("http"), https = require("https");
const { setting } = require("../lib/settings");

// ---- lista de IPs permitidas para la administración (IP o CIDR IPv4; IPv6 solo exacta) ----
const norm = ip => String(ip || "").trim().replace(/^::ffff:/i, "").toLowerCase();
const v4n = s => s.split(".").reduce((a, b) => a * 256 + Number(b), 0);
function parseList(txt) {
  const out = [];
  for (const raw of String(txt || "").split(/[\s,;]+/).filter(Boolean)) {
    const [ip, bits] = raw.split("/"), a = norm(ip);
    if (net.isIPv4(a)) { const b = bits === undefined ? 32 : Number(bits); if (!Number.isInteger(b) || b < 0 || b > 32) throw Error("Máscara no válida: " + raw); out.push({ v4: true, n: v4n(a), b }); }
    else if (net.isIPv6(a) && bits === undefined) out.push({ v4: false, a });
    else throw Error("IP o rango no válido: " + raw);
  }
  if (out.length > 100) throw Error("Máximo 100 entradas");
  return out;
}
const matches = (list, ip) => { ip = norm(ip); if (net.isIPv4(ip)) { const n = v4n(ip); return list.some(e => e.v4 && (e.b === 0 || Math.floor(n / 2 ** (32 - e.b)) === Math.floor(e.n / 2 ** (32 - e.b)))); } return list.some(e => !e.v4 && e.a === ip); };
let cache = { txt: null, list: [] };
const allowList = () => { const t = setting("admin_ip_allow") || ""; if (t !== cache.txt) { try { cache = { txt: t, list: parseList(t) }; } catch { cache = { txt: t, list: [] }; } } return cache.list; };
const ipAllowed = ip => { const l = allowList(); return !l.length || matches(l, ip); };
// Middleware: si hay lista, solo esas IPs llegan a /api/admin y /admin (las demás reciben 403)
const ipGuard = (req, res, next) => (/^\/(api\/)?admin(\/|$)/.test(req.path) && !ipAllowed(req.ip)) ? res.status(403).json({ error: "Tu IP no está autorizada para administrar este servidor" }) : next();

// ---- complejidad de contraseñas ----
const complexity = p => {
  if (setting("pw_complex") !== "1") return;
  p = String(p || "");
  if (!(/[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p) && /[^A-Za-z0-9]/.test(p))) throw Error("La contraseña debe incluir mayúscula, minúscula, número y símbolo");
};

// ---- webhooks firmados (HMAC-SHA256), solo https, sin direcciones privadas ----
const priv4 = ip => { const [a, b] = ip.split(".").map(Number); return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224; };
const privIp = ip => { ip = norm(ip).split("%")[0]; if (net.isIPv4(ip)) return priv4(ip); if (!net.isIPv6(ip)) return true; return ip === "::" || ip === "::1" || /^f[cd]/.test(ip) || /^fe[89ab]/.test(ip) || /^ff/.test(ip); };
const lookup = (host, opts, cb) => { if (typeof opts === "function") { cb = opts; opts = {}; } dns.lookup(host, { all: true }, (e, a) => { if (e) return cb(e); if (!a.length || a.some(x => privIp(x.address))) return cb(Error("dirección no permitida")); if (opts && opts.all) return cb(null, a); cb(null, a[0].address, a[0].family); }); };
const checkUrl = u => { let x; try { x = new URL(u); } catch { throw Error("URL del webhook no válida"); } if (x.protocol !== "https:") throw Error("El webhook debe usar https"); const h = x.hostname.replace(/^\[|\]$/g, ""); if (net.isIP(h) && privIp(h)) throw Error("Dirección no permitida"); return x; };
const status = { at: 0, ok: null, code: 0, error: "" };
function post(event, data) {
  const url = setting("webhook_url"), secret = setting("webhook_secret");
  if (!url || !secret) return Promise.resolve(false);
  let u; try { u = checkUrl(url); } catch (e) { return Promise.resolve(false); }
  const ts = String(Math.floor(Date.now() / 1000)), body = JSON.stringify({ event, time: new Date().toISOString(), data });
  const sig = "sha256=" + crypto.createHmac("sha256", secret).update(ts + "." + body).digest("hex");
  return new Promise(ok => {
    const req = https.request(u, { method: "POST", lookup, timeout: 5000, agent: false, headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body), "User-Agent": "SynapseBox-Webhook", "X-SynapseBox-Event": event, "X-SynapseBox-Timestamp": ts, "X-SynapseBox-Signature": sig } }, res => {
      res.resume(); status.at = Date.now(); status.code = res.statusCode; status.ok = res.statusCode < 300; status.error = status.ok ? "" : "HTTP " + res.statusCode; ok(status.ok);
    });
    req.on("timeout", () => req.destroy(Error("tiempo agotado")));
    req.on("error", e => { status.at = Date.now(); status.ok = false; status.code = 0; status.error = String(e.message).slice(0, 120); ok(false); });
    req.end(body);
  });
}
const emit = (event, data) => { if (setting("webhook_url")) post(event, data).catch(() => { }); };

module.exports = { parseList, matches, ipAllowed, ipGuard, complexity, checkUrl, post, emit, status, newSecret: () => crypto.randomBytes(24).toString("hex") };
