// Discos de almacenamiento (2.20.0). Cada usuario vive en <raíz del disco>/<uuid>. El disco 1 («Principal») es la carpeta hosting/ de siempre;
// el administrador puede añadir más carpetas (otro disco interno, un disco externo USB, un montaje de red…) y elegir en cuál se crean los usuarios nuevos o mover a un usuario de disco.
const fs = require("fs"), fsp = fs.promises, path = require("path");
const { get, all, run, now } = require("../db");
const { HOSTING, ROOT, DATA } = require("../config");
const { setting } = require("../lib/settings");

const GB = 1073741824;
const rootCache = new Map(); const moving = new Set();
const rootOf = id => { id = Number(id) || 1; if (id === 1) return HOSTING; let r = rootCache.get(id); if (!r) { const d = get("SELECT path FROM disks WHERE id=?", id); r = d ? d.path : HOSTING; rootCache.set(id, r); } return r; };
// Carpeta de un usuario. Acepta una fila de users o un objeto con solo { uuid } (se busca su disco)
function userDir(u) {
  if (moving.has(u.uuid)) throw Error("Tu carpeta se está moviendo a otro disco. Inténtalo en unos minutos.");
  const id = u.disk_id !== undefined ? u.disk_id : get("SELECT disk_id FROM users WHERE uuid=?", u.uuid)?.disk_id;
  return path.join(rootOf(id), u.uuid);
}
const isMoving = u => moving.has(u.uuid);

const BAD = ["/", "/bin", "/boot", "/dev", "/etc", "/lib", "/lib64", "/proc", "/root", "/run", "/sbin", "/sys", "/usr", "/var", "/home"];
const within = (a, b) => a === b || a.startsWith(b + path.sep);
async function checkPath(p, selfId = 0) {
  p = String(p || "").trim();
  if (!p || p.includes("\0") || !path.isAbsolute(p)) throw Error("La ruta debe ser absoluta (ej.: /mnt/disco2/synapsebox o D:\\SynapseBox)");
  p = path.resolve(p);
  if (BAD.includes(p) || path.dirname(p) === p) throw Error("Esa carpeta es del sistema: elige una carpeta propia dentro del disco");
  await fsp.mkdir(p, { recursive: true }).catch(() => { throw Error("No se pudo crear la carpeta (¿el disco está conectado y tienes permisos?)"); });
  const real = await fsp.realpath(p);
  if (within(real, ROOT) || within(ROOT, real)) throw Error("La carpeta no puede estar dentro de SynapseBox ni contener a SynapseBox");
  for (const d of all("SELECT id,path FROM disks WHERE id<>?", selfId)) { const o = d.id === 1 ? HOSTING : d.path; if (within(real, o) || within(o, real)) throw Error("Se solapa con otro disco ya añadido"); }
  const probe = path.join(real, ".synapsebox-test-" + process.pid);
  try { await fsp.writeFile(probe, "ok"); await fsp.rm(probe); } catch { throw Error("No se puede escribir en esa carpeta (permisos o disco de solo lectura)"); }
  return real;
}
function space(p) { try { const s = fs.statfsSync(p); return { free: Number(s.bavail) * Number(s.bsize), total: Number(s.blocks) * Number(s.bsize) }; } catch { return { free: null, total: null }; } }
function list() {
  return all("SELECT * FROM disks ORDER BY id").map(d => {
    const p = d.id === 1 ? HOSTING : d.path, st = get("SELECT COUNT(*) n, COALESCE(SUM(used_bytes),0) used FROM users WHERE COALESCE(disk_id,1)=?", d.id), sp = space(fs.existsSync(p) ? p : path.dirname(p));
    return { id: d.id, name: d.name, kind: d.kind, path: p, accepting: !!d.accepting, max_gb: d.max_gb, users: st.n, used: st.used, free: sp.free, total: sp.total, online: fs.existsSync(p) };
  });
}
const nameOf = id => get("SELECT name FROM disks WHERE id=?", Number(id) || 1)?.name || "Principal";

// Elige el disco para un usuario nuevo según la política del administrador
function assign(quotaMb = 100) {
  const reserve = (Number(setting("disk_reserve_gb")) || 0) * GB, need = quotaMb < 0 ? 0 : quotaMb * 1048576;
  const ok = list().filter(d => d.accepting && d.online && (d.free === null || d.free - reserve >= need) && (!d.max_gb || d.used + need <= d.max_gb * GB));
  if (!ok.length) return 1; // sin sitio en ninguno: se usa el principal (el administrador ya verá el aviso)
  if (setting("disk_policy") === "most_free") return ok.sort((a, b) => (b.free ?? 0) - (a.free ?? 0))[0].id;
  if (setting("disk_policy") === "balance") return ok.sort((a, b) => a.users - b.users)[0].id;
  return ok[0].id; // «llenar en orden»: el primero con hueco
}
async function add({ name, path: p, kind, max_gb }) {
  name = String(name || "").trim().slice(0, 40); if (!name) throw Error("Ponle un nombre al disco");
  if (get("SELECT 1 x FROM disks WHERE name=? COLLATE NOCASE", name)) throw Error("Ya hay un disco con ese nombre");
  const real = await checkPath(p), r = run("INSERT INTO disks(name,path,kind,accepting,max_gb,created_at) VALUES(?,?,?,1,?,?)", name, real, kind === "external" ? "external" : "internal", Math.max(0, Number(max_gb) || 0), now());
  return Number(r.lastInsertRowid);
}
function update(id, b) {
  const d = get("SELECT * FROM disks WHERE id=?", id); if (!d) throw Error("Disco no encontrado");
  if (b.name !== undefined) { const n = String(b.name).trim().slice(0, 40); if (!n) throw Error("Nombre vacío"); if (get("SELECT 1 x FROM disks WHERE name=? COLLATE NOCASE AND id<>?", n, id)) throw Error("Ya hay un disco con ese nombre"); run("UPDATE disks SET name=? WHERE id=?", n, id); }
  if (b.accepting !== undefined) run("UPDATE disks SET accepting=? WHERE id=?", b.accepting ? 1 : 0, id);
  if (b.max_gb !== undefined) run("UPDATE disks SET max_gb=? WHERE id=?", Math.max(0, Number(b.max_gb) || 0), id);
  if (b.kind !== undefined) run("UPDATE disks SET kind=? WHERE id=?", b.kind === "external" ? "external" : "internal", id);
}
function remove(id) {
  if (Number(id) === 1) throw Error("El disco principal no se puede quitar");
  if (get("SELECT COUNT(*) n FROM users WHERE disk_id=?", id).n) throw Error("Hay usuarios en ese disco: muévelos antes a otro");
  run("DELETE FROM disks WHERE id=?", id); rootCache.delete(Number(id));
}
// Mueve la carpeta de un usuario a otro disco (copia, comprueba y borra la antigua)
async function moveUser(u, toId) {
  toId = Number(toId) || 1; const from = Number(u.disk_id) || 1;
  if (toId === from) return;
  const d = list().find(x => x.id === toId); if (!d || !d.online) throw Error("El disco de destino no está disponible");
  if (moving.has(u.uuid)) throw Error("Ya se está moviendo");
  const src = path.join(rootOf(from), u.uuid), dst = path.join(rootOf(toId), u.uuid);
  if (d.free !== null && d.free < (u.used_bytes || 0) * 1.1 + 50 * 1048576) throw Error("No hay espacio suficiente en el disco de destino");
  moving.add(u.uuid);
  try {
    await fsp.rm(dst, { recursive: true, force: true });
    if (fs.existsSync(src)) await fsp.cp(src, dst, { recursive: true, dereference: false, errorOnExist: false, force: true, preserveTimestamps: true });
    else await fsp.mkdir(dst, { recursive: true });
    run("UPDATE users SET disk_id=? WHERE id=?", toId, u.id);
  } catch (e) { await fsp.rm(dst, { recursive: true, force: true }).catch(() => { }); throw Error("No se pudo mover: " + (e.code ? "error de disco (" + e.code + ")" : e.message)); }
  finally { moving.delete(u.uuid); }
  await fsp.rm(src, { recursive: true, force: true }).catch(() => { });
}
module.exports = { rootOf, userDir, isMoving, list, nameOf, assign, add, update, remove, moveUser, checkPath, space };
