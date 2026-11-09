// Temas de apariencia: validación y generación del CSS.
const FONTS = { system: 'Inter,"Segoe UI",system-ui,sans-serif', serif: 'Georgia,"Times New Roman",serif', mono: "ui-monospace,Menlo,Consolas,monospace", rounded: 'ui-rounded,Nunito,"Segoe UI",system-ui,sans-serif' };
const COLORS = ["bg", "card", "card2", "text", "muted", "accent", "on", "danger", "ok", "warn"];
// Medios del tema (fondo y botones): archivos de la carpeta «Temas» del propio usuario. Solo se guarda el nombre del archivo.
const MEDIA_DIR = "Temas";
const IMG = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif"], VID = [".mp4", ".webm"];
const mediaOk = (f, video) => typeof f === "string" && /^[^\/\\\0:*?"<>|]{1,120}$/.test(f) && !f.startsWith(".") && (IMG.includes(require("path").extname(f).toLowerCase()) || (video && VID.includes(require("path").extname(f).toLowerCase())));
const isVideo = f => VID.includes(require("path").extname(f || "").toLowerCase());
const num = (v, a, b) => Number.isFinite(Number(v)) ? Math.max(a, Math.min(b, Math.round(Number(v)))) : undefined;
function cleanTheme(t) {
  if (!t || typeof t !== "object") return null;
  const o = {};
  for (const k of COLORS) if (/^#[0-9a-f]{6}$/i.test(t[k])) o[k] = t[k];
  if (t.r !== undefined && Number.isFinite(Number(t.r))) o.r = Math.max(0, Math.min(28, Math.round(Number(t.r))));
  if (FONTS[t.font]) o.font = t.font;
  if (["0.8", "1", "1.25"].includes(String(t.sp))) o.sp = String(t.sp);
  if (["mobile", "pc"].includes(t.dev)) o.dev = t.dev; // para qué dispositivo está pensado (por defecto, ambos)
  if (mediaOk(t.bgf, true)) { // fondo: imagen, GIF o vídeo
    o.bgf = t.bgf; o.bgfit = ["cover", "contain", "fill"].includes(t.bgfit) ? t.bgfit : "cover";
    o.bgdim = num(t.bgdim ?? 0, 0, 80) ?? 0; o.bgblur = num(t.bgblur ?? 0, 0, 20) ?? 0;
  }
  if (mediaOk(t.btf, false)) { // botones: solo imagen o GIF
    o.btf = t.btf; o.btfit = ["cover", "contain", "fill"].includes(t.btfit) ? t.btfit : "cover"; o.btdim = num(t.btdim ?? 0, 0, 80) ?? 0;
  }
  return Object.keys(o).length ? o : null;
}
// "mu" (uuid del dueño de los medios) no se guarda en el tema: se añade al leerlo para que el navegador sepa de dónde cargarlos.
const withMu = (t, uuid) => t && (t.bgf || t.btf) && uuid ? { ...t, mu: uuid } : t;
const userTheme = u => { try { return withMu(cleanTheme(JSON.parse(u?.theme || "null")), u?.uuid || u?.owner_uuid); } catch { return null; } };
const FIT = { cover: "cover", contain: "contain", fill: "100% 100%" };
const themeCss = t => { if (!t) return ""; const m = f => `/tm/${t.mu}/${encodeURIComponent(f)}`, hasM = !!t.mu;
  return ":root:not([data-live]){" + [...COLORS.filter(k => t[k]).map(k => `--${k}:${t[k]}`), t.r !== undefined && `--r:${t.r}px`, t.font && `--font:${FONTS[t.font]}`, t.sp && `--sp:${t.sp}`,
    hasM && t.bgf && `--bgs:"${m(t.bgf)}";--bgk:${isVideo(t.bgf) ? "video" : "image"};--bgfit:${t.bgfit};--bgdim:${t.bgdim / 100};--bgblur:${t.bgblur}px`,
    hasM && t.btf && `--btu:url("${m(t.btf)}");--btfit:${FIT[t.btfit]};--btdim:${t.btdim / 100}`].filter(Boolean).join(";") + "}"; };

// ---------- Temas del usuario (2.17.5): los usa el agente de IA del panel, con las mismas reglas que la web ----------
const fsp = require("fs").promises, path = require("path");
const { get, all, run } = require("../db");
const { base } = require("../lib/paths");
// Quita del tema los medios que ya no existen en la carpeta «Temas» del usuario
async function checkMedia(u, t) {
  if (!t) return t;
  for (const k of ["bgf", "btf"]) if (t[k] && !(await fsp.stat(path.join(base(u), MEDIA_DIR, t[k])).then(s => s.isFile(), () => false))) { delete t[k]; k === "bgf" ? ["bgfit", "bgdim", "bgblur"].forEach(x => delete t[x]) : ["btfit", "btdim"].forEach(x => delete t[x]); }
  return t;
}
const themeName = n => String(n || "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 40);
const savedThemes = u => all("SELECT name,data,public FROM user_themes WHERE user_id=? ORDER BY name", u.id).map(r => ({ name: r.name, public: !!r.public, theme: cleanTheme(JSON.parse(r.data)) }));
// Guarda un tema con nombre NUEVO (nunca pisa uno existente salvo overwrite). Devuelve { name, theme }.
async function saveNamedTheme(u, name, theme, { overwrite = false } = {}) {
  name = themeName(name); const t = await checkMedia(u, cleanTheme(theme));
  if (!name) throw Error("Falta el nombre del tema");
  if (!t) throw Error("El tema no tiene ningún valor válido (colores #rrggbb, r 0-28, font, sp, medios de la carpeta «Temas»)");
  const has = get("SELECT 1 x FROM user_themes WHERE user_id=? AND name=?", u.id, name);
  if (has && !overwrite) throw Error(`Ya tienes un tema llamado «${name}». Elige otro nombre`);
  if (!has && get("SELECT COUNT(*) n FROM user_themes WHERE user_id=?", u.id).n >= 50) throw Error("Máximo 50 temas guardados");
  run("INSERT INTO user_themes(user_id,name,data) VALUES(?,?,?) ON CONFLICT(user_id,name) DO UPDATE SET data=excluded.data", u.id, name, JSON.stringify(t));
  return { name, theme: withMu(t, u.uuid) };
}
async function applyUserTheme(u, theme) {
  const t = await checkMedia(u, cleanTheme(theme));
  run("UPDATE users SET theme=? WHERE id=?", t && Object.keys(t).length ? JSON.stringify(t) : null, u.id); u.theme = t ? JSON.stringify(t) : null;
  return withMu(t, u.uuid);
}

module.exports = { checkMedia, themeName, savedThemes, saveNamedTheme, applyUserTheme, FONTS, COLORS, MEDIA_DIR, IMG, VID, cleanTheme, userTheme, themeCss, withMu, mediaOk, isVideo };
