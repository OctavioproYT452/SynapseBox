// Resolución segura de rutas dentro de la carpeta de cada usuario.
const fs = require("fs"), path = require("path");
const { HOSTING } = require("../config");

// Ruta real de p aunque no exista del todo: resuelve (siguiendo enlaces simbólicos) el ancestro más profundo que existe y le añade el resto.
function realOf(p) {
  const rest = [];
  for (; ;) {
    try { return path.join(fs.realpathSync(p), ...rest.reverse()); }
    catch (e) { if (e.code !== "ENOENT" && e.code !== "ENOTDIR") throw Error("Ruta inválida"); const q = path.dirname(p); if (q === p) throw Error("Ruta inválida"); rest.push(path.basename(p)); p = q; }
  }
}
// La ruta debe quedar dentro de "base" tanto en texto como en disco: un enlace simbólico o un punto de montaje que apunte fuera se rechaza.
const inside = (b, f) => f === b || f.startsWith(b + path.sep);
function safe(base, rel = "") {
  rel = String(rel);
  if (rel.includes("\0") || rel.length > 4096 || /[\u0001-\u001f]/.test(rel)) throw Error("Ruta inválida");
  const f = path.resolve(base, "." + path.sep + rel.replace(/\\/g, "/"));
  if (!inside(base, f)) throw Error("Ruta inválida");
  if (f !== base && !inside(realOf(base), realOf(f))) throw Error("Ruta inválida");
  return f;
}
const nm = n => { n = String(n || "").trim(); if (!n || /[\/\\\0]/.test(n) || n === "." || n === ".." || n.length > 200 || /[\u0001-\u001f]/.test(n)) throw Error("Nombre inválido"); return n; };
const base = u => path.join(HOSTING, u.uuid); // la carpeta usa el UUID, no el nombre de usuario
const limitB = u => u.max_space_mb < 0 ? Infinity : u.max_space_mb * 1048576;
// Ruta absoluta del archivo indicado en ?path= o en el cuerpo (nunca la carpeta raíz del usuario)
const fileOf = (req, root = base(req.user)) => { const f = safe(root, req.query.path || req.body.path); if (f === root) throw Error("Falta ruta"); return f; };

module.exports = { inside, realOf, safe, nm, base, limitB, fileOf };
