// Sesiones, límite de intentos fallidos y validaciones de cuenta.
const crypto = require("crypto");
const { get, run, now, verify } = require("../db");
const { sha } = require("../lib/utils");
const { setting } = require("../lib/settings");
const sessionMs = () => Math.min(90, Math.max(1, Number(setting("session_days")) || 7)) * 864e5;

const fails = new Map();
const locked = k => { const f = fails.get(k); return f && f.n >= (f.max || 5) && f.until > now(); };
const addFail = (k, max = 5) => { const f = fails.get(k) || { n: 0 }; f.n++; f.max = max; f.until = now() + 15 * 60e3; fails.set(k, f); };

// Crea la sesión. Devuelve el token (idéntico al valor de la cookie fc_sid) para incluirlo en el JSON de la respuesta.
// Apps nativas: enviar en el cuerpo { client: "android" | "windows" | "linux" | "macos" | "ios" | "app", device: "Mi móvil" }; entonces no se envía cookie.
const NATIVE = ["android", "windows", "linux", "macos", "ios", "app"];
function startSession(req, res, uid) {
  const t = crypto.randomBytes(32).toString("hex"), b = req.body || {}, client = String(b.client || "").toLowerCase(), native = NATIVE.includes(client);
  const ua = (native ? `[${client}] ${String(b.device || "").replace(/[\u0000-\u001f]/g, " ").slice(0, 60)} ` : "") + String(req.headers["user-agent"] || "");
  const exp = now() + sessionMs();
  run("INSERT INTO sessions VALUES(?,?,?,?,?,?)", sha(t), uid, now(), exp, req.ip, ua.trim().slice(0, 200));
  if (!native) res.set("Set-Cookie", `fc_sid=${t}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${sessionMs() / 1000}${req.secure ? "; Secure" : ""}`);
  return { token: t, token_type: "Bearer", expires_at: exp, expires_in: Math.floor(sessionMs() / 1000) };
}
function confirmPw(req, pw) { // verifica la contraseña actual con límite de intentos
  const k = "pw|" + req.user.id;
  if (locked(k)) throw Error("Demasiados intentos. Prueba de nuevo en 15 minutos.");
  if (!verify(String(pw || ""), req.user.password_hash)) { addFail(k); throw Error("La contraseña actual no es correcta"); }
  fails.delete(k);
}
function setUsername(id, name) { // el nombre solo existe en la tabla users: todo lo demás usa el UUID / id
  name = String(name || "").trim();
  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(name)) throw Error("Usuario: 3-32 caracteres (letras, números, _ . -)");
  if (get("SELECT 1 x FROM users WHERE username=? AND id<>?", name, id)) throw Error("Ese nombre de usuario ya está en uso");
  run("UPDATE users SET username=? WHERE id=?", name, id);
}
const checkPw = p => { const m = Math.max(8, Number(setting("min_password")) || 8); if (String(p || "").length < m) throw Error(`La contraseña debe tener al menos ${m} caracteres`); if (String(p).length > 1024) throw Error("Contraseña demasiado larga"); require("./enterprise").complexity(p); };
// Elimina los bloqueos de intentos fallidos ya caducados
const purgeFails = () => { for (const [k, f] of fails) if (f.until < now()) fails.delete(k); };

module.exports = { fails, locked, addFail, startSession, confirmPw, setUsername, checkPw, purgeFails };
