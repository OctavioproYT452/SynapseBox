// Lector ZIP sin dependencias: extrae a una carpeta con protección contra rutas peligrosas («zip slip»), enlaces y bombas de compresión.
const fs = require("fs"), fsp = fs.promises, path = require("path"), zlib = require("zlib");
const { Transform } = require("stream"), { pipeline } = require("stream/promises");
const { crc } = require("./zip"), { inside } = require("./paths");

const MAX_ENTRIES = 20000;
const rd = async (fh, pos, len) => { const b = Buffer.alloc(len), { bytesRead } = await fh.read(b, 0, len, pos); return b.subarray(0, bytesRead); };

async function entries(fh, size) {
  const tail = await rd(fh, Math.max(0, size - 65557), Math.min(size, 65557));
  let i = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])); if (i < 0) throw Error("No es un ZIP válido");
  const n = tail.readUInt16LE(i + 10), csz = tail.readUInt32LE(i + 12), cof = tail.readUInt32LE(i + 16);
  if (n === 0xFFFF || csz === 0xFFFFFFFF || cof === 0xFFFFFFFF) throw Error("ZIP64 no es compatible");
  if (n > MAX_ENTRIES) throw Error("El ZIP tiene demasiados archivos");
  const cd = await rd(fh, cof, csz), out = []; let p = 0;
  for (let k = 0; k < n; k++) {
    if (cd.readUInt32LE(p) !== 0x02014b50) throw Error("ZIP dañado");
    const flag = cd.readUInt16LE(p + 8), nl = cd.readUInt16LE(p + 28), el = cd.readUInt16LE(p + 30), cl = cd.readUInt16LE(p + 32), nb = cd.subarray(p + 46, p + 46 + nl);
    let name = nb.toString("utf8"); if (!(flag & 0x800) && name.includes("\ufffd")) name = nb.toString("latin1");
    out.push({ name: name.replace(/\\/g, "/"), flag, method: cd.readUInt16LE(p + 10), crc: cd.readUInt32LE(p + 16), cs: cd.readUInt32LE(p + 20), us: cd.readUInt32LE(p + 24), lho: cd.readUInt32LE(p + 42), attr: cd.readUInt32LE(p + 38) });
    p += 46 + nl + el + cl;
  }
  return out;
}

// Extrae "zipPath" dentro de "dest" (carpeta nueva). "room" = bytes máximos que se pueden escribir. Devuelve los bytes escritos.
async function extract(zipPath, dest, room) {
  const fh = await fsp.open(zipPath, "r");
  try {
    const es = await entries(fh, (await fh.stat()).size);
    let total = 0;
    for (const e of es) { if (e.flag & 1) throw Error("El ZIP tiene contraseña y no se puede descomprimir"); total += e.us; }
    if (total > room) throw Error("No hay espacio suficiente para descomprimir (" + Math.ceil(total / 1048576) + " MB)");
    await fsp.mkdir(dest, { recursive: true });
    const rdest = await fsp.realpath(dest); let written = 0;
    for (const e of es) {
      const parts = e.name.split("/").filter(s => s && s !== ".");
      if (e.name.startsWith("/") || e.name.startsWith("//") || /^[a-zA-Z]:/.test(e.name) || parts.includes("..") || e.name.includes("\0") || /[\u0001-\u001f]/.test(e.name) || parts.length > 64 || e.name.length > 4000 || parts.some(s => s.length > 255)) throw Error("El ZIP contiene rutas no permitidas");
      if (!parts.length) continue;
      const target = path.join(dest, ...parts), isDir = e.name.endsWith("/") || (e.attr >>> 16 & 0xF000) === 0x4000;
      if (target !== dest && !target.startsWith(dest + path.sep)) throw Error("El ZIP contiene rutas no permitidas");
      if ((e.attr >>> 16 & 0xF000) === 0xA000) continue; // enlaces simbólicos: se omiten
      if (isDir) { await fsp.mkdir(target, { recursive: true }); if (!inside(rdest, await fsp.realpath(target))) throw Error("El ZIP contiene rutas no permitidas"); continue; }
      await fsp.mkdir(path.dirname(target), { recursive: true });
      if (!inside(rdest, await fsp.realpath(path.dirname(target)))) throw Error("El ZIP contiene rutas no permitidas"); // por si alguna carpeta intermedia fuera un enlace
      const lh = await rd(fh, e.lho, 30); if (lh.readUInt32LE(0) !== 0x04034b50) throw Error("ZIP dañado");
      const start = e.lho + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);
      if (e.method !== 0 && e.method !== 8) throw Error("Método de compresión no compatible");
      let c = 0, n = 0;
      const guard = new Transform({ transform(b, _, cb) { n += b.length; written += b.length; if (written > room || n > e.us + 1) return cb(Error("El ZIP es más grande de lo que declara")); c = crc(c, b); cb(null, b); } });
      const src = fs.createReadStream(zipPath, { start, end: start + e.cs - 1 });
      await pipeline(...[src, e.method === 8 ? zlib.createInflateRaw() : null, guard, fs.createWriteStream(target, { flags: "wx" })].filter(Boolean));
      if (c !== e.crc || n !== e.us) throw Error("ZIP dañado (" + parts.join("/") + ")");
    }
    return written;
  } finally { await fh.close(); }
}
module.exports = { extract };
