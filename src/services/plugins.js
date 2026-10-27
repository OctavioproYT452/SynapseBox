// Sistema de plugins: carga plugins de data/plugins, los activa/desactiva en caliente,
// inyecta su código en las páginas y habla con el repositorio de plugins en GitHub.
const fs = require("fs"), fsp = fs.promises, path = require("path"), express = require("express");
const { execFile } = require("child_process");
const { DATA, PUBLIC } = require("../config");

const DIR = path.join(DATA, "plugins");          // plugins instalados
const STATE = path.join(DATA, "plugins-state.json"); // { enabled: [ids] }
const REPO_DIR = path.join(DATA, "plugins-repo");    // copia local del repositorio (para subir)
const REPO = process.env.PLUGINS_REPO || "OctavioproYT452/SynapseBox-Puglins";
const RAW = `https://raw.githubusercontent.com/${REPO}/HEAD/`;
const TREE = `https://api.github.com/repos/${REPO}/git/trees/HEAD?recursive=1`;
const ID_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;
const ALLOWED = /\.(js|mjs|cjs|json|css|html|svg|png|jpe?g|gif|webp|ico|txt|md|woff2?|ttf)$/i;
const IMG = /\.(png|jpe?g|gif|webp|svg)$/i;

fs.mkdirSync(DIR, { recursive: true });
const readState = () => { try { return JSON.parse(fs.readFileSync(STATE, "utf8")); } catch { return { enabled: [] }; } };
const writeState = s => fs.writeFileSync(STATE, JSON.stringify(s, null, 2));
const slug = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
const safeName = s => { const v = String(s || "").normalize("NFC").trim(); if (!/^[\p{L}\p{N} _-]{2,40}$/u.test(v)) throw Error("Nombre de categoría inválido (2-40 letras, números, espacios, - o _)"); return v; };
const inside = (base, p) => { const r = path.resolve(base, p); if (r !== path.resolve(base) && !r.startsWith(path.resolve(base) + path.sep)) throw Error("Ruta no permitida"); return r; };

// ---------- bus de eventos y estado en memoria ----------
let appRef = null;
const listeners = {};              // evento -> [{id, fn}]
const active = new Map();          // id -> { manifest, router, mod, dir }
const emit = async (ev, data) => { for (const l of [...(listeners[ev] || [])]) { try { await l.fn(data); } catch (e) { console.warn(`[plugin ${l.id}] error en «${ev}»:`, e.message); } } };

function manifestOf(dir) {
  const m = JSON.parse(fs.readFileSync(path.join(dir, "plugin.json"), "utf8").replace(/^\uFEFF/, ""));
  if (!ID_RE.test(m.id || "")) throw Error("plugin.json: «id» inválido");
  return m;
}
function listInstalled() {
  const st = readState(), out = [];
  for (const d of fs.readdirSync(DIR, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    try { const m = manifestOf(path.join(DIR, d.name)); out.push({ ...m, folder: d.name, enabled: st.enabled.includes(m.id), loaded: active.has(m.id) }); } catch { /* carpeta sin plugin.json válido */ }
  }
  return out;
}

// API que reciben los plugins en su server.js
function makeApi(m, dir, router) {
  const dataDir = path.join(DATA, "plugin-data", m.id); fs.mkdirSync(dataDir, { recursive: true });
  const log = (...a) => console.log(`[plugin ${m.id}]`, ...a);
  return {
    manifest: m, dir, dataDir, log, express,
    app: appRef, router,                                    // router: se monta ANTES que todas las rutas de SynapseBox
    use: (...a) => router.use(...a),                      // middleware global (puede cambiar cualquier petición)
    get: (...a) => router.get(...a), post: (...a) => router.post(...a), put: (...a) => router.put(...a), delete: (...a) => router.delete(...a),
    serveFile: (urlPath, file) => router.get(urlPath, (req, res) => res.sendFile(inside(dir, file))), // reemplaza iconos, imágenes, CSS…
    serveDir: (urlPath, sub = ".") => router.use(urlPath, express.static(inside(dir, sub))),
    on: (ev, fn) => { (listeners[ev] ||= []).push({ id: m.id, fn }); },
    emit,
    adminOnly: (req, res, next) => req.user?.is_admin ? next() : res.status(403).json({ error: "Solo administradores" }), // middleware: solo admins
    db: require("../db"), config: require("../config"), settings: require("../lib/settings"), utils: require("../lib/utils"),
    core: p => require(path.join(__dirname, "..", p)),     // acceso a cualquier módulo interno: api.core("services/auth")
    data: {                                               // almacenamiento JSON propio del plugin
      read: (n, def = null) => { try { return JSON.parse(fs.readFileSync(inside(dataDir, n + ".json"), "utf8")); } catch { return def; } },
      write: (n, v) => fs.writeFileSync(inside(dataDir, n + ".json"), JSON.stringify(v, null, 2)),
    },
    inject: { head: [], body: [] },                       // fragmentos HTML extra para todas las páginas
    transformHtml: fn => { (listeners["html"] ||= []).push({ id: m.id, fn }); }, // fn(html, {url, user}) -> html
  };
}

async function load(id) {
  if (active.has(id)) return;
  const dir = path.join(DIR, id); const m = manifestOf(dir);
  const router = express.Router(), api = makeApi(m, dir, router);
  let mod = null;
  if (m.server) {
    const file = inside(dir, m.server);
    delete require.cache[require.resolve(file)];
    mod = require(file);
    if (typeof mod === "function") await mod(api); else if (mod && typeof mod.activate === "function") await mod.activate(api);
  }
  active.set(id, { manifest: m, router, mod, dir, api });
  await emit("plugin:enabled", { id });
}
async function unload(id) {
  const p = active.get(id); if (!p) return;
  try { if (p.mod && typeof p.mod.deactivate === "function") await p.mod.deactivate(p.api); } catch (e) { console.warn(`[plugin ${id}] deactivate:`, e.message); }
  for (const ev of Object.keys(listeners)) listeners[ev] = listeners[ev].filter(l => l.id !== id);
  active.delete(id);
  try { const dir = p.dir; for (const k of Object.keys(require.cache)) if (k.startsWith(dir + path.sep)) delete require.cache[k]; } catch { /* nada */ }
}
async function init(app) {
  appRef = app;
  for (const id of readState().enabled) { try { await load(id); } catch (e) { console.warn(`[plugin ${id}] no se pudo cargar:`, e.message); } }
}
async function setEnabled(id, on) {
  if (!ID_RE.test(id) || !fs.existsSync(path.join(DIR, id, "plugin.json"))) throw Error("Plugin no instalado");
  const st = readState(), has = st.enabled.includes(id);
  if (on) { await load(id); if (!has) st.enabled.push(id); } else { await unload(id); st.enabled = st.enabled.filter(x => x !== id); }
  writeState(st);
}
async function uninstall(id) {
  if (!ID_RE.test(id)) throw Error("Id inválido");
  await setEnabled(id, false).catch(() => { });
  await fsp.rm(path.join(DIR, id), { recursive: true, force: true });
}

// ---------- middleware: reparte las peticiones a los plugins activos ----------
const middleware = (req, res, next) => {
  const list = [...active.values()]; let i = 0;
  const step = err => {
    if (err) return next(err);
    const p = list[i++]; if (!p) return next();
    p.router(req, res, step);
  };
  step();
};
// Archivos propios de cada plugin (CSS, JS de cliente, imágenes): /plugins/<id>/<archivo>
const assets = (req, res, next) => {
  const m = /^\/plugins\/([a-z0-9-]+)\/(.+)$/.exec(req.path);
  if (!m || !active.has(m[1])) return next();
  try {
    const f = inside(path.join(DIR, m[1]), decodeURIComponent(m[2]));
    if (!ALLOWED.test(f) || path.relative(path.join(DIR, m[1]), f) === active.get(m[1]).manifest.server) return next(); // el código del servidor nunca se sirve
    res.sendFile(f);
  } catch { next(); }
};
// Inyecta SDK + CSS + JS de cliente de los plugins activos en las páginas HTML.
const html = async (req, res, next) => {
  if (req.method !== "GET") return next();
  let p = decodeURIComponent(req.path); if (p.endsWith("/")) p += "index.html";
  if (!p.endsWith(".html")) return next();
  let file; try { file = inside(PUBLIC, "." + p); } catch { return next(); }
  let text; try { text = await fsp.readFile(file, "utf8"); } catch { return next(); }
  if (active.size) {
    let head = "", body = `<script src="/plugins-sdk.js"></script>`;
    for (const { manifest: m, api } of active.values()) {
      const v = encodeURIComponent(m.version || "0");
      if (m.style) head += `<link rel="stylesheet" href="/plugins/${m.id}/${m.style}?v=${v}">`;
      if (m.client) body += `<script src="/plugins/${m.id}/${m.client}?v=${v}" data-plugin="${m.id}" defer></script>`;
      head += api.inject.head.join(""); body += api.inject.body.join("");
    }
    text = text.replace("</head>", head + "</head>").replace("</body>", body + "</body>");
    for (const l of listeners["html"] || []) { try { text = (await l.fn(text, { url: req.path, user: req.user })) ?? text; } catch (e) { console.warn(`[plugin ${l.id}] html:`, e.message); } }
  }
  res.type("html").send(text);
};

// ---------- repositorio de plugins (GitHub) ----------
let cache = { at: 0, tree: null };
async function gh(url, bin) {
  const r = await fetch(url, { headers: { "User-Agent": "SynapseBox" }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw Error(`GitHub respondió ${r.status}`);
  return bin ? Buffer.from(await r.arrayBuffer()) : r.text();
}
async function tree() {
  if (cache.tree && Date.now() - cache.at < 3e5) return cache.tree;
  const j = JSON.parse(await gh(TREE));
  cache = { at: Date.now(), tree: (j.tree || []).filter(t => t.type === "blob").map(t => ({ path: t.path, size: t.size || 0 })) };
  return cache.tree;
}
async function catalog() {
  const t = await tree(), out = [];
  const found = t.filter(f => /^[^/]+\/[^/]+\/plugin\.json$/.test(f.path));
  await Promise.all(found.map(async f => {
    try {
      const m = JSON.parse(await gh(RAW + f.path.split("/").map(encodeURIComponent).join("/")));
      const [cat, folder] = f.path.split("/");
      out.push({ ...m, category: m.category || cat, folder, catFolder: cat, images: (m.images || []).filter(i => IMG.test(i)) });
    } catch { /* manifiesto roto: se ignora */ }
  }));
  return out.sort((a, b) => (a.category + a.title).localeCompare(b.category + b.title));
}
async function remoteFile(rel) { // solo rutas que existen en el repositorio
  const t = await tree(); if (!t.some(f => f.path === rel)) throw Error("Archivo no encontrado");
  return gh(RAW + rel.split("/").map(encodeURIComponent).join("/"), true);
}
async function install(catFolder, folder) {
  const t = await tree(), pre = `${catFolder}/${folder}/`;
  const files = t.filter(f => f.path.startsWith(pre));
  if (!files.some(f => f.path === pre + "plugin.json")) throw Error("El plugin no existe en el repositorio");
  if (files.length > 60 || files.reduce((s, f) => s + f.size, 0) > 25e6) throw Error("Plugin demasiado grande");
  const m = JSON.parse((await remoteFile(pre + "plugin.json")).toString("utf8"));
  if (!ID_RE.test(m.id || "")) throw Error("plugin.json con id inválido");
  const dest = path.join(DIR, m.id), tmp = dest + ".tmp-" + Date.now(), wasOn = active.has(m.id);
  await fsp.mkdir(tmp, { recursive: true });
  try {
    for (const f of files) {
      const rel = f.path.slice(pre.length); if (!ALLOWED.test(rel)) continue;
      const out = inside(tmp, rel); await fsp.mkdir(path.dirname(out), { recursive: true }); await fsp.writeFile(out, await remoteFile(f.path));
    }
    if (wasOn) await unload(m.id);
    await fsp.rm(dest, { recursive: true, force: true }); await fsp.rename(tmp, dest);
  } catch (e) { await fsp.rm(tmp, { recursive: true, force: true }); throw e; }
  if (wasOn) await load(m.id);
  return m;
}

// ---------- subir un plugin al repositorio con git ----------
const git = (args, cwd) => new Promise((ok, ko) => execFile("git", args, { cwd, timeout: 120000, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } },
  (e, out, err) => e ? ko(Error(String(err || e.message).replace(/x-access-token:[^@]+@/g, "***@").split("\n").slice(0, 4).join(" ").trim())) : ok(out)));
const remoteUrl = () => process.env.PLUGINS_GITHUB_TOKEN ? `https://x-access-token:${process.env.PLUGINS_GITHUB_TOKEN}@github.com/${REPO}.git` : `https://github.com/${REPO}.git`;
// ---------- cuenta de GitHub (sin clave en el .env): flujo por código de dispositivo ----------
// client_id de una OAuth App con «Device Flow» activado (es público, no es un secreto). Se puede cambiar con PLUGINS_GITHUB_CLIENT_ID.
const CLIENT_ID = process.env.PLUGINS_GITHUB_CLIENT_ID || "PON_AQUI_EL_CLIENT_ID";
const GH_FILE = path.join(DATA, "plugins-github.json");
const ghAuth = () => { try { return JSON.parse(fs.readFileSync(GH_FILE, "utf8")); } catch { return null; } };
const hasClient = () => !!CLIENT_ID && !/^PON_AQUI/.test(CLIENT_ID);
async function ghApi(method, url, body, token) {
  const r = await fetch(url.startsWith("http") ? url : "https://api.github.com" + url, {
    method, signal: AbortSignal.timeout(20000),
    headers: { "User-Agent": "SynapseBox", Accept: "application/vnd.github+json", ...(token ? { Authorization: "Bearer " + token } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Error(j.message ? `GitHub: ${j.message}` : `GitHub respondió ${r.status}`);
  return j;
}
const githubStatus = () => { const a = ghAuth(); return { linked: !!a?.token, login: a?.login || null, hasClientId: hasClient(), envToken: !!process.env.PLUGINS_GITHUB_TOKEN }; };
async function githubStart() {
  if (!hasClient()) throw Error("Falta el client_id de la OAuth App (PLUGINS_GITHUB_CLIENT_ID o la constante CLIENT_ID en src/services/plugins.js)");
  const r = await fetch("https://github.com/login/device/code", { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": "SynapseBox" }, body: JSON.stringify({ client_id: CLIENT_ID, scope: "public_repo" }), signal: AbortSignal.timeout(15000) });
  const j = await r.json(); if (!j.device_code) throw Error(j.error_description || "No se pudo iniciar la vinculación");
  return { device_code: j.device_code, user_code: j.user_code, url: j.verification_uri, interval: j.interval || 5, expires_in: j.expires_in };
}
async function githubPoll(device_code) {
  const r = await fetch("https://github.com/login/oauth/access_token", { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": "SynapseBox" }, body: JSON.stringify({ client_id: CLIENT_ID, device_code, grant_type: "urn:ietf:params:oauth:grant-type:device_code" }), signal: AbortSignal.timeout(15000) });
  const j = await r.json();
  if (j.error === "authorization_pending" || j.error === "slow_down") return { status: "pending" };
  if (!j.access_token) throw Error(j.error_description || "Vinculación cancelada o caducada");
  const me = await ghApi("GET", "/user", null, j.access_token);
  fs.writeFileSync(GH_FILE, JSON.stringify({ token: j.access_token, login: me.login }), { mode: 0o600 });
  return { status: "ok", login: me.login };
}
const githubUnlink = () => fs.rmSync(GH_FILE, { force: true });

let busy = false;
async function publish({ title, description, category, version, author, images, files }) {
  if (busy) throw Error("Hay otra subida en curso, espera un momento");
  busy = true;
  try {
    title = String(title || "").trim().slice(0, 60); description = String(description || "").trim().slice(0, 1000);
    if (title.length < 2) throw Error("Falta el título");
    if (description.length < 10) throw Error("Falta la descripción (mínimo 10 caracteres)");
    category = safeName(category);
    version = String(version || "1.0.0").trim(); if (!/^\d+(\.\d+){0,2}$/.test(version)) throw Error("Versión inválida (ej. 1.0.0)");
    const id = slug(title); if (!ID_RE.test(id)) throw Error("El título no genera un id válido");
    if (!images?.length) throw Error("Sube al menos una imagen (máximo 5)"); if (images.length > 5) throw Error("Máximo 5 imágenes");
    if (!files?.length) throw Error("Sube al menos un archivo del plugin");
    for (const f of images) if (!IMG.test(f.name)) throw Error(`Imagen no permitida: ${f.name}`);
    for (const f of files) if (!ALLOWED.test(f.name) || f.name === "plugin.json") throw Error(`Archivo no permitido: ${f.name}`);

    // Modo: con PLUGINS_GITHUB_TOKEN (permiso de escritura) se sube directo; si no, con la cuenta vinculada se crea un Pull Request.
    const envTok = process.env.PLUGINS_GITHUB_TOKEN, acc = ghAuth(), token = envTok || acc?.token;
    if (!token) throw Error("Vincula tu cuenta de GitHub (botón «Vincular GitHub») para poder subir plugins mediante Pull Request");
    const pub = `https://github.com/${REPO}.git`, withTok = r => `https://x-access-token:${token}@github.com/${r}.git`;
    if (!fs.existsSync(path.join(REPO_DIR, ".git"))) { await fsp.rm(REPO_DIR, { recursive: true, force: true }); await git(["clone", "--depth", "1", pub, REPO_DIR]); }
    else { await git(["remote", "set-url", "origin", pub], REPO_DIR); await git(["fetch", "--depth", "1", "origin"], REPO_DIR); await git(["checkout", "--detach", "FETCH_HEAD"], REPO_DIR); await git(["reset", "--hard", "FETCH_HEAD"], REPO_DIR); await git(["clean", "-fd"], REPO_DIR); }
    let branch = null;
    if (!envTok) { branch = `plugin/${id}-${version}-${Date.now().toString(36)}`; await git(["checkout", "-b", branch], REPO_DIR); }

    const base = path.join(REPO_DIR, category, id); const isNew = !fs.existsSync(base);
    await fsp.rm(base, { recursive: true, force: true }); await fsp.mkdir(path.join(base, "images"), { recursive: true });
    const names = images.map((f, i) => `images/imagen-${i + 1}${path.extname(f.name).toLowerCase()}`);
    for (let i = 0; i < images.length; i++) await fsp.writeFile(inside(base, names[i]), images[i].buffer);
    const clean = n => path.basename(n).replace(/[^\w.\-]+/g, "_");
    for (const f of files) await fsp.writeFile(inside(base, clean(f.name)), f.buffer);
    const fl = files.map(f => clean(f.name));
    // El manifiesto lo genera SynapseBox con los datos del formulario (un plugin.json subido no se usa).
    const manifest = {
      id, title, version, category, author: author || "Anónimo", description, images: names, image: names[0],
      server: fl.includes("server.js") ? "server.js" : undefined, client: fl.includes("client.js") ? "client.js" : undefined, style: fl.includes("style.css") ? "style.css" : undefined,
      files: fl,
    };
    await fsp.writeFile(path.join(base, "plugin.json"), JSON.stringify(manifest, null, 2) + "\n");

    await git(["add", "-A", `${category}/${id}`], REPO_DIR);
    const st = await git(["status", "--porcelain"], REPO_DIR); if (!st.trim()) throw Error("No hay cambios que subir");
    const msg = `${isNew ? "Añadir" : "Actualizar"} plugin ${title} v${version} (${category})`;
    await git(["-c", "user.name=SynapseBox", "-c", "user.email=synapsebox@users.noreply.github.com", "commit", "-m", msg], REPO_DIR);
    cache.at = 0;
    if (envTok) { await git(["push", withTok(REPO), "HEAD"], REPO_DIR); return { id, category, folder: id, version, isNew, mode: "push" }; }

    // ----- Pull Request directo al repositorio principal (sin forks): rama en el repo → PR -----
    const me = acc.login, repoInfo = await ghApi("GET", `/repos/${REPO}`, null, token);
    if (!repoInfo.permissions?.push) throw Error(`Tu cuenta @${me} no tiene permiso de escritura en ${REPO}. Pide al dueño que te añada como colaborador (Settings → Collaborators) o usa un token con acceso en PLUGINS_GITHUB_TOKEN.`);
    await git(["push", withTok(REPO), `${branch}:${branch}`], REPO_DIR);
    const pr = await ghApi("POST", `/repos/${REPO}/pulls`, { title: msg, head: branch, base: repoInfo.default_branch, body: `${description}\n\n- Categoría: ${category}\n- Versión: ${version}\n- Autor: ${manifest.author} (@${me})\n\nSubido desde el panel de SynapseBox.`, maintainer_can_modify: true }, token);
    return { id, category, folder: id, version, isNew, mode: "pr", pr: pr.html_url };
  } finally { busy = false; }
}

module.exports = { githubStatus, githubStart, githubPoll, githubUnlink, init, middleware, assets, html, listInstalled, setEnabled, uninstall, catalog, remoteFile, install, publish, emit, IMG, ALLOWED, slug };
