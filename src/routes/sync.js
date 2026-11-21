// API para sincronizar carpetas (app de Android y otros clientes): listado recursivo y subida con sobrescritura conservando la fecha.
const router = require("express").Router();
const fs = require("fs"), fsp = fs.promises, path = require("path"), crypto = require("crypto");
const { TMP } = require("../config");
const { wrap } = require("../lib/utils");
const { safe, nm, limitB } = require("../lib/paths");
const { usage, move } = require("../lib/storage");
const { need } = require("../middleware/auth");
const { space } = require("../services/collab");

const MAX_ITEMS = 200000;
// Todo el contenido de una carpeta (archivos y subcarpetas) de una sola vez, con rutas relativas a esa carpeta.
router.get("/api/sync/tree", need, wrap(async (req, res) => {
  const sp = await space(req, "read"), start = safe(sp.root, req.query.path || ""), items = [];
  const since = Number(req.query.since) || 0, withDirs = req.query.dirs !== "0"; // ?since=<ms>: solo archivos modificados después de esa fecha; ?dirs=0: sin carpetas
  const st = await fsp.stat(start).catch(() => null);
  if (!st) return res.json({ items, exists: false });
  if (!st.isDirectory()) throw Error("La ruta remota no es una carpeta");
  const walk = async (dir, rel) => {
    for (const e of await fsp.readdir(dir, { withFileTypes: true })) {
      if (e.isSymbolicLink() || !(e.isDirectory() || e.isFile())) continue;
      if (items.length >= MAX_ITEMS) throw Error("Demasiados elementos para sincronizar (máximo 200 000)");
      const p = path.join(dir, e.name), r = rel ? rel + "/" + e.name : e.name, s = await fsp.stat(p).catch(() => null);
      if (!s) continue;
      if (e.isDirectory() ? withDirs : s.mtimeMs > since) items.push({ path: r, isDir: e.isDirectory(), size: e.isDirectory() ? 0 : s.size, mtime: Math.round(s.mtimeMs) });
      if (e.isDirectory()) await walk(p, r);
    }
  };
  await walk(start, "");
  res.json({ items, exists: true, serverTime: Date.now() });
}));

// Subida en bruto (cuerpo = contenido del archivo) que SOBRESCRIBE si existe y fija la fecha de modificación (?mtime=ms).
router.put("/api/sync/file", need, wrap(async (req, res) => {
  const rel = String(req.query.path || "");
  if (!rel || rel.endsWith("/")) throw Error("Ruta no válida");
  let sp = await space(req, "create");
  const dir = safe(sp.root, path.dirname(rel) === "." ? "" : path.dirname(rel)), dest = path.join(dir, nm(path.basename(rel))), old = await fsp.stat(dest).catch(() => null), u = sp.owner;
  if (old?.isDirectory()) throw Error("Ya existe una carpeta con ese nombre");
  if (old) sp = await space(req, "write");
  const rem = limitB(u) - await usage(u, true) + (old ? old.size : 0), len = Number(req.headers["content-length"] || 0);
  if (len > rem) throw Error("No hay espacio suficiente");
  await fsp.mkdir(TMP, { recursive: true });
  const tmp = path.join(TMP, "sync-" + crypto.randomBytes(8).toString("hex"));
  try {
    let n = 0, full = false; const ws = fs.createWriteStream(tmp);
    await new Promise((ok, ko) => {
      req.on("data", c => { n += c.length; if (n > rem && !full) { full = true; req.unpipe(ws); ws.end(); req.resume(); ko(Error("No hay espacio suficiente")); } });
      req.on("error", ko); ws.on("error", ko); ws.on("finish", ok); req.pipe(ws);
    });
    await fsp.mkdir(dir, { recursive: true });
    await move(tmp, dest);
    const m = Number(req.query.mtime);
    if (Number.isFinite(m) && m > 0 && m < Date.now() + 864e5) { const t = new Date(m); await fsp.utimes(dest, t, t).catch(() => { }); }
    await usage(u, true);
    const s = await fsp.stat(dest);
    res.json({ success: true, size: s.size, mtime: Math.round(s.mtimeMs) });
  } finally { fsp.rm(tmp, { force: true }).catch(() => { }); }
}));
module.exports = router;
