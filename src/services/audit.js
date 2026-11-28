// Registro de auditoría: qué hizo cada administrador y desde qué IP (se guardan 90 días y un máximo de 5000 filas).
const { run, all, now } = require("../db");
const { setting } = require("../lib/settings");
const enabled = () => setting("audit_enabled") !== "0"; // el administrador puede desactivarlo (menos escrituras en disco)
const SKIP = /^\/api\/admin\/(ai|ads)\/test$/;
const clean = s => String(s ?? "").replace(/[\u0000-\u001f]/g, " ").slice(0, 200);
const ent = require("./enterprise");
const log = (req, action, detail = "") => { ent.emit("admin.action", { user: clean(req.user?.username), action: clean(action), detail: clean(detail), ip: clean(req.ip) }); if (!enabled()) return; try { run("INSERT INTO audit VALUES(?,?,?,?,?)", now(), clean(req.user?.username), clean(action), clean(detail), clean(req.ip)); } catch { } };
// Middleware: anota toda acción de administración que cambia algo y termina bien
const middleware = (req, res, next) => {
  if (req.method !== "GET" && req.path.startsWith("/api/admin/") && !SKIP.test(req.path))
    res.on("finish", () => { if (res.statusCode < 400) log(req, req.method + " " + req.path.replace("/api/admin/", ""), req.body?.username || req.body?.user || ""); });
  next();
};
const recent = (n = 100) => all("SELECT ts,user,action,detail,ip FROM audit ORDER BY ts DESC LIMIT ?", n);
const purge = () => { run("DELETE FROM audit WHERE ts<?", now() - 90 * 864e5); run("DELETE FROM audit WHERE rowid NOT IN (SELECT rowid FROM audit ORDER BY ts DESC LIMIT 5000)"); };
const clear = () => run("DELETE FROM audit");
module.exports = { enabled, clear, log, middleware, recent, purge };
