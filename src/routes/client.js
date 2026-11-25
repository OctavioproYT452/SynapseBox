// API pensada para las apps nativas (Android, Windows, Linux…): información del servidor, subida reanudable, mover/renombrar sin volver a subir,
// borrado por lotes, hash de archivos y manifiesto de actualizaciones de las apps.
const router = require("express").Router();
const fs = require("fs"), fsp = fs.promises, path = require("path"), crypto = require("crypto");
const { all, run } = require("../db");
const { TMP } = require("../config");
const { wrap } = require("../lib/utils");
const { safe, nm, limitB } = require("../lib/paths");
const { usage, move } = require("../lib/storage");
const { setting } = require("../lib/settings");
const { need, needAdmin } = require("../middleware/auth");
const { space, relOf, moved, removed } = require("../services/collab");
const trash = require("../services/trash");
const ver = require("../version");

const API_LEVEL = 4; // sube cuando se añade algo que los clientes puedan necesitar detectar
const FEATURES = ["bearer", "sync-tree", "sync-since", "sync-file", "resumable-upload", "sync-move", "sync-delete-batch", "sync-hash", "download-range", "client-update", "by-type", "empty-folders"];
const PLATFORMS = ["android", "windows", "linux", "macos"];

// ---------- Información para clientes ----------
router.get("/api/client/info", wrap(async (req, res) => {
  const out = { app: "SynapseBox", version: ver.info().current, api: API_LEVEL, features: FEATURES, registration: setting("allow_registration") === "1", maintenance: setting("maintenance") === "1", platforms: PLATFORMS };
  if (req.user) {
    out.user = { username: req.user.username, uuid: req.user.uuid, admin: !!req.user.is_admin };
    out.quota = { usedBytes: await usage(req.user, true), maxMB: req.user.max_space_mb };
    out.limits = { uploadChunkMax: CHUNK_MAX, resumableTtlHours: 24 };
  }
  res.json(out);
}));

// ---------- Actualizaciones de las apps ----------
// El administrador publica, por plataforma, la última versión y dónde descargarla; las apps preguntan aquí (sin iniciar sesión).
const SEMVER = /^\d+(\.\d+){0,3}$/;
const cmp = (a, b) => { const x = a.split(".").map(Number), y = b.split(".").map(Number); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; } return 0; };
const manifest = () => { try { return JSON.parse(setting("client_updates") || "{}"); } catch { return {}; } };
router.get("/api/client/update", (req, res) => {
  const p = String(req.query.platform || "").toLowerCase(), cur = String(req.query.version || "").replace(/^v/, "");
  if (!PLATFORMS.includes(p)) return res.status(400).json({ error: "Plataforma no válida (" + PLATFORMS.join(", ") + ")" });
  const m = manifest()[p];
  if (!m) return res.json({ platform: p, published: false, update_available: false });
  const has = SEMVER.test(cur);
  res.json({ platform: p, published: true, latest: m.version, url: m.url, sha256: m.sha256 || "", notes: m.notes || "", update_available: has ? cmp(m.version, cur) > 0 : null,
    mandatory: !!(has && (m.mandatory && cmp(m.version, cur) > 0 || m.min_version && cmp(m.min_version, cur) > 0)), min_version: m.min_version || "" });
});
router.get("/api/admin/client-updates", needAdmin, (req, res) => res.json({ platforms: PLATFORMS, manifest: manifest() }));
router.put("/api/admin/client-updates", needAdmin, wrap(async (req, res) => {
  const b = req.body || {}, p = String(b.platform || "").toLowerCase();
  if (!PLATFORMS.includes(p)) throw Error("Plataforma no válida");
  const m = manifest();
  if (b.remove) delete m[p];
  else {
    const version = String(b.version || "").replace(/^v/, ""), url = String(b.url || "");
    if (!SEMVER.test(version)) throw Error("Versión no válida (ej.: 1.4.2)");
    if (!/^https:\/\/[^\s]+$/i.test(url)) throw Error("La URL de descarga debe ser https://");
    const sha = String(b.sha256 || "").toLowerCase(), min = String(b.min_version || "").replace(/^v/, "");
    if (sha && !/^[0-9a-f]{64}$/.test(sha)) throw Error("SHA-256 no válido (64 caracteres hexadecimales)");
    if (min && !SEMVER.test(min)) throw Error("Versión mínima no válida");
    m[p] = { version, url: url.slice(0, 500), sha256: sha, notes: String(b.notes || "").slice(0, 2000), mandatory: !!b.mandatory, min_version: min };
  }
  run("INSERT OR REPLACE INTO settings VALUES(?,?)", "client_updates", JSON.stringify(m));
  res.json({ success: true, manifest: m });
}));

// ---------- Mover / renombrar y borrar por lotes ----------
const exists = f => fsp.lstat(f).then(() => 1, () => 0);
router.post("/api/sync/move", need, wrap(async (req, res) => {
  const from = String(req.body?.from || ""), to = String(req.body?.to || "");
  if (!from || !to) throw Error("Faltan from y to");
  const sp = await space(req, "write"), f = safe(sp.root, from), dir = safe(sp.root, path.dirname(to) === "." ? "" : path.dirname(to)), t = path.join(dir, nm(path.basename(to)));
  if (!(await exists(f))) throw Error("El origen no existe");
  if (t === f) return res.json({ success: true });
  if ((t + path.sep).startsWith(f + path.sep)) throw Error("No puedes mover una carpeta dentro de sí misma");
  if (await exists(t)) { const e = Error("Ya existe un elemento con ese nombre en el destino"); e.status = 409; throw e; }
  await fsp.mkdir(dir, { recursive: true });
  await fsp.rename(f, t); moved(sp.owner.id, relOf(sp.owner, f), relOf(sp.owner, t));
  res.json({ success: true });
}));

router.post("/api/sync/delete-batch", need, wrap(async (req, res) => {
  const paths = Array.isArray(req.body?.paths) ? req.body.paths.map(String).slice(0, 500) : [];
  if (!paths.length) throw Error("Faltan las rutas (paths)");
  const sp = await space(req, "delete"), u = sp.owner, results = [];
  for (const rel of paths) {
    try {
      const f = safe(sp.root, rel);
      if (f === sp.root) throw Error("Ruta no válida");
      if (!(await exists(f))) { results.push({ path: rel, ok: true, missing: true }); continue; }
      const sr = path.relative(sp.base, f), t = await trash.put(u, f, req.user.username);
      for (const s of all("SELECT token,path FROM shares WHERE user_id=?", u.id)) if (s.path === sr || s.path.startsWith(sr + path.sep)) run("DELETE FROM shares WHERE token=?", s.token);
      removed(u.id, relOf(u, f)); results.push({ path: rel, ok: true, trashed: t.trashed });
    } catch (e) { results.push({ path: rel, ok: false, error: e.message }); }
  }
  await usage(u, true);
  res.json({ success: true, results });
}));

// ---------- Hash de un archivo (comprobar integridad sin descargarlo) ----------
router.get("/api/sync/hash", need, wrap(async (req, res) => {
  const sp = await space(req, "read"), f = safe(sp.root, String(req.query.path || "")), s = await fsp.stat(f).catch(() => null);
  if (!s) throw Error("No existe"); if (!s.isFile()) throw Error("No es un archivo");
  const h = crypto.createHash("sha256");
  await new Promise((ok, ko) => fs.createReadStream(f).on("data", c => h.update(c)).on("error", ko).on("end", ok));
  res.json({ path: req.query.path, size: s.size, mtime: Math.round(s.mtimeMs), sha256: h.digest("hex") });
}));

// ---------- Subida reanudable (archivos grandes o conexiones inestables) ----------
// 1) POST /api/sync/upload {path,size,mtime}  → {id, offset:0}
// 2) PATCH /api/sync/upload/:id   (Upload-Offset: <bytes ya subidos>, Content-Type: application/offset+octet-stream, cuerpo = siguiente trozo) → {offset}
//    Si la conexión se corta: GET /api/sync/upload/:id → {offset} y se sigue desde ahí.
// 3) POST /api/sync/upload/:id/commit → coloca el archivo (sobrescribe) y fija la fecha.   DELETE /api/sync/upload/:id → cancelar.
const CHUNK_MAX = 64 * 1024 * 1024, TTL = 24 * 3600e3, sessions = new Map();
const mine = (req) => { const s = sessions.get(req.params.id); if (!s || s.uid !== req.user.id) { const e = Error("Subida no encontrada o caducada"); e.status = 404; throw e; } return s; };
const drop = async (id) => { const s = sessions.get(id); sessions.delete(id); if (s) await fsp.rm(s.tmp, { force: true }).catch(() => { }); };
setInterval(() => { const n = Date.now(); for (const [id, s] of sessions) if (n - s.t > TTL) drop(id); }, 30 * 60e3).unref();
fsp.readdir(TMP).then(async l => { for (const n of l) if (n.startsWith("up-")) { const f = path.join(TMP, n), st = await fsp.stat(f).catch(() => null); if (st && Date.now() - st.mtimeMs > TTL) fsp.rm(f, { force: true }).catch(() => { }); } }).catch(() => { });

router.post("/api/sync/upload", need, wrap(async (req, res) => {
  const rel = String(req.body?.path || ""), size = Number(req.body?.size), mtime = Number(req.body?.mtime) || 0;
  if (!rel || rel.endsWith("/")) throw Error("Ruta no válida");
  if (!Number.isFinite(size) || size < 0) throw Error("Falta el tamaño (size)");
  let sp = await space(req, "create");
  const dest = path.join(safe(sp.root, path.dirname(rel) === "." ? "" : path.dirname(rel)), nm(path.basename(rel))), old = await fsp.stat(dest).catch(() => null);
  if (old?.isDirectory()) throw Error("Ya existe una carpeta con ese nombre");
  if (old) sp = await space(req, "write");
  if (size > limitB(sp.owner) - await usage(sp.owner, true) + (old ? old.size : 0)) throw Error("No hay espacio suficiente");
  if ([...sessions.values()].filter(s => s.uid === req.user.id).length >= 20) throw Error("Demasiadas subidas pendientes (máximo 20)");
  await fsp.mkdir(TMP, { recursive: true });
  const id = crypto.randomBytes(16).toString("hex"), tmp = path.join(TMP, "up-" + id);
  await fsp.writeFile(tmp, "");
  sessions.set(id, { uid: req.user.id, collab: req.query.collab || req.body?.collab || "", rel, size, mtime, tmp, offset: 0, busy: false, t: Date.now() });
  res.status(201).json({ id, offset: 0, chunkMax: CHUNK_MAX });
}));

router.get("/api/sync/upload/:id", need, wrap(async (req, res) => { const s = mine(req); res.json({ id: req.params.id, offset: s.offset, size: s.size, path: s.rel }); }));

router.patch("/api/sync/upload/:id", need, wrap(async (req, res) => {
  const s = mine(req), off = Number(req.headers["upload-offset"]);
  if (!Number.isInteger(off)) throw Error("Falta la cabecera Upload-Offset");
  if (s.busy) { const e = Error("Hay otro trozo subiéndose"); e.status = 409; throw e; }
  if (off !== s.offset) { res.status(409).json({ error: "Desfase: el servidor tiene " + s.offset + " bytes", offset: s.offset }); return req.resume(); }
  const len = Number(req.headers["content-length"] || 0);
  if (len > CHUNK_MAX) throw Error("Trozo demasiado grande (máximo " + CHUNK_MAX + " bytes)");
  if (s.offset + len > s.size) throw Error("El trozo supera el tamaño declarado");
  s.busy = true; s.t = Date.now();
  try {
    let n = 0, over = false; const ws = fs.createWriteStream(s.tmp, { flags: "a" });
    await new Promise((ok, ko) => {
      req.on("data", c => { n += c.length; if (s.offset + n > s.size && !over) { over = true; req.unpipe(ws); ws.end(); req.resume(); ko(Error("El trozo supera el tamaño declarado")); } });
      req.on("error", ko); req.on("aborted", () => ko(Error("Conexión cortada"))); ws.on("error", ko); ws.on("finish", ok); req.pipe(ws);
    }).finally(async () => { s.offset = (await fsp.stat(s.tmp).catch(() => ({ size: s.offset }))).size; }); // tras un corte, se queda lo que llegó
    res.json({ offset: s.offset, complete: s.offset === s.size });
  } finally { s.busy = false; }
}));

router.post("/api/sync/upload/:id/commit", need, wrap(async (req, res) => {
  const s = mine(req);
  if (s.busy) throw Error("Hay un trozo subiéndose");
  if (s.offset !== s.size) { res.status(409).json({ error: "Subida incompleta", offset: s.offset, size: s.size }); return; }
  req.query.collab = s.collab || req.query.collab;
  let sp = await space(req, "create");
  const dest = path.join(safe(sp.root, path.dirname(s.rel) === "." ? "" : path.dirname(s.rel)), nm(path.basename(s.rel))), old = await fsp.stat(dest).catch(() => null);
  if (old?.isDirectory()) throw Error("Ya existe una carpeta con ese nombre");
  if (old) sp = await space(req, "write");
  const u = sp.owner;
  if (s.size > limitB(u) - await usage(u, true) + (old ? old.size : 0)) throw Error("No hay espacio suficiente");
  if (req.body?.sha256 || req.query.sha256) { // comprobación de integridad opcional
    const want = String(req.body?.sha256 || req.query.sha256).toLowerCase(), h = crypto.createHash("sha256");
    await new Promise((ok, ko) => fs.createReadStream(s.tmp).on("data", c => h.update(c)).on("error", ko).on("end", ok));
    if (h.digest("hex") !== want) throw Error("El SHA-256 no coincide: la subida llegó dañada");
  }
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  await move(s.tmp, dest);
  if (Number.isFinite(s.mtime) && s.mtime > 0 && s.mtime < Date.now() + 864e5) { const t = new Date(s.mtime); await fsp.utimes(dest, t, t).catch(() => { }); }
  sessions.delete(req.params.id); await usage(u, true);
  const st = await fsp.stat(dest);
  res.json({ success: true, size: st.size, mtime: Math.round(st.mtimeMs) });
}));

router.delete("/api/sync/upload/:id", need, wrap(async (req, res) => { mine(req); await drop(req.params.id); res.json({ success: true }); }));

module.exports = router;
