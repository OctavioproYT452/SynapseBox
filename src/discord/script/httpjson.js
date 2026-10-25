// Funciones HTTP y JSON de SBScript (compatibles con las de BDFD).
//   HTTP: $httpGet $httpPost $httpPut $httpPatch $httpDelete $httpAddHeader $httpStatus $httpResult
//   JSON: $jsonParse $json $jsonSet $jsonSetString $jsonUnset $jsonClear $jsonExists $jsonStringify $jsonPretty
//         $jsonArray $jsonArrayAppend $jsonArrayUnshift $jsonArrayPop $jsonArrayShift $jsonArrayCount $jsonArrayIndex
//         $jsonArrayReverse $jsonArraySort $jsonJoinArray $jsonObjectCount $jsonLength $jsonKeys $jsonType
//         $jsonArrayUnique $jsonArrayRemove $jsonArraySum
// Seguridad: solo http/https, nunca hacia redes internas (localhost, 10.x, 192.168.x, 169.254.x…; se comprueba la dirección
// ya resuelta en el momento de conectar), máximo 5 peticiones por ejecución, 8 s por petición, respuesta de hasta 1 MB y
// 3 redirecciones. Los datos JSON viven solo durante la ejecución del comando.
const http = require("http"), https = require("https"), dns = require("dns"), net = require("net");

const CH = "HTTP", CJ = "JSON";
const MAX_REQ = 5, TIMEOUT = 8000, MAX_BODY = 1048576, MAX_REDIR = 3, MAX_JSON = 200000, MAX_DEPTH = 20, MAX_HEADERS = 10;
const BAD_KEYS = new Set(["__proto__", "constructor", "prototype"]);

// ---- direcciones prohibidas ----
function privateV4(ip) {
  const [a, b, c] = ip.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168) || (a === 192 && b === 0 && c === 0) || (a === 198 && (b === 18 || b === 19));
}
function privateIp(ip) {
  ip = String(ip).toLowerCase().split("%")[0];
  if (net.isIPv4(ip)) return privateV4(ip);
  if (!net.isIPv6(ip)) return true;
  const m = ip.match(/^(?:::ffff:|0:0:0:0:0:ffff:)(\d+\.\d+\.\d+\.\d+)$/); if (m) return privateV4(m[1]);
  const h = ip.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/); if (h) { const x = parseInt(h[1], 16), y = parseInt(h[2], 16); return privateV4(`${x >> 8}.${x & 255}.${y >> 8}.${y & 255}`); }
  return ip === "::" || ip === "::1" || /^f[cd]/.test(ip) || /^fe[89ab]/.test(ip) || /^ff/.test(ip) || ip.startsWith("64:ff9b:") || ip.startsWith("2001:db8");
}
const safeLookup = (host, opts, cb) => {
  if (typeof opts === "function") { cb = opts; opts = {}; }
  dns.lookup(host, { all: true }, (e, addrs) => {
    if (e) return cb(e);
    if (!addrs.length || addrs.some(a => privateIp(a.address))) return cb(Error("dirección no permitida"));
    if (opts && opts.all) return cb(null, addrs);
    cb(null, addrs[0].address, addrs[0].family);
  });
};

// ---- una petición (sin seguir redirecciones) ----
function once(method, url, headers, body, ms) {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === "https:" ? https : http;
    const host = url.hostname.replace(/^\[|\]$/g, "");
    if (net.isIP(host) && privateIp(host)) return reject(Error("esa dirección no está permitida"));
    const req = lib.request(url, { method, headers, lookup: safeLookup, timeout: ms, agent: false }, res => {
      const chunks = []; let n = 0;
      res.on("data", d => { n += d.length; if (n > MAX_BODY) { req.destroy(Error("la respuesta pesa más de 1 MB")); return; } chunks.push(d); });
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }));
      res.on("error", reject);
    });
    req.on("timeout", () => req.destroy(Error("la petición tardó demasiado")));
    req.on("error", reject);
    if (body !== undefined && body !== "") req.write(body);
    req.end();
  });
}
async function request(method, rawUrl, headers, body) {
  let url; try { url = new URL(String(rawUrl).trim()); } catch { throw Error("la dirección no es válida"); }
  const t0 = Date.now(), left = () => Math.max(1000, TIMEOUT - (Date.now() - t0));
  for (let k = 0; ; k++) {
    if (!/^https?:$/.test(url.protocol)) throw Error("solo se permiten direcciones http:// o https://");
    if (url.username || url.password) throw Error("la dirección no puede llevar usuario ni contraseña");
    const h = { "user-agent": "SynapseBox-SBScript/1.0", accept: "*/*", ...headers };
    if (body !== undefined && body !== "") h["content-length"] = Buffer.byteLength(body);
    const r = await once(method, url, h, body, left());
    if ([301, 302, 303, 307, 308].includes(r.status) && r.headers.location) {
      if (k >= MAX_REDIR) throw Error("demasiadas redirecciones");
      const next = new URL(r.headers.location, url);
      if (next.origin !== url.origin) for (const x of Object.keys(headers)) if (/^(authorization|cookie|x-)/i.test(x)) delete headers[x]; // no filtrar credenciales a otro sitio
      if (r.status === 303 || ((r.status === 301 || r.status === 302) && method === "POST")) { method = "GET"; body = undefined; delete headers["content-type"]; }
      url = next; continue;
    }
    return r;
  }
}

// ---- JSON: caminos y valores ----
const keyList = a => a.map(x => String(x ?? "").trim());
const isObj = v => v !== null && typeof v === "object";
function step(node, k) {
  if (!isObj(node)) return undefined;
  if (Array.isArray(node)) return /^-?\d+$/.test(k) ? node[k < 0 ? node.length + +k : +k] : undefined;
  return Object.hasOwn(node, k) && !BAD_KEYS.has(k) ? node[k] : undefined;
}
function walk(root, keys) { let n = root; for (const k of keys) { n = step(n, k); if (n === undefined) return undefined; } return n; }
const show = v => v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v);
const parseLoose = s => { try { return JSON.parse(s); } catch { return s; } };
function check(keys) {
  if (keys.length > MAX_DEPTH) throw Error("el camino es demasiado largo");
  for (const k of keys) { if (k === "") throw Error("una clave está vacía"); if (BAD_KEYS.has(k)) throw Error(`la clave «${k}» no está permitida`); }
}
function needRoot(c) { if (c.json === undefined) c.json = {}; return c.json; }
function limit(c) { if (JSON.stringify(c.json ?? null).length > MAX_JSON) throw Error("el JSON es demasiado grande (máx. 200 KB)"); }
// Pone un valor en el camino (crea los objetos que falten). Con keys vacío reemplaza todo el JSON.
function setAt(c, keys, value) {
  check(keys); if (!keys.length) { c.json = value; return limit(c); }
  let n = needRoot(c);
  if (!isObj(n)) throw Error("el JSON raíz no es un objeto ni una lista");
  for (let i = 0; i < keys.length - 1; i++) {
    let nx = step(n, keys[i]);
    if (!isObj(nx)) { nx = {}; assign(n, keys[i], nx); }
    n = nx;
  }
  assign(n, keys[keys.length - 1], value); limit(c);
}
function assign(n, k, v) {
  if (Array.isArray(n)) {
    if (!/^\d+$/.test(k) || +k > n.length) throw Error(`«${k}» no es una posición válida de la lista (0 a ${n.length})`);
    n[+k] = v;
  } else n[k] = v;
}
const target = (c, keys, name) => { check(keys); const v = keys.length ? walk(c.json, keys) : c.json; if (!Array.isArray(v)) throw Error(`${name} necesita que esa clave sea una lista (créala con $jsonArray)`); return v; };
const cmp = (x, y) => (typeof x === "number" && typeof y === "number") ? x - y : String(show(x)).localeCompare(String(show(y)), "es", { numeric: true });

module.exports = function install(F, { S, N, act }) {
  // ================= HTTP =================
  const st = c => c.http ||= { headers: {}, status: 0, body: "", count: 0 };
  const run = (method, withBody) => async (c, a) => {
    const h = st(c), url = S(a[0]).trim(), body = withBody ? S(a[1]) : undefined, errMsg = a[withBody ? 2 : 1];
    if (c.dry) { c.sim.push(`haría ${method} a ${url}`); h.status = 200; h.body = ""; return ""; }
    if (++h.count > MAX_REQ) throw Error(`solo puedes hacer ${MAX_REQ} peticiones por comando`);
    const hd = { ...h.headers };
    if (body && !hd["content-type"]) hd["content-type"] = /^\s*[\[{]/.test(body) ? "application/json" : "text/plain; charset=utf-8";
    const t0 = Date.now();
    try { const r = await request(method, url, hd, body); h.status = r.status; h.body = r.body; }
    catch (e) { h.status = 0; h.body = ""; throw Error(errMsg !== undefined && S(errMsg) !== "" ? S(errMsg) : e.message); }
    finally { c.deadline += Date.now() - t0; } // la espera de la red no cuenta para el límite de tiempo del comando
    return "";
  };
  F(CH, "httpGet", "url;[mensajeDeError]", "Hace una petición GET. Lee el resultado con $httpResult y el código con $httpStatus.", run("GET", false), { min: 1, q: true });
  F(CH, "httpDelete", "url;[mensajeDeError]", "Hace una petición DELETE.", run("DELETE", false), { min: 1, q: true });
  F(CH, "httpPost", "url;[cuerpo];[mensajeDeError]", "Hace una petición POST. Si el cuerpo empieza por { o [ se envía como JSON.", run("POST", true), { min: 1, q: true });
  F(CH, "httpPut", "url;[cuerpo];[mensajeDeError]", "Hace una petición PUT.", run("PUT", true), { min: 1, q: true });
  F(CH, "httpPatch", "url;[cuerpo];[mensajeDeError]", "Hace una petición PATCH.", run("PATCH", true), { min: 1, q: true });
  F(CH, "httpAddHeader", "nombre;valor", "Añade una cabecera a las siguientes peticiones (máx. 10).", (c, a) => {
    const h = st(c), k = S(a[0]).trim().toLowerCase(), v = S(a[1]);
    if (!/^[a-z0-9-]{1,40}$/.test(k)) throw Error("nombre de cabecera no válido");
    if (["host", "content-length", "connection", "transfer-encoding", "upgrade", "te", "expect"].includes(k)) throw Error(`la cabecera «${k}» no se puede cambiar`);
    if (/[\r\n\0]/.test(v) || v.length > 500) throw Error("valor de cabecera no válido (máx. 500 caracteres, sin saltos de línea)");
    if (!(k in h.headers) && Object.keys(h.headers).length >= MAX_HEADERS) throw Error(`máximo ${MAX_HEADERS} cabeceras`);
    h.headers[k] = v; return "";
  }, { min: 2, q: true });
  F(CH, "httpStatus", "", "Código de la última petición (200, 404…). 0 si no se hizo ninguna o falló.", c => st(c).status);
  F(CH, "httpResult", "[clave;…]", "Respuesta de la última petición. Si es JSON puedes entrar con claves: $httpResult[data;0;name].", (c, a) => {
    const h = st(c), keys = keyList(a).filter(x => x !== "");
    if (!keys.length) return h.body;
    let j; try { j = JSON.parse(h.body); } catch { return ""; }
    return show(walk(j, keys));
  });

  // ================= JSON =================
  F(CJ, "jsonParse", "json", "Carga un JSON para usarlo con las demás funciones $json…  (p. ej. $jsonParse[$httpResult]).", (c, a) => {
    const s = S(a[0]); if (s.length > MAX_JSON) throw Error("el JSON es demasiado grande (máx. 200 KB)");
    try { c.json = JSON.parse(s); } catch { throw Error("el texto no es un JSON válido"); } return "";
  }, { min: 1, q: true });
  F(CJ, "jsonClear", "", "Vacía el JSON actual (queda como {}).", c => { c.json = {}; return ""; }, { q: true });
  F(CJ, "json", "[clave;…]", "Lee un valor del JSON. Sin claves devuelve todo. En listas, usa la posición desde 0 (negativa = desde el final).", (c, a) => {
    const keys = keyList(a).filter(x => x !== ""); return show(keys.length ? walk(c.json, keys) : c.json);
  });
  F(CJ, "jsonSet", "clave;…;valor", "Guarda un valor (número, true/false, texto, objeto o lista en JSON). Crea las claves que falten.", (c, a) => {
    const keys = keyList(a.slice(0, -1)); setAt(c, keys, parseLoose(S(a[a.length - 1]))); return "";
  }, { min: 2, q: true });
  F(CJ, "jsonSetString", "clave;…;valor", "Igual que $jsonSet pero siempre lo guarda como texto.", (c, a) => { setAt(c, keyList(a.slice(0, -1)), S(a[a.length - 1])); return ""; }, { min: 2, q: true });
  F(CJ, "jsonUnset", "clave;…", "Borra una clave (o un elemento de una lista).", (c, a) => {
    const keys = keyList(a); check(keys); const k = keys.pop(), p = keys.length ? walk(c.json, keys) : c.json;
    if (Array.isArray(p) && /^\d+$/.test(k)) p.splice(+k, 1); else if (isObj(p) && Object.hasOwn(p, k)) delete p[k]; return "";
  }, { min: 1, q: true });
  F(CJ, "jsonExists", "clave;…", "true si esa clave existe en el JSON, si no false.", (c, a) => { const keys = keyList(a); check(keys); return walk(c.json, keys) !== undefined; }, { min: 1 });
  F(CJ, "jsonStringify", "[clave;…]", "El valor como texto JSON (los textos van entre comillas).", (c, a) => { const keys = keyList(a).filter(x => x !== ""), v = keys.length ? walk(c.json, keys) : c.json; return v === undefined ? "" : JSON.stringify(v); });
  F(CJ, "jsonPretty", "[sangría];[clave;…]", "El JSON con saltos de línea y sangría (2 por defecto, máx. 8). Ej.: $jsonPretty[2;datos].", (c, a) => {
    const n = Math.max(0, Math.min(8, a[0] === undefined || a[0] === "" ? 2 : Math.round(N(a[0], 2)))), keys = keyList(a.slice(1)).filter(x => x !== ""), v = keys.length ? walk(c.json, keys) : c.json;
    return v === undefined ? "" : JSON.stringify(v, null, n);
  });
  F(CJ, "jsonArray", "clave;…", "Crea una lista vacía en esa clave.", (c, a) => { setAt(c, keyList(a), []); return ""; }, { min: 1, q: true });
  F(CJ, "jsonArrayAppend", "clave;…;valor", "Añade un valor al final de la lista.", (c, a) => { const l = target(c, keyList(a.slice(0, -1)), "$jsonArrayAppend"); l.push(parseLoose(S(a[a.length - 1]))); limit(c); return ""; }, { min: 2, q: true });
  F(CJ, "jsonArrayUnshift", "clave;…;valor", "Añade un valor al principio de la lista.", (c, a) => { const l = target(c, keyList(a.slice(0, -1)), "$jsonArrayUnshift"); l.unshift(parseLoose(S(a[a.length - 1]))); limit(c); return ""; }, { min: 2, q: true });
  F(CJ, "jsonArrayPop", "clave;…", "Quita y devuelve el último elemento de la lista.", (c, a) => show(target(c, keyList(a).filter(x => x !== ""), "$jsonArrayPop").pop()));
  F(CJ, "jsonArrayShift", "clave;…", "Quita y devuelve el primer elemento de la lista.", (c, a) => show(target(c, keyList(a).filter(x => x !== ""), "$jsonArrayShift").shift()));
  // Cuenta listas dentro de un valor (recursivo, con tope de recorrido para no colgar el bot)
  const countKind = (root, pred) => { let n = 0, seen = 0; const go = v => { if (++seen > 20000 || !isObj(v)) return; if (pred(v)) n++; for (const x of Array.isArray(v) ? v : Object.values(v)) go(x); }; go(root); return n; };
  F(CJ, "jsonArrayCount", "[clave;…]", "Sin claves: cuántas listas ([ ]) hay en todo el JSON cargado con $jsonParse (cuenta también las anidadas). Con claves: cuántos elementos tiene esa lista.", (c, a) => {
    const keys = keyList(a).filter(x => x !== ""); if (!keys.length) return countKind(c.json, Array.isArray);
    return target(c, keys, "$jsonArrayCount").length;
  });
  F(CJ, "jsonObjectCount", "[clave;…]", "Cuántos objetos ({ }) hay dentro del JSON (o de esa clave), contando los anidados.", (c, a) => { const keys = keyList(a).filter(x => x !== ""); check(keys); return countKind(keys.length ? walk(c.json, keys) : c.json, v => !Array.isArray(v)); });
  F(CJ, "jsonLength", "[clave;…]", "Tamaño de un valor: elementos de una lista, claves de un objeto o caracteres de un texto.", (c, a) => { const keys = keyList(a).filter(x => x !== ""); check(keys); const v = keys.length ? walk(c.json, keys) : c.json; return Array.isArray(v) ? v.length : isObj(v) ? Object.keys(v).length : typeof v === "string" ? v.length : 0; });
  F(CJ, "jsonKeys", "[clave;…]", "Las claves de un objeto, separadas por coma (en una lista, sus posiciones).", (c, a) => { const keys = keyList(a).filter(x => x !== ""); check(keys); const v = keys.length ? walk(c.json, keys) : c.json; return Array.isArray(v) ? v.map((_, i) => i).join(", ") : isObj(v) ? Object.keys(v).join(", ") : ""; });
  F(CJ, "jsonType", "[clave;…]", "Tipo de un valor: objeto, lista, texto, numero, booleano, nulo o vacío si no existe.", (c, a) => { const keys = keyList(a).filter(x => x !== ""); check(keys); const v = keys.length ? walk(c.json, keys) : c.json; return v === undefined ? "" : v === null ? "nulo" : Array.isArray(v) ? "lista" : typeof v === "object" ? "objeto" : typeof v === "string" ? "texto" : typeof v === "number" ? "numero" : "booleano"; });
  F(CJ, "jsonArrayUnique", "clave;…", "Quita los elementos repetidos de la lista (deja el primero de cada uno).", (c, a) => { const l = target(c, keyList(a).filter(x => x !== ""), "$jsonArrayUnique"), seen = new Set(), out = l.filter(x => { const k = JSON.stringify(x); return seen.has(k) ? false : (seen.add(k), true); }); l.splice(0, l.length, ...out); return ""; }, { q: true });
  F(CJ, "jsonArrayRemove", "clave;…;valor", "Quita de la lista todos los elementos iguales al valor. Devuelve cuántos quitó.", (c, a) => {
    const l = target(c, keyList(a.slice(0, -1)).filter(x => x !== ""), "$jsonArrayRemove"), v = S(a[a.length - 1]), keep = l.filter(x => !(show(x) === v || JSON.stringify(x) === v)), n = l.length - keep.length; l.splice(0, l.length, ...keep); return n;
  }, { min: 2 });
  F(CJ, "jsonArraySum", "clave;…", "Suma los números de la lista (ignora lo que no sea número).", (c, a) => +target(c, keyList(a).filter(x => x !== ""), "$jsonArraySum").reduce((s, x) => s + (typeof x === "number" ? x : isNaN(parseFloat(x)) || !isFinite(x) ? 0 : +x), 0).toFixed(6));
  F(CJ, "jsonArrayIndex", "clave;…;valor", "Posición (desde 0) de un valor en la lista, o -1 si no está.", (c, a) => {
    const l = target(c, keyList(a.slice(0, -1)).filter(x => x !== ""), "$jsonArrayIndex"), v = S(a[a.length - 1]);
    return l.findIndex(x => show(x) === v || JSON.stringify(x) === v);
  }, { min: 1 });
  F(CJ, "jsonArrayReverse", "clave;…", "Invierte el orden de la lista.", (c, a) => { target(c, keyList(a).filter(x => x !== ""), "$jsonArrayReverse").reverse(); return ""; }, { q: true });
  F(CJ, "jsonArraySort", "clave;…", "Ordena la lista (números de menor a mayor, textos alfabéticamente).", (c, a) => { target(c, keyList(a).filter(x => x !== ""), "$jsonArraySort").sort(cmp); return ""; }, { q: true });
  F(CJ, "jsonJoinArray", "clave;…;separador", "Une los elementos de la lista en un texto con ese separador.", (c, a) => {
    const l = target(c, keyList(a.slice(0, -1)).filter(x => x !== ""), "$jsonJoinArray"); return l.map(show).join(S(a[a.length - 1]));
  }, { min: 2 });
};
