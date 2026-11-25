// Administración: servidor, usuarios, archivos de usuarios, ajustes, enlaces y comunidad de temas.
const router = require("express").Router();
const fsp = require("fs").promises, os = require("os"), path = require("path"), si = require("systeminformation");
const { get, all, run, now, hash } = require("../db");
const { HOSTING } = require("../config");
const { wrap } = require("../lib/utils");
const { setting } = require("../lib/settings");
const { safe, base } = require("../lib/paths");
const { usage } = require("../lib/storage");
const { serve } = require("../lib/serve");
const { needAdmin } = require("../middleware/auth");
const { checkPw, setUsername } = require("../services/auth");
const { relOf, removed } = require("../services/collab");
const ver = require("../version");
const ai = require("../ai");
const disks = require("../services/disks");

router.get("/api/admin/server", needAdmin, wrap(async (req, res) => {
  const [l, m, d] = await Promise.all([si.currentLoad(), si.mem(), si.fsSize()]), dk = d[0] || {};
  res.json({
    cpu: l.currentLoad, memUsed: m.total - m.available, memTotal: m.total, diskUsed: dk.used, diskTotal: dk.size, uptime: os.uptime(),
    users: get("SELECT COUNT(*) n FROM users").n, stored: get("SELECT COALESCE(SUM(used_bytes),0) n FROM users").n,
    version: ver.info().current, shares: get("SELECT COUNT(*) n FROM shares").n, sessions: get("SELECT COUNT(*) n FROM sessions WHERE expires_at>?", now()).n
  });
}));
router.get("/api/admin/users", needAdmin, wrap(async (req, res) => {
  const us = all("SELECT id,uuid,username,is_admin,suspended,max_space_mb,used_bytes,used_at,created_at,last_login,last_ip,ai_limit,ai_period,COALESCE(disk_id,1) disk_id FROM users ORDER BY username");
  for (const u of us) { await usage(u); u.disk_name = disks.nameOf(u.disk_id); }
  const on = ai.enabled();
  res.json({ ai: on, users: us.map(({ used_at, ...u }) => { if (on) { const l = ai.limitFor(u); u.ai_eff_limit = l.limit; u.ai_eff_period = l.period; u.ai_used = ai.usedBy(u.id, l.period); } return u; }), me: req.user.id, disks: disks.list().map(d => ({ id: d.id, name: d.name, kind: d.kind, online: d.online })) });
}));
router.post("/api/admin/users", needAdmin, wrap(async (req, res) => {
  const { username, password, max_space_mb, is_admin } = req.body;
  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username || "")) throw Error("Usuario inválido");
  checkPw(password);
  if (get("SELECT 1 x FROM users WHERE username=?", username)) throw Error("Ese usuario ya existe");
  const q = Number(max_space_mb);
  const quota = Number.isFinite(q) ? (q < 0 ? -1 : q) : 100, want = Number(req.body.disk_id), dk = want && disks.list().some(d => d.id === want && d.online) ? want : disks.assign(quota);
  run("INSERT INTO users(username,password_hash,is_admin,max_space_mb,created_at,disk_id) VALUES(?,?,?,?,?,?)", username, hash(password), is_admin ? 1 : 0, quota, now(), dk);
  await fsp.mkdir(path.join(disks.rootOf(dk), get("SELECT uuid FROM users WHERE username=?", username).uuid), { recursive: true });
  res.json({ success: true });
}));
router.post("/api/admin/users/:id", needAdmin, wrap(async (req, res) => {
  const t = get("SELECT * FROM users WHERE id=?", req.params.id), b = req.body;
  if (!t) throw Error("Usuario no encontrado");
  if (t.id === req.user.id && (b.is_admin === false || b.suspended === true)) throw Error("No puedes quitarte el rol de admin ni suspenderte");
  if (b.username !== undefined && b.username !== t.username) setUsername(t.id, b.username);
  if (b.max_space_mb !== undefined) { const v = Number(b.max_space_mb); if (!Number.isFinite(v)) throw Error("Límite inválido"); run("UPDATE users SET max_space_mb=? WHERE id=?", v < 0 ? -1 : v, t.id); }
  if (b.ai_limit !== undefined) { // null/"" = usar el límite general; -1 = ilimitado; 0 = sin acceso a la IA
    if (b.ai_limit === null || b.ai_limit === "") run("UPDATE users SET ai_limit=NULL WHERE id=?", t.id);
    else { const v = Math.floor(Number(b.ai_limit)); if (!Number.isFinite(v) || v < -1 || v > 1e6) throw Error("Límite de IA inválido"); run("UPDATE users SET ai_limit=? WHERE id=?", v, t.id); }
  }
  if (b.ai_period !== undefined) run("UPDATE users SET ai_period=? WHERE id=?", b.ai_period === "day" || b.ai_period === "hour" ? b.ai_period : null, t.id);
  if (b.is_admin !== undefined) run("UPDATE users SET is_admin=? WHERE id=?", b.is_admin ? 1 : 0, t.id);
  if (b.suspended !== undefined) { run("UPDATE users SET suspended=? WHERE id=?", b.suspended ? 1 : 0, t.id); if (b.suspended) run("DELETE FROM sessions WHERE user_id=?", t.id); }
  if (b.password) { checkPw(b.password); run("UPDATE users SET password_hash=? WHERE id=?", hash(b.password), t.id); b.logout = true; }
  if (b.logout) run("DELETE FROM sessions WHERE user_id=? AND token<>?", t.id, req.sid);
  res.json({ success: true });
}));
router.delete("/api/admin/users/:id", needAdmin, wrap(async (req, res) => {
  const t = get("SELECT * FROM users WHERE id=?", req.params.id);
  if (!t) throw Error("Usuario no encontrado");
  if (t.id === req.user.id) throw Error("No puedes borrar tu propia cuenta");
  run("DELETE FROM users WHERE id=?", t.id);
  await fsp.rm(base(t), { recursive: true, force: true }); await require("../services/trash").wipeUser(t.uuid).catch(() => { });
  res.json({ success: true });
}));

const target = req => { const u = get("SELECT * FROM users WHERE username=?", String(req.query.user || req.body.user)); if (!u) throw Error("Usuario no encontrado"); return u; };
router.get("/api/admin/files", needAdmin, wrap(async (req, res) => {
  const dir = safe(base(target(req)), req.query.path);
  const es = await fsp.readdir(dir, { withFileTypes: true }).catch(() => []);
  const items = [];
  for (const e of es) { const s = await fsp.stat(path.join(dir, e.name)).catch(() => null); if (s) items.push({ name: e.name, isDir: s.isDirectory(), size: s.isDirectory() ? 0 : s.size, mtime: s.mtimeMs }); }
  res.json({ items });
}));
router.get("/api/admin/file", needAdmin, wrap(async (req, res) => serve(res, safe(base(target(req)), req.query.path), req.query.dl)));
router.post("/api/admin/delete-file", needAdmin, wrap(async (req, res) => {
  const u = target(req), f = safe(base(u), req.body.path);
  if (f === base(u)) throw Error("Ruta inválida");
  await require("../services/trash").put(u, f, req.user.username + " (admin)"); removed(u.id, relOf(u, f)); await usage(u, true);
  res.json({ success: true });
}));
// 2.26.1: gestión completa de los archivos de un usuario (la usa el gestor de la app de Android). Quedan en el registro de actividad (si está activado) como el resto de acciones de administración.
const fs = require("fs"), crypto = require("crypto");
const { nm } = require("../lib/paths"), { TMP } = require("../config"), { uniq, move } = require("../lib/storage");
router.post("/api/admin/mkdir", needAdmin, wrap(async (req, res) => {
  const u = target(req), d = safe(safe(base(u), req.body.path), nm(req.body.name));
  await fsp.mkdir(d); res.json({ success: true });
}));
router.post("/api/admin/rename", needAdmin, wrap(async (req, res) => {
  const u = target(req), f = safe(base(u), req.body.path);
  if (f === base(u)) throw Error("Ruta inválida");
  const to = path.join(path.dirname(f), nm(req.body.name));
  if (await fsp.access(to).then(() => 1, () => 0)) throw Error("Ya existe un elemento con ese nombre");
  await fsp.rename(f, to); res.json({ success: true });
}));
router.put("/api/admin/upload", needAdmin, wrap(async (req, res) => {
  const u = target(req), rel = String(req.query.path || "");
  if (!rel || rel.endsWith("/")) throw Error("Ruta no válida");
  const dir = safe(base(u), path.dirname(rel) === "." ? "" : path.dirname(rel)), name = nm(path.basename(rel));
  await fsp.mkdir(dir, { recursive: true }); await fsp.mkdir(TMP, { recursive: true });
  const tmp = path.join(TMP, "adm-" + crypto.randomBytes(8).toString("hex"));
  try {
    await new Promise((ok, no) => { const ws = fs.createWriteStream(tmp); req.pipe(ws); ws.on("finish", ok); ws.on("error", no); req.on("error", no); req.on("aborted", () => no(Error("Subida cancelada"))); });
    const final = await uniq(dir, name); await move(tmp, path.join(dir, final)); await usage(u, true);
    res.json({ success: true, name: final });
  } finally { await fsp.rm(tmp, { force: true }).catch(() => {}); }
}));
router.get("/api/admin/settings", needAdmin, (req, res) => res.json({ allow_registration: setting("allow_registration") === "1", default_quota_mb: Number(setting("default_quota_mb")), announcement: setting("announcement") || "", trash: require("../services/trash").config() }));
router.post("/api/admin/settings", needAdmin, wrap(async (req, res) => {
  const q = Number(req.body.default_quota_mb);
  if (!Number.isFinite(q)) throw Error("Cuota inválida");
  run("UPDATE settings SET value=? WHERE key='allow_registration'", req.body.allow_registration ? "1" : "0");
  run("UPDATE settings SET value=? WHERE key='default_quota_mb'", String(q));
  run("INSERT OR REPLACE INTO settings VALUES('announcement',?)", String(req.body.announcement || "").slice(0, 300));
  const t = req.body.trash;
  if (t) {
    const d = Math.floor(Number(t.days)), c = Math.floor(Number(t.capMB));
    if (!(d >= 1 && d <= 365)) throw Error("Los días de la papelera deben estar entre 1 y 365");
    if (!Number.isFinite(c)) throw Error("Tope de papelera inválido");
    run("INSERT OR REPLACE INTO settings VALUES('trash_enabled',?)", t.enabled ? "1" : "0");
    run("INSERT OR REPLACE INTO settings VALUES('trash_days',?)", String(d));
    run("INSERT OR REPLACE INTO settings VALUES('trash_cap_mb',?)", String(c));
  }
  res.json({ success: true });
}));
router.get("/api/admin/shares", needAdmin, (req, res) => res.json({ shares: all("SELECT s.token,s.path,s.expires_at,s.created_at,s.pw IS NOT NULL locked,u.username FROM shares s JOIN users u ON u.id=s.user_id ORDER BY s.created_at DESC LIMIT 300") }));
router.post("/api/admin/shares/revoke", needAdmin, (req, res) => { run("DELETE FROM shares WHERE token=?", String(req.body.token)); res.json({ success: true }); });
router.post("/api/admin/community/unpublish", needAdmin, (req, res) => { run("UPDATE user_themes SET public=0 WHERE rowid=?", Number(req.body.id)); res.json({ success: true }); });
module.exports = router;
