// Utilidades generales sin dependencias del resto del servidor.
const crypto = require("crypto");

const sha = t => crypto.createHash("sha256").update(t).digest("hex");
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// Errores del sistema (ENOENT…) se traducen: nunca se muestran rutas internas del servidor
const errMsg = e => e.code === "ENOENT" ? "No existe el archivo o la carpeta" : /^E[A-Z]+$/.test(String(e.code)) ? "No se pudo completar la operación" : e.message;
const wrap = fn => (req, res) => Promise.resolve(fn(req, res)).catch(e => res.status(e && e.status || 400).json({ error: errMsg(e) }));
const cookies = req => Object.fromEntries((req.headers.cookie || "").split(";").map(c => c.trim().split(/=(.*)/s).slice(0, 2)).filter(a => a[0]));
const fix = n => { const d = Buffer.from(n, "latin1").toString("utf8"); return d.includes("\ufffd") ? n : d; };

// Token de sesión de las apps (Android, Windows, Linux…): "Authorization: Bearer <token>". Es el mismo valor que la cookie fc_sid.
const bearer = req => { const m = /^Bearer\s+([0-9a-f]{64})$/i.exec(String(req.headers.authorization || "")); return m ? m[1].toLowerCase() : null; };
module.exports = { bearer, sha, esc, wrap, cookies, fix, errMsg };
