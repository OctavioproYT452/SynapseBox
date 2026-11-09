// Herramientas del agente: todas confinadas a la carpeta del usuario (y a su propia apariencia). No existe ninguna para ejecutar nada.
// 2.17.5: edición por reemplazos, varios archivos a la vez, búsqueda, informes de espacio, duplicados, organizar, papelera, favoritos y temas.
const fs = require("fs"), fsp = fs.promises, path = require("path");
const { all, run } = require("../db");
const { MAX_READ, MAX_WRITE } = require("./constants");
const { base, safe, limitB } = require("../lib/paths");
const { usage, dirSize } = require("../lib/storage");
const { relOf, moved, removed } = require("../services/collab");
const crypto = require("crypto");
const T = require("../services/themes");
const trash = require("../services/trash");
const { get } = require("../db");

const segOk = s => s.length > 0 && s.length <= 200 && !/[\0-\x1f]/.test(s);
// Convierte una ruta relativa del usuario en una ruta absoluta DENTRO de su carpeta (o falla).
async function R(u, rel, { root = false } = {}) {
  const b = base(u);
  rel = String(rel ?? "").replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
  const parts = rel.split("/").filter(x => x && x !== ".");
  if (parts.some(x => x === ".." || !segOk(x))) throw Error("Ruta inválida");
  const f = safe(b, parts.join("/"));
  if (f === b && !root) throw Error("No puedes operar sobre la carpeta raíz");
  await fsp.mkdir(b, { recursive: true });
  // Defensa extra: ningún tramo existente de la ruta puede ser un enlace simbólico (evita escapar de la carpeta)
  let cur = b;
  for (const p of parts) {
    cur = path.join(cur, p);
    const s = await fsp.lstat(cur).catch(() => null);
    if (!s) break;
    if (s.isSymbolicLink()) throw Error("Ruta inválida");
  }
  return f;
}
const rel = (u, f) => "/" + path.relative(base(u), f).split(path.sep).join("/");
const exists = f => fsp.lstat(f).then(() => true, () => false);
const isDir = f => fsp.stat(f).then(s => s.isDirectory(), () => false);
const hasLinks = async d => { // ¿contiene enlaces simbólicos? (no se copian)
  const s = await fsp.lstat(d); if (s.isSymbolicLink()) return true; if (!s.isDirectory()) return false;
  for (const e of await fsp.readdir(d)) if (await hasLinks(path.join(d, e))) return true;
  return false;
};
async function quota(u, extra) { if (await usage(u, true) + extra > limitB(u)) throw Error("No hay espacio suficiente en la cuenta del usuario"); }
// destino de mover/copiar: si "to" es una carpeta existente, el elemento va dentro con su mismo nombre
async function dest(u, from, to) {
  const t = await R(u, to, { root: true });
  const final = (await isDir(t)) ? path.join(t, path.basename(from)) : t;
  if (final === base(u)) throw Error("Destino inválido");
  if (await exists(final)) throw Error("Ya existe un elemento con ese nombre en el destino: " + rel(u, final));
  if ((final + path.sep).startsWith(from + path.sep)) throw Error("No se puede mover/copiar una carpeta dentro de sí misma");
  await fsp.mkdir(path.dirname(final), { recursive: true });
  return final;
}

const TYPE = {}; for (const [k, v] of Object.entries({ Imágenes: "jpg jpeg png gif webp svg bmp ico heic avif", Vídeos: "mp4 mkv webm mov avi m4v", Audio: "mp3 wav ogg flac m4a aac opus", Documentos: "pdf doc docx odt rtf txt md xls xlsx ods csv ppt pptx odp", Comprimidos: "zip rar 7z tar gz bz2 xz", Código: "js ts json html css py java c cpp cs go rs php sh sql xml yml yaml" })) for (const e of v.split(" ")) TYPE[e] = k;
const human = n => n >= 1073741824 ? (n / 1073741824).toFixed(2) + " GB" : n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : n >= 1024 ? (n / 1024).toFixed(1) + " KB" : n + " B";
const sha = f => new Promise((ok, no) => { const h = crypto.createHash("sha256"); fs.createReadStream(f).on("data", d => h.update(d)).on("end", () => ok(h.digest("hex"))).on("error", no); });
// Recorre una carpeta (sin enlaces simbólicos) con tope de archivos y de tiempo
async function walkFiles(root, { max = 20000, time = 15000 } = {}) {
  const stack = [root], files = [], end = Date.now() + time; let cut = false;
  while (stack.length) {
    if (files.length >= max || Date.now() > end) { cut = true; break; }
    const d = stack.pop(), es = await fsp.readdir(d, { withFileTypes: true }).catch(() => []);
    for (const e of es) { if (e.isSymbolicLink()) continue; const p = path.join(d, e.name); if (e.isDirectory()) stack.push(p); else if (e.isFile()) { const s = await fsp.stat(p).catch(() => null); if (s) files.push({ p, size: s.size, mtime: s.mtimeMs }); } }
  }
  return { files, cut };
}
// Avisos de legibilidad del tema (contraste WCAG aproximado)
const lum = h => { const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
function contrast(t) {
  const w = [], chk = (a, b, min, msg) => { if (t[a] && t[b] && ratio(t[a], t[b]) < min) w.push(msg); };
  chk("text", "bg", 4.5, "El texto casi no se lee sobre el fondo."); chk("text", "card", 4.5, "El texto casi no se lee sobre las tarjetas."); chk("on", "accent", 3, "El texto de los botones casi no se lee sobre el color de acento.");
  return w;
}

const IMPL = {
  async list_dir(u, a) {
    const d = await R(u, a.path, { root: true });
    if (!(await isDir(d))) throw Error("No es una carpeta o no existe");
    const es = await fsp.readdir(d, { withFileTypes: true }), out = [];
    for (const e of es.slice(0, 300)) {
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) out.push(e.name + "/");
      else { const s = await fsp.stat(path.join(d, e.name)).catch(() => null); if (s) out.push(`${e.name} (${s.size} bytes)`); }
    }
    return out.length ? out.join("\n") + (es.length > 300 ? "\n… (lista recortada)" : "") : "(carpeta vacía)";
  },
  async read_file(u, a) {
    const f = await R(u, a.path), s = await fsp.stat(f).catch(() => null);
    if (!s || s.isDirectory()) throw Error("El archivo no existe");
    const fd = await fsp.open(f, "r");
    try {
      const buf = Buffer.alloc(Math.min(s.size, MAX_READ)); await fd.read(buf, 0, buf.length, 0);
      if (buf.includes(0)) throw Error("Es un archivo binario: solo puedo leer texto");
      return buf.toString("utf8") + (s.size > MAX_READ ? "\n… (archivo recortado)" : "");
    } finally { await fd.close(); }
  },
  async create_folder(u, a) {
    const f = await R(u, a.path);
    if (await exists(f)) throw Error("Ya existe: " + rel(u, f));
    await fsp.mkdir(f, { recursive: true }); return "Carpeta creada: " + rel(u, f);
  },
  async write_file(u, a) {
    const f = await R(u, a.path), content = String(a.content ?? "");
    if (Buffer.byteLength(content) > MAX_WRITE) throw Error("Contenido demasiado grande (máx. 1 MB por archivo)");
    const old = await fsp.lstat(f).catch(() => null);
    if (old?.isDirectory()) throw Error("Ya existe una carpeta con ese nombre");
    if (old && !a.overwrite) throw Error("El archivo ya existe. Usa overwrite=true solo si el usuario pidió sustituirlo");
    await quota(u, Buffer.byteLength(content) - (old?.size || 0));
    await fsp.mkdir(path.dirname(f), { recursive: true });
    await fsp.writeFile(f, content, { mode: 0o644 }); await fsp.chmod(f, 0o644); // nunca ejecutable
    await usage(u, true); return (old ? "Archivo sobrescrito: " : "Archivo creado: ") + rel(u, f);
  },
  async move_item(u, a) {
    const from = await R(u, a.from); if (!(await exists(from))) throw Error("No existe: " + rel(u, from));
    const to = await dest(u, from, a.to); await fsp.rename(from, to); moved(u.id, relOf(u, from), relOf(u, to)); return `Movido a ${rel(u, to)}`;
  },
  async copy_item(u, a) {
    const from = await R(u, a.from), s = await fsp.lstat(from).catch(() => null); if (!s) throw Error("No existe: " + rel(u, from));
    if (await hasLinks(from)) throw Error("El origen contiene enlaces simbólicos y no se puede copiar");
    const to = await dest(u, from, a.to);
    await quota(u, s.isDirectory() ? await dirSize(from) : s.size);
    await fsp.cp(from, to, { recursive: true, dereference: false, errorOnExist: true, force: false });
    for (const p of [to]) await fixModes(p);
    await usage(u, true); return `Copiado a ${rel(u, to)}`;
  },
  async delete_item(u, a) {
    const f = await R(u, a.path); if (!(await exists(f))) throw Error("No existe: " + rel(u, f));
    const r = path.relative(base(u), f);
    const t = await require("../services/trash").put(u, f, "IA"); removed(u.id, relOf(u, f));
    for (const s of all("SELECT token,path FROM shares WHERE user_id=?", u.id)) if (s.path === r || s.path.startsWith(r + path.sep)) run("DELETE FROM shares WHERE token=?", s.token);
    await usage(u, true); return (t.trashed ? "Movido a la papelera (se puede restaurar desde la web): " : "Borrado definitivamente: ") + rel(u, f);
  },

  // ---------- 2.17.5: más herramientas ----------
  async read_files(u, a) {
    const ps = Array.isArray(a.paths) ? a.paths.slice(0, 8) : []; if (!ps.length) throw Error("Indica paths (lista de rutas, máx. 8)");
    const out = []; let left = MAX_READ;
    for (const p of ps) {
      try { const t = (await IMPL.read_file(u, { path: p })).slice(0, Math.max(500, left)); left -= t.length; out.push(`=== ${p} ===\n${t}`); }
      catch (e) { out.push(`=== ${p} ===\nError: ${e.message}`); }
    }
    return out.join("\n\n");
  },
  async append_file(u, a) {
    const f = await R(u, a.path), add = String(a.content ?? ""), old = await fsp.lstat(f).catch(() => null);
    if (old?.isDirectory()) throw Error("Es una carpeta");
    if ((old?.size || 0) + Buffer.byteLength(add) > MAX_WRITE) throw Error("El archivo superaría 1 MB");
    await quota(u, Buffer.byteLength(add)); await fsp.mkdir(path.dirname(f), { recursive: true });
    await fsp.appendFile(f, add, { mode: 0o644 }); await fsp.chmod(f, 0o644); await usage(u, true);
    return (old ? "Añadido al final de " : "Archivo creado: ") + rel(u, f);
  },
  async edit_file(u, a) {
    const f = await R(u, a.path), s = await fsp.stat(f).catch(() => null);
    if (!s || s.isDirectory()) throw Error("El archivo no existe");
    if (s.size > MAX_WRITE) throw Error("Archivo demasiado grande para editar");
    const buf = await fsp.readFile(f); if (buf.includes(0)) throw Error("Es un archivo binario");
    let txt = buf.toString("utf8"); const eds = Array.isArray(a.edits) ? a.edits.slice(0, 40) : [];
    if (!eds.length) throw Error("Indica edits: [{old, new}]");
    let n = 0;
    for (const [i, e] of eds.entries()) {
      const o = String(e?.old ?? ""), nw = String(e?.new ?? ""); if (!o) throw Error(`Edición ${i + 1}: «old» vacío`);
      const c = txt.split(o).length - 1;
      if (!c) throw Error(`Edición ${i + 1}: no encuentro ese texto (debe coincidir exactamente). No se ha cambiado nada`);
      if (c > 1 && !e.all) throw Error(`Edición ${i + 1}: el texto aparece ${c} veces; añade más contexto o usa all=true. No se ha cambiado nada`);
      txt = e.all ? txt.split(o).join(nw) : txt.replace(o, () => nw); n += e.all ? c : 1;
    }
    if (Buffer.byteLength(txt) > MAX_WRITE) throw Error("El resultado superaría 1 MB");
    await quota(u, Buffer.byteLength(txt) - s.size); await fsp.writeFile(f, txt, { mode: 0o644 }); await fsp.chmod(f, 0o644); await usage(u, true);
    return `Editado ${rel(u, f)} (${n} cambio${n === 1 ? "" : "s"})`;
  },
  async create_files(u, a) {
    const fs_ = Array.isArray(a.files) ? a.files.slice(0, 25) : []; if (!fs_.length) throw Error("Indica files: [{path, content}] (máx. 25)");
    const out = []; let ok = 0;
    for (const x of fs_) { try { out.push("✓ " + await IMPL.write_file(u, { path: x?.path, content: x?.content, overwrite: !!a.overwrite })); ok++; } catch (e) { out.push(`✗ ${x?.path}: ${e.message}`); } }
    return `${ok}/${fs_.length} archivos\n` + out.join("\n");
  },
  async move_items(u, a) {
    const it = Array.isArray(a.items) ? a.items.slice(0, 60) : []; if (!it.length) throw Error("Indica items: [{from, to}] (máx. 60)");
    const out = []; let ok = 0;
    for (const x of it) { try { out.push(`✓ ${x?.from}: ${await IMPL.move_item(u, x || {})}`); ok++; } catch (e) { out.push(`✗ ${x?.from}: ${e.message}`); } }
    return `${ok}/${it.length} movidos\n` + out.join("\n");
  },
  async delete_items(u, a) {
    const ps = Array.isArray(a.paths) ? a.paths.slice(0, 60) : []; if (!ps.length) throw Error("Indica paths (máx. 60)");
    const out = []; let ok = 0;
    for (const p of ps) { try { out.push("✓ " + await IMPL.delete_item(u, { path: p })); ok++; } catch (e) { out.push(`✗ ${p}: ${e.message}`); } }
    return `${ok}/${ps.length} borrados\n` + out.join("\n");
  },
  async tree(u, a) {
    const d = await R(u, a.path, { root: true }); if (!(await isDir(d))) throw Error("No es una carpeta");
    const depth = Math.max(1, Math.min(6, Number(a.depth) || 3)), lines = []; let cut = false;
    const walk = async (dir, pre, lvl) => {
      const es = (await fsp.readdir(dir, { withFileTypes: true }).catch(() => [])).filter(e => !e.isSymbolicLink()).sort((x, y) => (y.isDirectory() - x.isDirectory()) || x.name.localeCompare(y.name));
      for (const e of es) {
        if (lines.length >= 400) { cut = true; return; }
        if (e.isDirectory()) { lines.push(pre + e.name + "/"); if (lvl < depth) await walk(path.join(dir, e.name), pre + "  ", lvl + 1); }
        else { const s = await fsp.stat(path.join(dir, e.name)).catch(() => null); lines.push(`${pre}${e.name}${s ? " (" + human(s.size) + ")" : ""}`); }
      }
    };
    await walk(d, "", 1); return (lines.join("\n") || "(carpeta vacía)") + (cut ? "\n… (recortado a 400 líneas; pide una subcarpeta concreta)" : "");
  },
  async search_files(u, a) {
    const d = await R(u, a.path, { root: true }), q = String(a.query || "").trim().toLowerCase(), ext = String(a.ext || "").replace(/^\./, "").toLowerCase();
    const minB = (Number(a.min_size_mb) || 0) * 1048576, oldMs = a.older_than_days ? Date.now() - Number(a.older_than_days) * 864e5 : 0;
    if (!q && !ext && !minB && !oldMs) throw Error("Indica al menos query, ext, min_size_mb u older_than_days");
    const rx = q.includes("*") ? new RegExp("^" + q.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$", "i") : null;
    const { files, cut } = await walkFiles(d), hits = [];
    for (const f of files) {
      const n = path.basename(f.p).toLowerCase();
      if (q && !(rx ? rx.test(n) : n.includes(q))) continue;
      if (ext && path.extname(n).slice(1) !== ext) continue;
      if (minB && f.size < minB) continue; if (oldMs && f.mtime > oldMs) continue;
      hits.push(f);
    }
    hits.sort((x, y) => y.size - x.size);
    return hits.length ? hits.slice(0, 100).map(f => `${rel(u, f.p)} (${human(f.size)}, ${new Date(f.mtime).toISOString().slice(0, 10)})`).join("\n") + (hits.length > 100 ? `\n… y ${hits.length - 100} más` : "") + (cut ? "\n(búsqueda parcial: demasiados archivos)" : "") : "Sin resultados" + (cut ? " (búsqueda parcial)" : "");
  },
  async grep_files(u, a) {
    const d = await R(u, a.path, { root: true }), q = String(a.text || "").toLowerCase(), ext = String(a.ext || "").replace(/^\./, "").toLowerCase();
    if (!q) throw Error("Indica text");
    const { files } = await walkFiles(d), out = []; let n = 0;
    for (const f of files) {
      if (out.length >= 60 || n++ > 3000) break;
      if (f.size > 1048576 || f.size === 0 || (ext && path.extname(f.p).slice(1).toLowerCase() !== ext)) continue;
      const b = await fsp.readFile(f.p).catch(() => null); if (!b || b.includes(0)) continue;
      const ls = b.toString("utf8").split("\n");
      for (let i = 0; i < ls.length && out.length < 60; i++) if (ls[i].toLowerCase().includes(q)) out.push(`${rel(u, f.p)}:${i + 1}: ${ls[i].trim().slice(0, 160)}`);
    }
    return out.length ? out.join("\n") : "Sin coincidencias";
  },
  async file_info(u, a) {
    const f = await R(u, a.path, { root: true }), s = await fsp.lstat(f).catch(() => null); if (!s || s.isSymbolicLink()) throw Error("No existe");
    const o = { ruta: rel(u, f), tipo: s.isDirectory() ? "carpeta" : "archivo", modificado: new Date(s.mtimeMs).toISOString(), creado: new Date(s.birthtimeMs || s.ctimeMs).toISOString() };
    if (s.isDirectory()) { const { files, cut } = await walkFiles(f); o.archivos = files.length + (cut ? "+" : ""); o.tamaño = human(files.reduce((t, x) => t + x.size, 0)); o.contiene_carpetas = (await fsp.readdir(f, { withFileTypes: true })).filter(e => e.isDirectory()).length; }
    else { o.tamaño = human(s.size); o.bytes = s.size; o.extensión = path.extname(f).slice(1) || "(ninguna)"; const fd = await fsp.open(f, "r"); try { const b = Buffer.alloc(Math.min(s.size, 4096)); await fd.read(b, 0, b.length, 0); o.texto = !b.includes(0); } finally { await fd.close(); } }
    const r = path.relative(base(u), f); o.favorito = !!get("SELECT 1 x FROM favs WHERE user_id=? AND path=?", u.id, r); o.compartido = !!get("SELECT 1 x FROM shares WHERE user_id=? AND path=?", u.id, r);
    return JSON.stringify(o);
  },
  async storage_report(u) {
    const b = base(u), { files, cut } = await walkFiles(b), types = new Map(), dirs = new Map(), lim = limitB(u), limOld = Date.now() - 365 * 864e5;
    let total = 0, old = 0, oldB = 0;
    for (const f of files) {
      const t = TYPE[path.extname(f.p).slice(1).toLowerCase()] || "Otros", x = types.get(t) || { t, n: 0, b: 0 }; x.n++; x.b += f.size; types.set(t, x); total += f.size;
      const top = path.relative(b, f.p).split(path.sep)[0], dn = top === path.basename(f.p) ? "(raíz)" : top + "/"; dirs.set(dn, (dirs.get(dn) || 0) + f.size);
      if (f.mtime < limOld) { old++; oldB += f.size; }
    }
    const tr = trash.summary(u), line = x => `${x.t}: ${x.n} archivo(s), ${human(x.b)}`;
    return [`Usado: ${human(total)} de ${lim === Infinity ? "ilimitado" : human(lim)}${lim !== Infinity ? ` (${Math.round(total / lim * 100)} %)` : ""} · ${files.length}${cut ? "+" : ""} archivos`,
      "Por tipo:\n" + [...types.values()].sort((x, y) => y.b - x.b).map(line).join("\n"),
      "Carpetas que más pesan:\n" + ([...dirs].sort((x, y) => y[1] - x[1]).slice(0, 8).map(([n, v]) => `${n}: ${human(v)}`).join("\n") || "-"),
      "Archivos más grandes:\n" + ([...files].sort((x, y) => y.size - x.size).slice(0, 8).map(f => `${rel(u, f.p)}: ${human(f.size)}`).join("\n") || "-"),
      `Sin modificar desde hace más de 1 año: ${old} archivo(s), ${human(oldB)}`, `Papelera: ${tr.count} elemento(s), ${human(tr.bytes)}`].join("\n\n");
  },
  async find_duplicates(u, a) {
    const d = await R(u, a.path, { root: true }), { files, cut } = await walkFiles(d), by = new Map(), end = Date.now() + 25000;
    for (const f of files) if (f.size > 0 && f.size <= 512 * 1048576) (by.get(f.size) || by.set(f.size, []).get(f.size)).push(f);
    const groups = []; let wasted = 0;
    for (const l of by.values()) {
      if (l.length < 2) continue; const h = new Map();
      for (const f of l) { if (Date.now() > end) break; const k = await sha(f.p).catch(() => null); if (k) (h.get(k) || h.set(k, []).get(k)).push(f); }
      for (const g of h.values()) if (g.length > 1) { g.sort((x, y) => x.mtime - y.mtime); wasted += g[0].size * (g.length - 1); groups.push(g); }
    }
    groups.sort((x, y) => y[0].size * (y.length - 1) - x[0].size * (x.length - 1));
    return groups.length ? `${groups.length} grupo(s) de duplicados, ${human(wasted)} recuperables${cut ? " (análisis parcial)" : ""}. El primero de cada grupo es el más antiguo:\n` + groups.slice(0, 15).map(g => `[${human(g[0].size)} c/u]\n` + g.map(f => "  " + rel(u, f.p)).join("\n")).join("\n") : "No hay duplicados" + (cut ? " (análisis parcial)" : "");
  },
  async organize_folder(u, a) {
    const d = await R(u, a.path, { root: true }); if (!(await isDir(d))) throw Error("No es una carpeta");
    const mode = ["type", "extension", "year"].includes(a.by) ? a.by : "type", dry = !!a.dry_run;
    const es = (await fsp.readdir(d, { withFileTypes: true })).filter(e => e.isFile() && !e.name.startsWith(".")).slice(0, 500), plan = new Map();
    for (const e of es) {
      const ex = path.extname(e.name).slice(1).toLowerCase(); let g;
      if (mode === "type") g = TYPE[ex] || "Otros"; else if (mode === "extension") g = ex ? ex.toUpperCase() : "Sin extensión";
      else { const s = await fsp.stat(path.join(d, e.name)).catch(() => null); g = s ? String(new Date(s.mtimeMs).getFullYear()) : "Otros"; }
      (plan.get(g) || plan.set(g, []).get(g)).push(e.name);
    }
    if (!plan.size) return "No hay archivos sueltos que organizar en esa carpeta";
    const sum = [...plan].map(([g, l]) => `${g}/: ${l.length} archivo(s)`).join("\n");
    if (dry) return "Plan (no se ha movido nada):\n" + sum + "\n" + [...plan].flatMap(([g, l]) => l.slice(0, 4).map(n => `  ${n} → ${g}/`)).slice(0, 30).join("\n");
    let ok = 0, bad = 0;
    for (const [g, l] of plan) {
      const dir = path.join(d, g); const st = await fsp.lstat(dir).catch(() => null);
      if (st && !st.isDirectory()) { bad += l.length; continue; } if (!st) await fsp.mkdir(dir);
      for (const n of l) { try { let name = n, i = 1; const { name: nm0, ext } = path.parse(n); while (await exists(path.join(dir, name))) name = `${nm0} (${i++})${ext}`; const from = path.join(d, n), to = path.join(dir, name); await fsp.rename(from, to); moved(u.id, relOf(u, from), relOf(u, to)); ok++; } catch { bad++; } }
    }
    return `Organizado: ${ok} archivo(s) movido(s)${bad ? `, ${bad} sin mover` : ""}\n` + sum;
  },
  async list_trash(u) {
    const l = trash.list(u).slice(0, 60); if (!l.length) return "La papelera está vacía";
    return l.map(x => `id=${x.id} · ${x.path}${x.isDir ? "/" : ""} · ${human(x.size)} · borrado ${new Date(x.deleted_at).toISOString().slice(0, 10)}`).join("\n");
  },
  async restore_trash(u, a) {
    const ids = (Array.isArray(a.ids) ? a.ids : [a.id]).filter(Boolean).slice(0, 30); if (!ids.length) throw Error("Indica ids (de list_trash)");
    const out = []; for (const id of ids) { try { out.push("✓ Restaurado en " + await trash.restore(u, String(id))); } catch (e) { out.push(`✗ ${id}: ${e.message}`); } }
    return out.join("\n");
  },
  async list_favorites(u) { const l = all("SELECT path FROM favs WHERE user_id=?", u.id).map(r => "/" + r.path.split(path.sep).join("/")); return l.length ? l.join("\n") : "No hay favoritos"; },
  async set_favorite(u, a) {
    const f = await R(u, a.path); if (!(await exists(f))) throw Error("No existe: " + rel(u, f));
    const r = path.relative(base(u), f), had = get("SELECT 1 x FROM favs WHERE user_id=? AND path=?", u.id, r), want = a.favorite !== false;
    if (want && !had) run("INSERT INTO favs VALUES(?,?)", u.id, r); if (!want && had) run("DELETE FROM favs WHERE user_id=? AND path=?", u.id, r);
    return (want ? "Añadido a favoritos: " : "Quitado de favoritos: ") + rel(u, f);
  },
  // ---------- apariencia ----------
  async list_themes(u) {
    const cur = T.userTheme(u); if (cur) delete cur.mu;
    const media = await fsp.readdir(path.join(base(u), T.MEDIA_DIR)).catch(() => []), ok = media.filter(n => T.mediaOk(n, true)).slice(0, 40);
    return JSON.stringify({ tema_activo: cur || "(el predeterminado)", temas_guardados: T.savedThemes(u).map(x => ({ nombre: x.name, tema: x.theme })), medios_en_carpeta_Temas: ok.length ? ok : "(ninguno)", claves: { colores_hex: T.COLORS, r: "0-28 redondeo (px)", font: Object.keys(T.FONTS), sp: ["0.8", "1", "1.25"], dev: ["mobile", "pc"], bgf: "fondo (archivo de Temas)", bgfit: ["cover", "contain", "fill"], bgdim: "0-80", bgblur: "0-20", btf: "imagen de botones", btfit: "idem", btdim: "0-80" } });
  },
  async save_theme(u, a, ctx) {
    let baseT = {}; const from = String(a.from || "current");
    if (from === "current") { baseT = T.userTheme(u) || {}; delete baseT.mu; }
    else if (from !== "none") { const r = T.savedThemes(u).find(x => x.name === from); if (!r) throw Error(`No existe el tema guardado «${from}»`); baseT = { ...r.theme }; }
    const ch = a.changes && typeof a.changes === "object" && !Array.isArray(a.changes) ? a.changes : {}, m = { ...baseT };
    for (const [k, v] of Object.entries(ch)) { if (v === null || v === "") delete m[k]; else m[k] = v; }
    const r = await T.saveNamedTheme(u, a.name, m), t = r.theme; let msg = `Tema «${r.name}» guardado en Mis temas`;
    const w = contrast(t); if (w.length) msg += "\nAviso: " + w.join(" ").replace(/\.$/, "") + ". Considera ajustar los colores.";
    if (a.apply !== false) { const th = await T.applyUserTheme(u, m); ctx?.onTheme?.(th || {}); msg += " y aplicado a tu cuenta"; }
    return msg + ".";
  },
  async apply_theme(u, a, ctx) {
    const n = String(a.name || "").trim();
    if (!n || /^(predeterminado|default|ninguno)$/i.test(n)) { await T.applyUserTheme(u, null); ctx?.onTheme?.({}); return "Tema predeterminado restaurado"; }
    const r = T.savedThemes(u).find(x => x.name === n); if (!r) throw Error(`No existe el tema «${n}»`);
    const th = await T.applyUserTheme(u, r.theme); ctx?.onTheme?.(th || {}); return `Tema «${n}» aplicado`;
  },
};
async function fixModes(p) { // las copias nunca conservan el bit de ejecución
  const s = await fsp.lstat(p);
  if (s.isDirectory()) { for (const e of await fsp.readdir(p)) await fixModes(path.join(p, e)); } else if (s.isFile() && (s.mode & 0o111)) await fsp.chmod(p, s.mode & 0o666);
}

const fn = (name, description, properties, required) => ({ type: "function", function: { name, description, parameters: { type: "object", properties, required } } });
const P = d => ({ type: "string", description: d });
const ARR = (d, items) => ({ type: "array", description: d, items });
const OBJ = (properties, required) => ({ type: "object", properties, required });
const THEME_KEYS = { bg: P("#rrggbb fondo"), card: P("#rrggbb tarjetas"), card2: P("#rrggbb elementos secundarios"), text: P("#rrggbb texto"), muted: P("#rrggbb texto atenuado"), accent: P("#rrggbb acento/botones"), on: P("#rrggbb texto sobre el acento"), danger: P("#rrggbb"), ok: P("#rrggbb"), warn: P("#rrggbb"), r: { type: "number", description: "Redondeo 0-28" }, font: { type: "string", enum: ["system", "serif", "mono", "rounded"] }, sp: { type: "string", enum: ["0.8", "1", "1.25"], description: "Espaciado" }, dev: { type: "string", enum: ["mobile", "pc"] }, bgf: P("Fondo: archivo de la carpeta Temas"), bgfit: { type: "string", enum: ["cover", "contain", "fill"] }, bgdim: { type: "number" }, bgblur: { type: "number" }, btf: P("Imagen de botones: archivo de Temas"), btfit: { type: "string", enum: ["cover", "contain", "fill"] }, btdim: { type: "number" } };
const TOOLS = [
  fn("list_dir", "Lista una carpeta. path vacío = raíz.", { path: P("Ruta") }, []),
  fn("tree", "Árbol de carpetas y archivos (visión general rápida).", { path: P("Ruta (vacío = raíz)"), depth: { type: "number", description: "1-6, por defecto 3" } }, []),
  fn("read_file", "Lee un archivo de texto (máx. 60 KB).", { path: P("Ruta") }, ["path"]),
  fn("read_files", "Lee varios archivos de texto a la vez (máx. 8).", { paths: ARR("Rutas", { type: "string" }) }, ["paths"]),
  fn("file_info", "Tamaño, fechas, tipo, favorito/compartido de un archivo o carpeta.", { path: P("Ruta") }, ["path"]),
  fn("search_files", "Busca archivos por nombre (admite *), extensión, tamaño mínimo o antigüedad.", { query: P("Parte del nombre o patrón con *"), path: P("Carpeta donde buscar (vacío = todo)"), ext: P("Extensión sin punto"), min_size_mb: { type: "number" }, older_than_days: { type: "number" } }, []),
  fn("grep_files", "Busca un texto dentro de los archivos de texto (líneas coincidentes).", { text: P("Texto a buscar"), path: P("Carpeta (vacío = todo)"), ext: P("Limitar a una extensión") }, ["text"]),
  fn("create_folder", "Crea una carpeta (con las intermedias).", { path: P("Ruta") }, ["path"]),
  fn("write_file", "Crea un archivo de texto (con las carpetas intermedias). Nunca se ejecuta.", { path: P("Ruta"), content: P("Contenido completo"), overwrite: { type: "boolean", description: "true solo si el usuario pidió sustituir uno existente" } }, ["path", "content"]),
  fn("create_files", "Crea VARIOS archivos de texto en una sola llamada (máx. 25).", { files: ARR("Archivos", OBJ({ path: P("Ruta"), content: P("Contenido") }, ["path", "content"])), overwrite: { type: "boolean" } }, ["files"]),
  fn("append_file", "Añade texto al final de un archivo (lo crea si no existe).", { path: P("Ruta"), content: P("Texto a añadir") }, ["path", "content"]),
  fn("edit_file", "Edita un archivo con reemplazos exactos (más barato que reescribirlo). Cada «old» debe aparecer una vez, o usa all=true.", { path: P("Ruta"), edits: ARR("Cambios", OBJ({ old: P("Texto exacto actual"), new: P("Texto nuevo"), all: { type: "boolean" } }, ["old", "new"])) }, ["path", "edits"]),
  fn("move_item", "Mueve o renombra un elemento. Si 'to' es una carpeta existente, va dentro.", { from: P("Origen"), to: P("Destino") }, ["from", "to"]),
  fn("move_items", "Mueve/renombra VARIOS elementos a la vez (máx. 60).", { items: ARR("Movimientos", OBJ({ from: P("Origen"), to: P("Destino") }, ["from", "to"])) }, ["items"]),
  fn("copy_item", "Copia un archivo o carpeta.", { from: P("Origen"), to: P("Destino") }, ["from", "to"]),
  fn("delete_item", "Borra un elemento (va a la papelera, restaurable).", { path: P("Ruta") }, ["path"]),
  fn("delete_items", "Borra VARIOS elementos (a la papelera, máx. 60).", { paths: ARR("Rutas", { type: "string" }) }, ["paths"]),
  fn("organize_folder", "Ordena los archivos sueltos de una carpeta en subcarpetas por tipo, extensión o año. dry_run=true solo muestra el plan.", { path: P("Carpeta"), by: { type: "string", enum: ["type", "extension", "year"] }, dry_run: { type: "boolean" } }, ["path"]),
  fn("storage_report", "Informe de espacio: uso y cuota, por tipo, carpetas y archivos más grandes, antiguos y papelera.", {}, []),
  fn("find_duplicates", "Busca archivos duplicados (mismo contenido). No borra nada.", { path: P("Carpeta (vacío = todo)") }, []),
  fn("list_trash", "Lista la papelera del usuario.", {}, []),
  fn("restore_trash", "Restaura elementos de la papelera por id (de list_trash).", { ids: ARR("ids", { type: "string" }) }, ["ids"]),
  fn("list_favorites", "Lista los favoritos.", {}, []),
  fn("set_favorite", "Marca o desmarca un favorito.", { path: P("Ruta"), favorite: { type: "boolean", description: "false = quitar" } }, ["path"]),
  fn("list_themes", "Devuelve el tema activo, los temas guardados, las claves válidas y los medios disponibles en la carpeta «Temas». Úsala antes de cambiar el tema.", {}, []),
  fn("save_theme", "Crea un tema NUEVO en Mis temas partiendo del actual (o de otro) con los cambios dados, y por defecto lo aplica. Nunca pisa uno existente: usa un nombre nuevo. En changes, null quita una clave.", { name: P("Nombre nuevo (máx. 40)"), from: P("«current» (por defecto), «none» o el nombre de un tema guardado"), changes: OBJ(THEME_KEYS, []), apply: { type: "boolean", description: "false = solo guardarlo sin aplicarlo" } }, ["name", "changes"]),
  fn("apply_theme", "Aplica un tema guardado por nombre (o «predeterminado» para quitar el tema).", { name: P("Nombre") }, ["name"]),
];
const LABEL = {
  list_dir: a => `Listó ${a.path || "/"}`, tree: a => `Vio el árbol de ${a.path || "/"}`, read_file: a => `Leyó ${a.path}`, read_files: a => `Leyó ${(a.paths || []).length} archivos`, file_info: a => `Consultó ${a.path}`,
  search_files: a => `Buscó archivos${a.query ? " «" + a.query + "»" : ""}`, grep_files: a => `Buscó «${a.text}» en los archivos`, create_folder: a => `Creó la carpeta ${a.path}`,
  write_file: a => `${a.overwrite ? "Escribió" : "Creó"} el archivo ${a.path}`, create_files: a => { const n = (a.files || []).length; return `Creó ${n} archivo${n === 1 ? "" : "s"}`; }, append_file: a => `Añadió texto a ${a.path}`, edit_file: a => `Editó ${a.path}`,
  move_item: a => `Movió ${a.from} → ${a.to}`, move_items: a => { const n = (a.items || []).length; return `Movió ${n} elemento${n === 1 ? "" : "s"}`; }, copy_item: a => `Copió ${a.from} → ${a.to}`,
  delete_item: a => `Movió a la papelera ${a.path}`, delete_items: a => { const n = (a.paths || []).length; return `Movió a la papelera ${n} elemento${n === 1 ? "" : "s"}`; }, organize_folder: a => `${a.dry_run ? "Planificó organizar" : "Organizó"} ${a.path || "/"}`,
  storage_report: () => "Analizó el espacio", find_duplicates: () => "Buscó duplicados", list_trash: () => "Miró la papelera", restore_trash: () => "Restauró de la papelera",
  list_favorites: () => "Miró los favoritos", set_favorite: a => `${a.favorite === false ? "Quitó de" : "Añadió a"} favoritos ${a.path}`, list_themes: () => "Miró tus temas", save_theme: a => `Creó el tema «${a.name}»`, apply_theme: a => `Aplicó el tema «${a.name}»`,
};
const MUTATES = new Set(["create_folder", "write_file", "create_files", "append_file", "edit_file", "move_item", "move_items", "copy_item", "delete_item", "delete_items", "organize_folder", "restore_trash", "set_favorite", "save_theme", "apply_theme"]);
const THEME_TOOLS = new Set(["save_theme", "apply_theme"]);

module.exports = { IMPL, TOOLS, LABEL, MUTATES, THEME_TOOLS, human };
