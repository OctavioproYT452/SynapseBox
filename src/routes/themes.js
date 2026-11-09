// Apariencia: tema activo, temas guardados y comunidad de temas.
const router = require("express").Router();
const { get, all, run } = require("../db");
const { wrap } = require("../lib/utils");
const { need } = require("../middleware/auth");
const fsp = require("fs").promises, path = require("path");
const { cleanTheme, userTheme, themeCss, withMu, MEDIA_DIR, checkMedia } = require("../services/themes");
const { base, limitB } = require("../lib/paths");
const { usage, uniq } = require("../lib/storage");

router.get("/theme.css", (req, res) => {
  const t = userTheme(req.user);
  res.type("css").set("Cache-Control", "no-cache");
  res.send(themeCss(t));
});
router.get("/api/theme", need, (req, res) => res.json({ theme: userTheme(req.user) }));
router.post("/api/theme", need, wrap(async (req, res) => {
  const t = await checkMedia(req.user, cleanTheme(req.body.theme));
  run("UPDATE users SET theme=? WHERE id=?", t && Object.keys(t).length ? JSON.stringify(t) : null, req.user.id); res.json({ success: true });
}));

router.get("/api/themes", need, (req, res) => res.json({ themes: all("SELECT name,data,public FROM user_themes WHERE user_id=? ORDER BY name", req.user.id).map(r => ({ name: r.name, public: !!r.public, theme: withMu(cleanTheme(JSON.parse(r.data)), req.user.uuid) })) }));
router.post("/api/themes", need, wrap(async (req, res) => {
  const name = String(req.body.name || "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 40), t = await checkMedia(req.user, cleanTheme(req.body.theme));
  if (!name || !t) throw Error("Tema inválido");
  if (!get("SELECT 1 x FROM user_themes WHERE user_id=? AND name=?", req.user.id, name) && get("SELECT COUNT(*) n FROM user_themes WHERE user_id=?", req.user.id).n >= 50) throw Error("Máximo 50 temas guardados");
  run("INSERT INTO user_themes(user_id,name,data) VALUES(?,?,?) ON CONFLICT(user_id,name) DO UPDATE SET data=excluded.data", req.user.id, name, JSON.stringify(t)); res.json({ success: true });
}));
router.post("/api/themes/publish", need, wrap(async (req, res) => {
  const name = String(req.body.name || ""), row = get("SELECT data FROM user_themes WHERE user_id=? AND name=?", req.user.id, name);
  if (!row) throw Error("Tema no encontrado");
  if (["both", "mobile", "pc"].includes(req.body.dev)) { // dispositivo para el que está pensado el tema
    const t = cleanTheme(JSON.parse(row.data)) || {}; delete t.dev; if (req.body.dev !== "both") t.dev = req.body.dev;
    run("UPDATE user_themes SET data=? WHERE user_id=? AND name=?", JSON.stringify(t), req.user.id, name);
  }
  run("UPDATE user_themes SET public=? WHERE user_id=? AND name=?", req.body.public ? 1 : 0, req.user.id, name); res.json({ success: true });
}));
router.get("/api/community", need, (req, res) => res.json({ themes: all("SELECT t.rowid id,t.name,t.data,t.user_id,u.username author,u.uuid FROM user_themes t JOIN users u ON u.id=t.user_id WHERE t.public=1 AND u.suspended=0 ORDER BY t.rowid DESC LIMIT 300").map(r => ({ id: r.id, name: r.name, author: r.author, mine: r.user_id === req.user.id, theme: withMu(cleanTheme(JSON.parse(r.data)), r.uuid) })) }));
router.post("/api/community/save", need, wrap(async (req, res) => {
  const r = get("SELECT t.name,t.data,t.user_id,u.username author,u.uuid FROM user_themes t JOIN users u ON u.id=t.user_id WHERE t.rowid=? AND t.public=1", Number(req.body.id));
  if (!r) throw Error("El tema ya no está disponible");
  const has = n => get("SELECT data FROM user_themes WHERE user_id=? AND name=?", req.user.id, n);
  // Los medios del tema se copian a la carpeta «Temas» de quien lo guarda (ocupan su espacio y no dependen del autor)
  let data = r.data;
  if (r.user_id !== req.user.id) {
    const t = cleanTheme(JSON.parse(data)) || {}, src = path.join(base({ uuid: r.uuid }), MEDIA_DIR), dst = path.join(base(req.user), MEDIA_DIR);
    for (const k of ["bgf", "btf"]) if (t[k]) {
      const from = path.join(src, t[k]), st = await fsp.stat(from).catch(() => null);
      if (!st || !st.isFile()) { delete t[k]; continue; }
      await fsp.mkdir(dst, { recursive: true });
      const same = await fsp.stat(path.join(dst, t[k])).catch(() => null);
      if (same && same.size === st.size) continue; // ya la tiene
      if (await usage(req.user, true) + st.size > limitB(req.user)) throw Error("No tienes espacio suficiente para copiar las imágenes o el vídeo del tema");
      const n = await uniq(dst, t[k]); await fsp.copyFile(from, path.join(dst, n)); t[k] = n;
    }
    await usage(req.user, true); data = JSON.stringify(cleanTheme(t) || t);
  }
  let name = r.name;
  if (has(name) && has(name).data !== data) name = (r.name + " (" + r.author + ")").slice(0, 40);
  if (!has(name) && get("SELECT COUNT(*) n FROM user_themes WHERE user_id=?", req.user.id).n >= 50) throw Error("Máximo 50 temas guardados");
  run("INSERT INTO user_themes(user_id,name,data) VALUES(?,?,?) ON CONFLICT(user_id,name) DO UPDATE SET data=excluded.data", req.user.id, name, data);
  res.json({ success: true, name, theme: withMu(cleanTheme(JSON.parse(data)), req.user.uuid) });
}));
router.post("/api/community/unpublish", need, wrap(async (req, res) => {
  const r = run("UPDATE user_themes SET public=0 WHERE rowid=? AND user_id=?", Number(req.body.id), req.user.id);
  if (!r.changes) throw Error("Tema no encontrado"); res.json({ success: true });
}));
router.delete("/api/themes", need, (req, res) => { run("DELETE FROM user_themes WHERE user_id=? AND name=?", req.user.id, String(req.body.name || "")); res.json({ success: true }); });
module.exports = router;
