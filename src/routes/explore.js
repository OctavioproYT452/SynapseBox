// Exploración: búsqueda, estadísticas de uso, favoritos y archivos recientes.
const router = require("express").Router();
const fsp = require("fs").promises, path = require("path");
const { get, all, run } = require("../db");
const { wrap } = require("../lib/utils");
const { safe, base, fileOf } = require("../lib/paths");
const { need } = require("../middleware/auth");

router.get("/api/search", need, wrap(async (req, res) => {
  const q = String(req.query.q || "").toLowerCase().trim(), b = base(req.user), out = [], stack = [b];
  if (q.length < 2) throw Error("Escribe al menos 2 caracteres");
  while (stack.length && out.length < 200) {
    const d = stack.pop(), es = await fsp.readdir(d, { withFileTypes: true }).catch(() => []);
    for (const e of es) {
      const p = path.join(d, e.name);
      if (e.name.toLowerCase().includes(q)) { const s = await fsp.stat(p).catch(() => null); if (s) out.push({ name: e.name, path: path.relative(b, p), isDir: s.isDirectory(), size: s.isDirectory() ? 0 : s.size, mtime: s.mtimeMs }); }
      if (e.isDirectory()) stack.push(p);
    }
  }
  res.json({ items: out });
}));

router.get("/api/stats", need, wrap(async (req, res) => {
  const T = { "Imágenes": ".png .jpg .jpeg .gif .webp .bmp .svg", "Vídeo": ".mp4 .webm .mov .mkv", "Audio": ".mp3 .wav .flac .m4a .aac .ogg", "Documentos": ".pdf .doc .docx .xls .xlsx .ppt .pptx .txt .md .csv .odt" };
  const out = { "Imágenes": 0, "Vídeo": 0, "Audio": 0, "Documentos": 0, "Otros": 0 }, stack = [base(req.user)];
  while (stack.length) {
    const d = stack.pop(), es = await fsp.readdir(d, { withFileTypes: true }).catch(() => []);
    for (const e of es) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { stack.push(p); continue; }
      const s = await fsp.stat(p).catch(() => null); if (!s) continue;
      const x = path.extname(e.name).toLowerCase();
      out[Object.keys(T).find(k => T[k].split(" ").includes(x)) || "Otros"] += s.size;
    }
  }
  res.json({ stats: out });
}));

router.post("/api/fav", need, wrap(async (req, res) => {
  const p = path.relative(base(req.user), fileOf(req)), had = get("SELECT 1 x FROM favs WHERE user_id=? AND path=?", req.user.id, p);
  if (had) run("DELETE FROM favs WHERE user_id=? AND path=?", req.user.id, p); else run("INSERT INTO favs VALUES(?,?)", req.user.id, p);
  res.json({ fav: !had });
}));
router.get("/api/favs", need, wrap(async (req, res) => {
  const b = base(req.user), items = [];
  for (const { path: p } of all("SELECT path FROM favs WHERE user_id=?", req.user.id)) {
    const s = await fsp.stat(safe(b, p)).catch(() => null);
    if (!s) { run("DELETE FROM favs WHERE user_id=? AND path=?", req.user.id, p); continue; }
    items.push({ name: path.basename(p), path: p, isDir: s.isDirectory(), size: s.isDirectory() ? 0 : s.size, mtime: s.mtimeMs });
  }
  res.json({ items });
}));
router.get("/api/recent", need, wrap(async (req, res) => {
  const b = base(req.user), top = [], stack = [b];
  while (stack.length) {
    const d = stack.pop(), es = await fsp.readdir(d, { withFileTypes: true }).catch(() => []);
    for (const e of es) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { stack.push(p); continue; }
      const s = await fsp.stat(p).catch(() => null); if (!s) continue;
      top.push({ name: e.name, path: path.relative(b, p), isDir: false, size: s.size, mtime: s.mtimeMs });
      if (top.length > 60) { top.sort((a, c) => c.mtime - a.mtime); top.length = 30; }
    }
  }
  res.json({ items: top.sort((a, c) => c.mtime - a.mtime).slice(0, 30) });
}));

// 2.26.0: recorre los archivos del usuario (devuelve {name,path,size,mtime}).
async function walk(b, fn) {
  const stack = [b];
  while (stack.length) {
    const d = stack.pop(), es = await fsp.readdir(d, { withFileTypes: true }).catch(() => []);
    for (const e of es) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { stack.push(p); continue; }
      if (!e.isFile()) continue;
      const s = await fsp.stat(p).catch(() => null);
      if (s && (await fn({ name: e.name, abs: p, path: path.relative(b, p), size: s.size, mtime: s.mtimeMs })) === false) return;
    }
  }
}
const hashOf = f => new Promise(ok => { const h = require("crypto").createHash("sha1"); require("fs").createReadStream(f).on("data", c => h.update(c)).on("end", () => ok(h.digest("hex"))).on("error", () => ok(null)); });

// Archivos de un tipo (images, video, audio, docs, archives, code), de más nuevo a más antiguo.
const TYPES = { images: ".png .jpg .jpeg .gif .webp .bmp .svg .heic", video: ".mp4 .webm .mov .mkv .avi", audio: ".mp3 .wav .flac .m4a .aac .ogg", docs: ".pdf .doc .docx .xls .xlsx .ppt .pptx .txt .md .csv .odt", archives: ".zip .rar .7z .tar .gz .tgz" };
router.get("/api/by-type", need, wrap(async (req, res) => {
  const t = String(req.query.type || "images"), ext = TYPES[t];
  if (!ext) throw Error("Tipo no válido: " + Object.keys(TYPES).join(", "));
  const set = new Set(ext.split(" ")), out = [];
  await walk(base(req.user), f => { if (set.has(path.extname(f.name).toLowerCase())) { out.push({ name: f.name, path: f.path, isDir: false, size: f.size, mtime: f.mtime }); if (out.length > 600) { out.sort((a, c) => c.mtime - a.mtime); out.length = 300; } } });
  res.json({ type: t, items: out.sort((a, c) => c.mtime - a.mtime).slice(0, 300) });
}));

// Carpetas vacías (sin archivos ni subcarpetas con contenido), para ordenar.
router.get("/api/empty-folders", need, wrap(async (req, res) => {
  const b = base(req.user), items = [];
  async function rec(d) {
    const es = await fsp.readdir(d, { withFileTypes: true }).catch(() => []);
    let has = false;
    for (const e of es) {
      if (e.isDirectory()) { if (await rec(path.join(d, e.name))) has = true; } else has = true;
    }
    if (!has && d !== b) { const s = await fsp.stat(d).catch(() => null); items.push({ name: path.basename(d), path: path.relative(b, d), isDir: true, size: 0, mtime: s ? s.mtimeMs : 0 }); }
    return has;
  }
  await rec(b);
  res.json({ items: items.slice(0, 500) });
}));

module.exports = router;
