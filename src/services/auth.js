// Sesiones, límite de intentos fallidos y validaciones de cuenta.
const crypto = require("crypto");
const { get, run, now, verify } = require("../db");
const { sha } = require("../lib/utils");
const { SESSION_MS } = require("../config");

const fails = new Map();
const locked = k => { const f = fails.get(k); return f && f.n >= (f.max || 5) && f.until > now(); };
const addFail = (k, max = 5) => { const f = fails.get(k) || { n: 0 }; f.n++; f.max = max; f.until = now() + 15 * 60e3; fails.set(k, f); };

function startSession(req, res, uid) {
  const t = crypto.randomBytes(32).toString("hex");
  run("INSERT INTO sessions VALUES(?,?,?,?,?,?)", sha(t), uid, now(), now() + SESSION_MS, req.ip, String(req.headers["user-agent"] || "").slice(0, 200));
  res.set("Set-Cookie", `fc_sid=${t}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MS / 1000}${req.secure ? "; Secure" : ""}`);
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
const checkPw = p => { if (String(p || "").length < 8) throw Error("La contraseña debe tener al menos 8 caracteres"); };
// Elimina los bloqueos de intentos fallidos ya caducados
const purgeFails = () => { for (const [k, f] of fails) if (f.until < now()) fails.delete(k); };

module.exports = { fails, locked, addFail, startSession, confirmPw, setUsername, checkPw, purgeFails };
