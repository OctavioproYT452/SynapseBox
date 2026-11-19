// Extras: copia de seguridad de la base de datos, registro de auditoría y gestión de las propias sesiones.
const router = require("express").Router();
const fs = require("fs"), path = require("path");
const db = require("../db/connection");
const { all, run, now } = require("../db");
const { TMP } = require("../config");
const { wrap, sha } = require("../lib/utils");
const { need, needAdmin } = require("../middleware/auth");
const audit = require("../services/audit");

router.get("/api/admin/audit", needAdmin, (req, res) => res.json({ enabled: audit.enabled(), items: audit.recent(150) }));
router.post("/api/admin/audit/clear", needAdmin, (req, res) => { audit.clear(); res.json({ success: true }); });
// Copia consistente de la base de datos (usuarios, ajustes, enlaces…). No incluye los archivos de los usuarios. Contiene hashes de contraseñas: guárdala en un sitio seguro.
router.get("/api/admin/backup", needAdmin, wrap(async (req, res) => {
  fs.mkdirSync(TMP, { recursive: true });
  const f = path.join(TMP, "backup-" + Date.now() + ".db");
  db.exec("VACUUM INTO '" + f.replace(/'/g, "''") + "'");
  audit.log(req, "backup", "descarga de la base de datos");
  res.set({ "Cache-Control": "no-store" });
  res.download(f, `synapsebox-${new Date().toISOString().slice(0, 10)}.db`, () => fs.rm(f, { force: true }, () => { }));
}));

// Mis sesiones: ver dónde está abierta mi cuenta y cerrar las que no reconozca
const short = s => s.slice(0, 16);
router.get("/api/sessions", need, (req, res) => {
  const rows = all("SELECT token,created_at,expires_at,ip,ua FROM sessions WHERE user_id=? AND expires_at>? ORDER BY created_at DESC", req.user.id, now());
  res.json({ sessions: rows.map(r => ({ id: short(r.token), current: r.token === req.sid, created_at: r.created_at, ip: r.ip, ua: r.ua })) });
});
router.post("/api/sessions/revoke", need, wrap(async (req, res) => {
  if (req.body.others) run("DELETE FROM sessions WHERE user_id=? AND token<>?", req.user.id, req.sid);
  else { const id = String(req.body.id || ""); if (!/^[0-9a-f]{16}$/.test(id)) throw Error("Sesión inválida"); run("DELETE FROM sessions WHERE user_id=? AND token<>? AND substr(token,1,16)=?", req.user.id, req.sid, id); }
  res.json({ success: true });
}));
module.exports = router;
