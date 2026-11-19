// Administración: discos de almacenamiento y ajustes avanzados del servidor.
const router = require("express").Router();
const si = require("systeminformation");
const { get, run } = require("../db");
const { wrap } = require("../lib/utils");
const { setting } = require("../lib/settings");
const { needAdmin } = require("../middleware/auth");
const disks = require("../services/disks");

const POLICIES = ["fill", "most_free", "balance"];
const adv = () => ({
  disk_policy: POLICIES.includes(setting("disk_policy")) ? setting("disk_policy") : "fill", disk_reserve_gb: Number(setting("disk_reserve_gb")) || 0,
  audit_enabled: setting("audit_enabled") !== "0", maintenance: setting("maintenance") === "1", maintenance_msg: setting("maintenance_msg") || "",
  max_users: Number(setting("max_users")) || 0, session_days: Number(setting("session_days")) || 7, min_password: Number(setting("min_password")) || 8,
});
router.get("/api/admin/disks", needAdmin, wrap(async (req, res) => {
  const used = new Set(disks.list().map(d => d.path)); let detected = [];
  try { detected = (await si.fsSize()).filter(f => f.mount && !/^\/(proc|sys|dev|run|boot|snap)(\/|$)/.test(f.mount) && !/^(tmpfs|devtmpfs|overlay|squashfs)$/i.test(f.type || "") && f.size > 0).map(f => ({ mount: f.mount, size: f.size, used: f.used, type: f.type })); } catch { }
  res.json({ disks: disks.list(), detected, policy: adv().disk_policy, reserve_gb: adv().disk_reserve_gb });
}));
router.post("/api/admin/disks", needAdmin, wrap(async (req, res) => { res.json({ success: true, id: await disks.add(req.body || {}) }); }));
router.post("/api/admin/disks/:id", needAdmin, wrap(async (req, res) => { disks.update(Number(req.params.id), req.body || {}); res.json({ success: true }); }));
router.delete("/api/admin/disks/:id", needAdmin, wrap(async (req, res) => { disks.remove(Number(req.params.id)); res.json({ success: true }); }));
router.post("/api/admin/users/:id/disk", needAdmin, wrap(async (req, res) => {
  const u = get("SELECT * FROM users WHERE id=?", Number(req.params.id)); if (!u) throw Error("Usuario no encontrado");
  await disks.moveUser(u, req.body.disk_id); res.json({ success: true });
}));

router.get("/api/admin/advanced", needAdmin, (req, res) => res.json(adv()));
router.post("/api/admin/advanced", needAdmin, wrap(async (req, res) => {
  const b = req.body || {}, set = (k, v) => run("INSERT OR REPLACE INTO settings VALUES(?,?)", k, String(v)), n = (v, lo, hi, d) => { v = Math.floor(Number(v)); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
  if (b.disk_policy !== undefined) { if (!POLICIES.includes(b.disk_policy)) throw Error("Política de discos inválida"); set("disk_policy", b.disk_policy); }
  if (b.disk_reserve_gb !== undefined) set("disk_reserve_gb", n(b.disk_reserve_gb, 0, 100000, 0));
  if (b.audit_enabled !== undefined) set("audit_enabled", b.audit_enabled ? "1" : "0");
  if (b.maintenance !== undefined) set("maintenance", b.maintenance ? "1" : "0");
  if (b.maintenance_msg !== undefined) set("maintenance_msg", String(b.maintenance_msg).slice(0, 200));
  if (b.max_users !== undefined) set("max_users", n(b.max_users, 0, 1e6, 0));
  if (b.session_days !== undefined) set("session_days", n(b.session_days, 1, 90, 7));
  if (b.min_password !== undefined) set("min_password", n(b.min_password, 8, 64, 8));
  res.json({ success: true, ...adv() });
}));
module.exports = router;
