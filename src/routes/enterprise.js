// Funciones para empresas (2.27.0): ajustes, webhooks, métricas Prometheus y exportes CSV.
const router = require("express").Router();
const crypto = require("crypto");
const { get, all, run } = require("../db");
const { wrap } = require("../lib/utils");
const { needAdmin } = require("../middleware/auth");
const { setting } = require("../lib/settings");
const ent = require("../services/enterprise");
const ver = require("../version");

const set = (k, v) => run("INSERT OR REPLACE INTO settings VALUES(?,?)", k, String(v));
const view = () => ({
  pw_complex: setting("pw_complex") === "1", admin_ip_allow: setting("admin_ip_allow") || "",
  webhook_url: setting("webhook_url") || "", webhook_secret_set: !!setting("webhook_secret"), webhook_status: ent.status,
  metrics: !!process.env.METRICS_TOKEN, legal_operator: setting("legal_operator") || "", legal_contact: setting("legal_contact") || ""
});
router.get("/api/admin/enterprise", needAdmin, (req, res) => res.json(view()));
// Pública: datos del operador y versión para la página legal
router.get("/api/legal", (req, res) => res.json({ operator: setting("legal_operator") || "", contact: setting("legal_contact") || "", version: ver.info().current, updated: "2026-11-27" }));
router.post("/api/admin/enterprise", needAdmin, wrap(async (req, res) => {
  const b = req.body || {}; let newSecret;
  if (b.admin_ip_allow !== undefined) {
    const txt = String(b.admin_ip_allow).trim().slice(0, 2000), list = ent.parseList(txt);
    if (list.length && !ent.matches(list, req.ip)) throw Error(`Tu IP actual (${req.ip}) no está en la lista: te quedarías sin acceso. Añádela primero.`);
    set("admin_ip_allow", txt);
  }
  for (const k of ["legal_operator", "legal_contact"]) if (b[k] !== undefined) set(k, String(b[k]).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 200));
  if (b.pw_complex !== undefined) set("pw_complex", b.pw_complex ? "1" : "0");
  if (b.webhook_url !== undefined) {
    const u = String(b.webhook_url).trim();
    if (u) { ent.checkUrl(u); if (u.length > 500) throw Error("URL demasiado larga"); }
    set("webhook_url", u);
    if (u && !setting("webhook_secret")) set("webhook_secret", newSecret = ent.newSecret());
  }
  if (b.webhook_regen) set("webhook_secret", newSecret = ent.newSecret());
  res.json({ success: true, ...view(), new_secret: newSecret });
}));
router.post("/api/admin/enterprise/webhook-test", needAdmin, wrap(async (req, res) => {
  if (!setting("webhook_url")) throw Error("Configura primero la URL del webhook");
  const ok = await ent.post("test", { message: "Prueba de SynapseBox", by: req.user.username });
  res.json({ success: ok, status: ent.status });
}));

// ---- exportes CSV (compatibles con Excel: BOM UTF-8; las celdas que empiezan por = + - @ se neutralizan) ----
const cell = v => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n\r;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const csv = (res, name, head, rows) => { res.set({ "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" }); res.send("﻿" + [head, ...rows].map(r => r.map(cell).join(",")).join("\r\n") + "\r\n"); };
const iso = t => t ? new Date(t).toISOString() : "";
router.get("/api/admin/export/audit.csv", needAdmin, (req, res) => csv(res, "auditoria.csv", ["fecha", "usuario", "accion", "detalle", "ip"], all("SELECT ts,user,action,detail,ip FROM audit ORDER BY ts DESC").map(r => [iso(r.ts), r.user, r.action, r.detail, r.ip])));
router.get("/api/admin/export/users.csv", needAdmin, (req, res) => csv(res, "usuarios.csv",
  ["usuario", "admin", "suspendido", "2fa", "cuota_mb", "usado_mb", "creado", "ultimo_acceso", "ultima_ip"],
  all("SELECT username,is_admin,suspended,totp_on,max_space_mb,used_bytes,created_at,last_login,last_ip FROM users ORDER BY username").map(u =>
    [u.username, u.is_admin ? "si" : "no", u.suspended ? "si" : "no", u.totp_on ? "si" : "no", u.max_space_mb, Math.round((u.used_bytes || 0) / 1048576 * 100) / 100, iso(u.created_at), iso(u.last_login), u.last_ip])));
router.get("/api/admin/compliance", needAdmin, (req, res) => {
  const n = q => get(q).n, u = n("SELECT COUNT(*) n FROM users");
  res.json({
    users: u, admins: n("SELECT COUNT(*) n FROM users WHERE is_admin=1"), suspended: n("SELECT COUNT(*) n FROM users WHERE suspended=1"),
    with_2fa: n("SELECT COUNT(*) n FROM users WHERE totp_on=1"), admins_without_2fa: n("SELECT COUNT(*) n FROM users WHERE is_admin=1 AND IFNULL(totp_on,0)=0"),
    inactive_90d: n(`SELECT COUNT(*) n FROM users WHERE IFNULL(last_login,created_at)<${Date.now() - 90 * 864e5}`),
    over_90pct_quota: n("SELECT COUNT(*) n FROM users WHERE max_space_mb>0 AND used_bytes>max_space_mb*1048576*0.9"),
    policy: { min_password: Math.max(8, Number(setting("min_password")) || 8), complexity: setting("pw_complex") === "1", session_days: Number(setting("session_days")) || 7, admin_ip_restricted: !!(setting("admin_ip_allow") || "").trim(), audit: setting("audit_enabled") !== "0", webhook: !!setting("webhook_url") }
  });
});

// ---- métricas Prometheus: GET /metrics con "Authorization: Bearer <METRICS_TOKEN>" (desactivado si la variable no existe) ----
router.get("/metrics", (req, res) => {
  const tk = process.env.METRICS_TOKEN; if (!tk) return res.status(404).end();
  const h = String(req.headers.authorization || "").replace(/^Bearer\s+/i, ""), a = Buffer.from(h), b = Buffer.from(tk);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).end();
  const n = q => get(q).n, m = process.memoryUsage();
  const L = [["synapsebox_info", `{version="${ver.info().current}"}`, 1], ["synapsebox_uptime_seconds", "", Math.round(process.uptime())],
    ["synapsebox_users", "", n("SELECT COUNT(*) n FROM users")], ["synapsebox_users_suspended", "", n("SELECT COUNT(*) n FROM users WHERE suspended=1")],
    ["synapsebox_users_with_2fa", "", n("SELECT COUNT(*) n FROM users WHERE totp_on=1")], ["synapsebox_storage_used_bytes", "", n("SELECT IFNULL(SUM(used_bytes),0) n FROM users")],
    ["synapsebox_sessions_active", "", n(`SELECT COUNT(*) n FROM sessions WHERE expires_at>${Date.now()}`)], ["synapsebox_shares", "", n("SELECT COUNT(*) n FROM shares")],
    ["synapsebox_process_resident_memory_bytes", "", m.rss]];
  res.type("text/plain; version=0.0.4").send(L.map(([k, l, v]) => `# TYPE ${k} gauge\n${k}${l} ${v}`).join("\n") + "\n");
});
module.exports = router;
