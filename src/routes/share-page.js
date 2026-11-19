// Páginas públicas de enlaces compartidos: /s/<token> (sin iniciar sesión).
const router = require("express").Router();
const fs = require("fs"), path = require("path");
const { get, now, verify } = require("../db");
const { sha, esc, cookies } = require("../lib/utils");
const { safe } = require("../lib/paths");
const { HOSTING } = require("../config");
const { serve } = require("../lib/serve");
const { zipTo } = require("../lib/zip");
const { locked, addFail, fails } = require("../services/auth");
const { userTheme } = require("../services/themes");
const { IC, page, bytes, kind, expTxt } = require("../views/share-helpers");
const { convertToPdf, sendPdf } = require("./office");
const VIEW = new Set(".pdf .doc .docx .xls .xlsx .ppt .pptx .odt .ods .odp .rtf".split(" "));
const VSCRIPTS = '<script src="/js/common.js"></script><script src="/js/viewer.js"></script><script src="/js/share.js"></script>';

function shareCtx(req) {
  const s = get("SELECT s.*,u.username,u.suspended,u.theme,u.uuid owner_uuid FROM shares s JOIN users u ON u.id=s.user_id WHERE s.token=?", req.params.token);
  if (!s || s.suspended || (s.expires_at && s.expires_at < now())) return null;
  try {
    const root = safe(require("../lib/paths").base({ uuid: s.owner_uuid }), s.path), full = safe(root, req.query.p);
    return fs.existsSync(full) ? { s, root, full, th: userTheme(s) } : null;
  } catch { return null; }
}
const unlocked = (req, s) => !s.pw || cookies(req)["fc_s_" + s.token] === sha(s.pw + s.token);
router.post("/s/:token/unlock", (req, res) => {
  const tk = req.params.token, s = get("SELECT * FROM shares WHERE token=?", tk), key = "sh|" + req.ip + tk, back = "/s/" + encodeURIComponent(tk);
  if (!s || !s.pw) return res.redirect(back);
  if (locked(key) || !verify(String(req.body.password || ""), s.pw)) { addFail(key); return res.redirect(back + "?bad=1"); }
  fails.delete(key);
  res.set("Set-Cookie", `fc_s_${tk}=${sha(s.pw + tk)}; HttpOnly; SameSite=Lax; Path=/s/${tk}; Max-Age=86400${req.secure ? "; Secure" : ""}`);
  res.redirect(back);
});
router.get("/s/:token/raw", (req, res) => {
  const c = shareCtx(req);
  if (!c || fs.statSync(c.full).isDirectory()) return res.sendStatus(404);
  if (!unlocked(req, c.s)) return res.sendStatus(403);
  serve(res, c.full, req.query.dl);
});
router.get("/s/:token/convert", async (req, res) => { // vista previa de documentos de Office como PDF (si hay LibreOffice)
  const c = shareCtx(req);
  if (!c || fs.statSync(c.full).isDirectory()) return res.sendStatus(404);
  if (!unlocked(req, c.s)) return res.sendStatus(403);
  try { sendPdf(res, await convertToPdf(c.full)); } catch (e) { res.status(400).json({ error: e.message }); }
});
router.get("/s/:token/zip", async (req, res) => {
  const c = shareCtx(req);
  if (!c || !fs.statSync(c.full).isDirectory()) return res.sendStatus(404);
  if (!unlocked(req, c.s)) return res.sendStatus(403);
  try { await zipTo(res, [{ abs: c.full, name: path.basename(c.full) }], path.basename(c.full)); } catch (e) { res.status(400).send(e.message); }
});
router.get("/s/:token", (req, res) => {
  try {
    const c = shareCtx(req), t = encodeURIComponent(req.params.token);
    if (!c) return res.status(404).send(page("No encontrado", `<div class="card sh-hero"><div class="sh-ico bad">${IC("ban")}</div><h2>Enlace no disponible</h2><p class="muted">Ha caducado, fue revocado o el archivo ya no existe.</p></div>`));
    if (!unlocked(req, c.s)) return res.send(page("Enlace protegido", `<div class="card sh-hero"><div class="sh-ico">${IC("lock")}</div><h2>Enlace protegido</h2><p class="muted">Introduce la contraseña para continuar.</p><form method="post" action="/s/${t}/unlock" class="sh-form"><input class="input" type="password" name="password" placeholder="Contraseña" autofocus required><div class="err">${req.query.bad ? "Contraseña incorrecta" : ""}</div><button class="btn">${IC("key")} Abrir</button></form></div>`, c.th));
    const q = p => `?p=${encodeURIComponent(p)}`, rel = path.relative(c.root, c.full), st = fs.statSync(c.full), name = path.basename(c.full), up = path.dirname(rel) === "." ? "" : path.dirname(rel);
    const meta = n => `<div class="sh-meta"><span>${IC("user")} ${esc(c.s.username)}</span>${n}<span>${IC("clock")} ${expTxt(c.s)}</span></div>`;
    const crumbs = () => { const ps = rel ? rel.split(path.sep) : []; return `<nav class="crumbs">${ps.length ? `<a href="/s/${t}">${esc(path.basename(c.root))}</a>` : `<b>${esc(path.basename(c.root))}</b>`}${ps.map((p, i) => i < ps.length - 1 ? `›<a href="/s/${t}${q(ps.slice(0, i + 1).join("/"))}">${esc(p)}</a>` : `›<b>${esc(p)}</b>`).join("")}</nav>`; };
    if (st.isDirectory()) {
      const es = fs.readdirSync(c.full, { withFileTypes: true }).sort((a, b) => b.isDirectory() - a.isDirectory() || a.name.localeCompare(b.name));
      const cards = es.map(e => { const isD = e.isDirectory(); return `<a class="item" href="/s/${t}${q(path.join(rel, e.name))}"><div class="ico">${IC(isD ? "folder" : kind(path.extname(e.name).toLowerCase()))}</div><div class="meta"><b>${esc(e.name)}</b><small>${isD ? "Carpeta" : bytes(fs.statSync(path.join(c.full, e.name)).size)}</small></div></a>`; }).join("") || `<p class="muted">Carpeta vacía</p>`;
      return res.send(page(name, `<div class="card sh-hero"><div class="sh-ico">${IC("folder")}</div><h2 class="sh-name">${esc(name)}</h2>${meta(`<span>${IC("file")} ${es.length} elemento(s)</span>`)}<div class="row sh-act"><a class="btn" href="/s/${t}/zip${q(rel)}">${IC("zip")} Descargar todo (.zip)</a></div></div><div class="card" style="margin-top:12px">${crumbs()}<div class="grid">${cards}</div></div>`, c.th));
    }
    const ext = path.extname(c.full).toLowerCase(), raw = `/s/${t}/raw${q(rel)}`;
    let pv = `<p class="muted">Sin vista previa para este tipo de archivo.</p>`;
    if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"].includes(ext)) pv = `<img class="pv" src="${raw}" alt="${esc(name)}">`;
    else if ([".mp4", ".webm", ".ogg", ".mov"].includes(ext)) pv = `<video class="pv" controls src="${raw}"></video>`;
    else if ([".mp3", ".wav", ".flac", ".aac", ".m4a"].includes(ext)) pv = `<audio controls style="width:100%" src="${raw}"></audio>`;
    else if (VIEW.has(ext)) pv = `<div class="vw" id="vw" data-ext="${ext}" data-raw="${esc(raw)}" data-conv="${esc(`/s/${t}/convert${q(rel)}`)}"><p class="muted">Cargando…</p></div>`;
    else if ([".html", ".htm"].includes(ext)) pv = `<iframe class="pv frame" src="${raw}" sandbox="allow-scripts"></iframe>`;
    else if ([".txt", ".md", ".json", ".log", ".csv", ".js", ".css", ".py", ".xml"].includes(ext) && st.size < 2e6) pv = `<pre class="code">${esc(fs.readFileSync(c.full, "utf8").slice(0, 20000))}</pre>`;
    res.send(page(name, `<div class="card sh-hero"><div class="sh-ico">${IC(kind(ext))}</div><h2 class="sh-name">${esc(name)}</h2>${meta(`<span>${IC("file")} ${bytes(st.size)}</span>`)}<div class="row sh-act"><a class="btn" href="${raw}&dl=1">${IC("download")} Descargar</a>${c.s.is_dir ? `<a class="btn ghost" href="/s/${t}${q(up)}">${IC("back")} Volver</a>` : ""}</div></div><div class="card sh-pv">${c.s.is_dir ? crumbs() : ""}${pv}</div>`, c.th, VIEW.has(ext) ? VSCRIPTS : ""));
  } catch { res.status(500).send("Error al mostrar el enlace"); }
});

module.exports = router;
