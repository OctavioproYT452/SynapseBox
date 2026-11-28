// Registro, inicio y cierre de sesión, y ajustes de la cuenta propia.
const router = require("express").Router();
const { get, run, now, hash, verify } = require("../db");
const fsp = require("fs").promises, path = require("path");
const { HOSTING } = require("../config");
const { sha, wrap, cookies, bearer } = require("../lib/utils");
const { setting } = require("../lib/settings");
const { need } = require("../middleware/auth");
const { locked, addFail, fails, startSession, confirmPw, setUsername, checkPw } = require("../services/auth");
const ver = require("../version");
const ai = require("../ai");
const tf = require("../services/twofa");
const disks = require("../services/disks");

const DUMMY_HASH = hash("synapsebox-dummy-password");
router.post("/api/register", wrap(async (req, res) => {
  if (setting("allow_registration") !== "1") throw Error("El registro está desactivado");
  const { username, password, password2 } = req.body;
  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username || "")) throw Error("Usuario: 3-32 caracteres (letras, números, _ . -)");
  if (password !== password2) throw Error("Las contraseñas no coinciden");
  checkPw(password);
  if (get("SELECT 1 x FROM users WHERE username=?", username)) throw Error("Ese usuario ya existe");
  const maxU = Number(setting("max_users")) || 0; if (maxU && get("SELECT COUNT(*) n FROM users").n >= maxU) throw Error("El servidor ha alcanzado el máximo de usuarios");
  const first = get("SELECT COUNT(*) n FROM users").n === 0; // el primer usuario es administrador
  const r = run("INSERT INTO users(username,password_hash,is_admin,max_space_mb,created_at) VALUES(?,?,?,?,?)",
    username, hash(password), first ? 1 : 0, Number(setting("default_quota_mb")) || 100, now());
  const id = Number(r.lastInsertRowid), dk = disks.assign(Number(setting("default_quota_mb")) || 100);
  run("UPDATE users SET disk_id=? WHERE id=?", dk, id);
  await fsp.mkdir(path.join(disks.rootOf(dk), get("SELECT uuid FROM users WHERE id=?", id).uuid), { recursive: true });
  require("../services/enterprise").emit("user.registered", { username, id });
  const tk = startSession(req, res, id);
  req.user = { username };
  res.json({ success: true, ...tk, codes: tf.makeCodes(id) }); // códigos de recuperación: se muestran una sola vez
}));

router.post("/api/login", (req, res) => {
  const username = String(req.body.username || ""), password = String(req.body.password || "");
  const key = req.ip + "|" + username.toLowerCase(), ipKey = "ip|" + req.ip;
  if (locked(key) || locked(ipKey)) return res.status(429).json({ error: "Demasiados intentos. Prueba de nuevo en 15 minutos." });
  if (password.length > 1024 || username.length > 64) return res.status(400).json({ error: "Credenciales inválidas" });
  const u = get("SELECT * FROM users WHERE username=?", username);
  if (!u) verify(password, DUMMY_HASH); // mismo coste que un usuario real: no se puede averiguar qué usuarios existen por el tiempo de respuesta
  if (!u || !verify(password, u.password_hash)) { addFail(key); addFail(ipKey, 20); return res.status(401).json({ error: "Credenciales inválidas" }); }
  if (u.suspended) return res.status(403).json({ error: "Cuenta suspendida. Contacta con un administrador." });
  fails.delete(key);
  if (u.totp_on) return res.json({ success: true, need2fa: true, ticket: tf.newTicket(u.id) }); // falta el segundo factor
  finish(req, res, u);
});
function finish(req, res, u) {
  run("UPDATE users SET last_login=?,last_ip=? WHERE id=?", now(), req.ip, u.id);
  const tk = startSession(req, res, u.id); req.user = u;
  res.json({ success: true, admin: !!u.is_admin, ...tk, user: { username: u.username, uuid: u.uuid, admin: !!u.is_admin } });
}
router.post("/api/login/2fa", (req, res) => {
  const t = tf.tickets.get(String(req.body.ticket || "")), key = "2fa|" + req.ip;
  if (locked(key)) return res.status(429).json({ error: "Demasiados intentos. Prueba de nuevo en 15 minutos." });
  if (!t || t.exp < now()) return res.status(401).json({ error: "La verificación caducó. Vuelve a iniciar sesión.", expired: true });
  const u = get("SELECT * FROM users WHERE id=?", t.uid), code = String(req.body.code || "");
  const rc = tf.findCode(code);
  const ok = u && !u.suspended && (tf.checkTotp(u, code) || (rc && rc.user_id === u.id && (tf.useCode(code), true)));
  if (!ok) {
    addFail(key); t.n++;
    if (t.n >= 5) tf.tickets.delete(req.body.ticket);
    return res.status(401).json({ error: "Código incorrecto" });
  }
  tf.tickets.delete(req.body.ticket); fails.delete(key);
  finish(req, res, u);
});

const logout = (req, res) => {
  const t = req.headers.authorization ? bearer(req) : cookies(req).fc_sid; // token de app o cookie del navegador
  if (t) run("DELETE FROM sessions WHERE token=?", sha(t));
  if (!req.headers.authorization) res.set("Set-Cookie", "fc_sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
};
router.post("/api/logout", (req, res) => { logout(req, res); res.json({ success: true }); });
router.get("/logout", (req, res) => { logout(req, res); res.redirect("/"); });

router.get("/api/session", (req, res) => res.json(req.user ? { logged: true, via: req.viaToken ? "token" : "cookie", user: req.user.username, admin: !!req.user.is_admin, uuid: req.user.uuid, update: req.user.is_admin ? ver.info() : null, registration: false, announcement: setting("announcement") || "", ai: ai.enabled() } : { logged: false, registration: setting("allow_registration") === "1" }));

router.post("/api/username", need, wrap(async (req, res) => {
  confirmPw(req, req.body.password);
  setUsername(req.user.id, req.body.username);
  res.json({ success: true, user: String(req.body.username).trim() });
}));
router.post("/api/password", need, wrap(async (req, res) => {
  const { current, next, next2 } = req.body;
  confirmPw(req, current);
  if (next2 !== undefined && next !== next2) throw Error("Las contraseñas nuevas no coinciden");
  checkPw(next);
  run("UPDATE users SET password_hash=? WHERE id=?", hash(next), req.user.id);
  run("DELETE FROM sessions WHERE user_id=? AND token<>?", req.user.id, req.sid); // cierra las demás sesiones
  res.json({ success: true });
}));
router.post("/api/sessions/revoke-others", need, (req, res) => { run("DELETE FROM sessions WHERE user_id=? AND token<>?", req.user.id, req.sid); res.json({ success: true }); });

module.exports = router;
