// Comandos propios del bot (SBScript). Cada comando es un archivo .sbs (antes .fcs, se siguen leyendo) dentro de data/discord-commands/<carpeta>/.
// Al arrancar (o al guardar) se leen y se compilan UNA vez; después solo se ejecuta el árbol que está en memoria.
//   Tipos: slash (/comando con opciones) · prefijo (!comando) · mensaje (responde a un texto concreto)
const fs = require("fs"), path = require("path");
const { DATA } = require("../config");
const { parse, check } = require("./script/parser");
const { FN, QUIET, DOCS } = require("./script/functions");
const R = require("./script/runtime");
const store = require("./store");
const { setting } = require("../lib/settings");

const DIR = path.join(DATA, "discord-commands"), EXT = ".sbs", OLD_EXT = ".fcs"; // .fcs: formato anterior, se lee y se migra al guardar
const MAX_CMDS = 200, MAX_CODE = 20000, MAX_SLASH = 60;
const TYPES = ["slash", "prefijo", "mensaje", "boton"], ACCESS = ["todos", "vinculados", "admin", "gestores"], MATCH = ["exacta", "contiene", "empieza"];
const OPT = { string: 3, integer: 4, boolean: 5, user: 6, channel: 7, role: 8, number: 10 };
// Nombres que ya usa el propio bot (un comando propio no puede llamarse igual)
const RESERVED = new Set("ayuda vincular desvincular cuenta archivos buscar enlaces ia version ping servidorinfo usuarioinfo avatar config servidor usuarios usuario suspender reactivar anuncio registro actualizar bienvenida dado moneda elegir encuesta recientes favoritos comandos limpiar".split(" "));

let cmds = null, folders = new Set(), slash = new Map(), pre = new Map(), trig = [], btns = [], D = null, hook = null;
const seg = s => String(s || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
function dirOf(folder) {
  const parts = String(folder || "").split("/").map(seg).filter(Boolean);
  if (parts.length > 3) throw Error("Máximo 3 niveles de carpetas");
  const p = path.join(DIR, ...parts); if (p !== DIR && !p.startsWith(DIR + path.sep)) throw Error("Carpeta inválida");
  return { parts, p, folder: parts.join("/") };
}
const idOf = (folder, name) => (folder ? folder + "/" : "") + name;
const prefix = () => { const p = String(setting("discord_prefix") || "!"); return /^\S{1,3}$/.test(p) ? p : "!"; };

// ---------- lectura y escritura de archivos ----------
const ALLOWED = { tipo: 1, descripcion: 1, acceso: 1, activo: 1, opciones: 1, alias: 1, disparador: 1, coincidencia: 1 };
function split(text) {
  const meta = {}, lines = String(text).replace(/^\uFEFF/, "").split(/\r?\n/); let k = 0;
  for (; k < lines.length; k++) { const m = /^\/\/@\s*([a-záéíóúñ]+)\s*:\s*(.*)$/i.exec(lines[k]); if (!m) break; const key = m[1].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); if (ALLOWED[key]) meta[key] = m[2].trim(); }
  return { meta: norm(meta), code: lines.slice(k).join("\n").replace(/^\n+/, "") };
}
function norm(m) {
  const o = {
    tipo: TYPES.includes(m.tipo) ? m.tipo : "slash", descripcion: String(m.descripcion || "").slice(0, 100), acceso: ACCESS.includes(m.acceso) ? m.acceso : "todos",
    activo: !/^(no|false|0)$/i.test(String(m.activo ?? "si")), alias: [], opciones: [], disparador: m.tipo === "boton" ? String(m.disparador || "").replace(/^(?:fcs|sbs):/, "").replace(/[^A-Za-z0-9_:.-]/g, "").slice(0, 80) : String(m.disparador || "").slice(0, 100), coincidencia: MATCH.includes(m.coincidencia) ? m.coincidencia : "contiene",
  };
  const al = Array.isArray(m.alias) ? m.alias : String(m.alias || "").split(",");
  o.alias = [...new Set(al.map(seg).filter(Boolean))].slice(0, 5);
  const ops = Array.isArray(m.opciones) ? m.opciones : String(m.opciones || "").split("|").map(s => s.trim()).filter(Boolean).map(s => { const [name, type, req, ...d] = s.split(":"); return { name, type, required: /^(si|true|1)$/i.test((req || "").trim()), desc: d.join(":") }; });
  o.opciones = ops.slice(0, 25).map(x => ({ name: seg(x.name).replace(/-/g, "_").slice(0, 32), type: OPT[x.type] ? x.type : "string", required: !!x.required, desc: String(x.desc || "").trim().slice(0, 100) || "Opción" })).filter(x => x.name);
  return o;
}
function serialize(m, code) {
  const h = [`//@ tipo: ${m.tipo}`, `//@ descripcion: ${m.descripcion.replace(/\n/g, " ")}`, `//@ acceso: ${m.acceso}`, `//@ activo: ${m.activo ? "si" : "no"}`];
  if (m.tipo === "slash" && m.opciones.length) h.push(`//@ opciones: ${m.opciones.map(o => `${o.name}:${o.type}:${o.required ? "si" : "no"}:${o.desc.replace(/[|\n]/g, " ")}`).join(" | ")}`);
  if (m.tipo === "prefijo" && m.alias.length) h.push(`//@ alias: ${m.alias.join(", ")}`);
  if (m.tipo === "mensaje" || m.tipo === "boton") h.push(`//@ disparador: ${m.disparador.replace(/\n/g, " ")}`, `//@ coincidencia: ${m.coincidencia}`);
  return h.join("\n") + "\n\n" + code.replace(/\r\n/g, "\n");
}
// Nombres de todas las funciones que usa un árbol (para saber si el comando llama a la IA o es efímero)
function usedNames(ast, set = new Set()) {
  for (const x of ast) {
    if (x.t === "call") { set.add(x.name); x.args.forEach(a => usedNames(a, set)); }
    else if (x.t === "if") { x.branches.forEach(b => { usedNames(b.cond, set); usedNames(b.body, set); }); if (x.else) usedNames(x.else, set); }
    else if (x.t === "for") { x.args.forEach(a => usedNames(a, set)); usedNames(x.body, set); }
    else if (x.t === "while") { usedNames(x.cond, set); usedNames(x.body, set); }
  }
  return set;
}
function compile(c) {
  const p = parse(c.code, QUIET); check(p.ast, p.errors, p.lineOf, FN); c.ast = p.ast; c.lineOf = p.lineOf; c.errors = p.errors;
  c.uses = usedNames(p.ast); c.slow = [...c.uses].some(n => n.startsWith("ai") && n !== "aiavailable" && n !== "aipersona"); // la IA tarda: hay que "pensar" antes de contestar
  return c;
}

function load() {
  cmds = new Map(); folders = new Set(); fs.mkdirSync(DIR, { recursive: true });
  const walk = (dir, rel, depth) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory() && depth < 3) { const r = idOf(rel, e.name); folders.add(r); walk(path.join(dir, e.name), r, depth + 1); }
      else if (e.isFile() && (e.name.endsWith(EXT) || (e.name.endsWith(OLD_EXT) && !fs.existsSync(path.join(dir, e.name.slice(0, -OLD_EXT.length) + EXT)))) && cmds.size < MAX_CMDS) {
        const name = e.name.slice(0, -EXT.length); try { const { meta, code } = split(fs.readFileSync(path.join(dir, e.name), "utf8")); cmds.set(idOf(rel, name), compile({ id: idOf(rel, name), folder: rel, name, meta, code })); }
        catch (x) { console.warn("[Discord] No se pudo leer el comando", e.name, x.message); }
      }
    }
  };
  walk(DIR, "", 0); index();
}
const ensure = () => { if (!cmds) load(); };

function index() {
  slash = new Map(); pre = new Map(); trig = []; btns = [];
  for (const c of cmds.values()) {
    if (!c.meta.activo) continue;
    if (c.meta.tipo === "slash") { if (!RESERVED.has(c.name)) slash.set(c.name, c); }
    else if (c.meta.tipo === "prefijo") { for (const n of [c.name, ...c.meta.alias]) if (!pre.has(n)) pre.set(n, c); }
    else if (c.meta.tipo === "mensaje" && c.meta.disparador) trig.push(c);
    else if (c.meta.tipo === "boton" && c.meta.disparador) btns.push(c);
  }
}
function changed() { index(); try { hook?.(); } catch { } }

// ---------- guardado ----------
function validate(folder, name, meta, code, oldId) {
  if (!/^[a-z0-9_-]{1,32}$/.test(name)) throw Error("El nombre solo puede tener letras minúsculas, números, - y _ (máx. 32)");
  if (code.length > MAX_CODE) throw Error(`El código es demasiado largo (máx. ${MAX_CODE} caracteres)`);
  const id = idOf(folder, name), others = [...cmds.values()].filter(c => c.id !== oldId && c.id !== id);
  if (cmds.has(id) && id !== oldId) throw Error("Ya existe un comando con ese nombre en esa carpeta");
  if (!oldId && cmds.size >= MAX_CMDS) throw Error(`Máximo ${MAX_CMDS} comandos`);
  if (meta.tipo === "slash") {
    if (RESERVED.has(name)) throw Error(`«${name}» ya lo usa el propio bot: elige otro nombre`);
    if (!meta.descripcion.trim()) throw Error("Los comandos slash necesitan una descripción (máx. 100 caracteres)");
    if (others.some(c => c.meta.tipo === "slash" && c.name === name && c.meta.activo) && meta.activo) throw Error("Ya hay otro comando slash activo con ese nombre");
    if (meta.activo && others.filter(c => c.meta.tipo === "slash" && c.meta.activo).length >= MAX_SLASH) throw Error(`Máximo ${MAX_SLASH} comandos slash activos`);
    const seen = new Set(); for (const o of meta.opciones) { if (seen.has(o.name)) throw Error(`La opción «${o.name}» está repetida`); seen.add(o.name); }
    meta.opciones.sort((a, b) => b.required - a.required);
  }
  if (meta.tipo === "prefijo") for (const n of [name, ...meta.alias]) { const o = others.find(c => c.meta.tipo === "prefijo" && c.meta.activo && [c.name, ...c.meta.alias].includes(n)); if (o && meta.activo) throw Error(`«${n}» ya lo usa el comando ${o.id}`); }
  if (meta.tipo === "mensaje" && !meta.disparador.trim()) throw Error("Escribe el texto que activa el comando");
  if (meta.tipo === "boton") {
    if (!meta.disparador) throw Error("Escribe el id del botón que lo activa (letras, números y _ : . -)");
    const o = others.find(c => c.meta.tipo === "boton" && c.meta.activo && c.meta.disparador === meta.disparador && c.meta.coincidencia === meta.coincidencia); if (o && meta.activo) throw Error(`El comando ${o.id} ya responde a ese botón`);
  }
  return id;
}
function save({ id: oldId, folder, name, meta, code }) {
  ensure(); const { parts, p, folder: fo } = dirOf(folder); name = seg(name);
  meta = norm(meta || {}); code = String(code ?? "");
  const id = validate(fo, name, meta, code, oldId && cmds.has(oldId) ? oldId : null);
  fs.mkdirSync(p, { recursive: true });
  const file = path.join(p, name + EXT), tmp = file + ".tmp";
  fs.writeFileSync(tmp, serialize(meta, code)); fs.renameSync(tmp, file); try { fs.unlinkSync(path.join(p, name + OLD_EXT)); } catch { }
  if (oldId && oldId !== id && cmds.has(oldId)) { const o = cmds.get(oldId); for (const x of [EXT, OLD_EXT]) try { fs.unlinkSync(path.join(dirOf(o.folder).p, o.name + x)); } catch { } cmds.delete(oldId); }
  for (let k = 1; k <= parts.length; k++) folders.add(parts.slice(0, k).join("/"));
  const c = compile({ id, folder: fo, name, meta, code }); cmds.set(id, c); changed();
  return { id, errors: c.errors };
}
function remove(id) {
  ensure(); const c = cmds.get(id); if (!c) throw Error("Ese comando no existe");
  for (const x of [EXT, OLD_EXT]) try { fs.unlinkSync(path.join(dirOf(c.folder).p, c.name + x)); } catch { }
  cmds.delete(id); changed();
}
function folder(action, fp, to, force) {
  ensure(); const a = dirOf(fp); if (!a.folder) throw Error("Indica una carpeta");
  if (action === "create") { if (fs.existsSync(a.p)) throw Error("Esa carpeta ya existe"); fs.mkdirSync(a.p, { recursive: true }); }
  else if (action === "rename") { const b = dirOf(to); if (!b.folder) throw Error("Indica el nuevo nombre"); if (fs.existsSync(b.p)) throw Error("Ya existe una carpeta con ese nombre"); if (b.p.startsWith(a.p + path.sep)) throw Error("No puedes mover una carpeta dentro de sí misma"); fs.mkdirSync(path.dirname(b.p), { recursive: true }); fs.renameSync(a.p, b.p); }
  else if (action === "delete") { const has = [...cmds.values()].some(c => c.folder === a.folder || c.folder.startsWith(a.folder + "/")); if (has && !force) throw Error("La carpeta tiene comandos: confirma para borrarla con todo su contenido"); fs.rmSync(a.p, { recursive: true, force: true }); }
  else throw Error("Acción no válida");
  load(); try { hook?.(); } catch { }
}

// ---------- consultas para la web ----------
const list = () => { ensure(); return { folders: [...folders].sort(), commands: [...cmds.values()].map(c => ({ id: c.id, folder: c.folder, name: c.name, tipo: c.meta.tipo, descripcion: c.meta.descripcion, activo: c.meta.activo, acceso: c.meta.acceso, errores: c.errors.length })).sort((a, b) => a.name.localeCompare(b.name)) }; };
const read = id => { ensure(); const c = cmds.get(id); if (!c) throw Error("Ese comando no existe"); return { id: c.id, folder: c.folder, name: c.name, meta: c.meta, code: c.code, errors: c.errors }; };
function checkCode(code, meta) { const c = compile({ code: String(code || "").slice(0, MAX_CODE * 2), meta: norm(meta || {}) }); return c.errors; }

// ---------- registro de comandos slash ----------
const slashJson = () => [...slash.values()].slice(0, MAX_SLASH).map(c => ({
  name: c.name, description: (c.meta.descripcion || "Comando personalizado").slice(0, 100), dm_permission: false,
  options: c.meta.opciones.map(o => ({ type: OPT[o.type], name: o.name, description: o.desc, required: o.required })),
}));

// ---------- ejecución ----------
const last = new Map(), spam = id => { const t = Date.now(), p = last.get(id) || 0; if (t - p < 1000) return true; last.set(id, t); if (last.size > 2000) for (const [k, v] of last) if (t - v > 6e4) last.delete(k); return false; };
function allowed(c, sb, member) {
  const a = c.meta.acceso;
  if (a === "todos") return true;
  if (a === "vinculados") return !!sb;
  if (a === "admin") return !!sb?.is_admin;
  return !!(sb?.is_admin || member?.permissions?.has?.("ManageGuild"));
}
const NOPE = { vinculados: "Primero vincula tu cuenta con **/vincular**.", admin: "Este comando es solo para administradores de SynapseBox.", gestores: "Este comando es para administradores de SynapseBox o quien gestione el servidor." };
function userOf(did) { const u = store.userByDiscord(did); return u && !u.suspended ? u : null; }

async function runSlash(i) {
  ensure(); const c = slash.get(i.commandName); if (!c) return false;
  const EPH = D.MessageFlags.Ephemeral;
  if (spam(i.user.id)) { await i.reply({ content: "Más despacio: espera un segundo.", flags: EPH }); return true; }
  const sb = userOf(i.user.id);
  if (!allowed(c, sb, i.member)) { await i.reply({ content: NOPE[c.meta.acceso], flags: EPH }); return true; }
  const opts = new Map(), argv = [], mentions = [];
  for (const o of c.meta.opciones) { const v = i.options.get(o.name)?.value; if (v === undefined || v === null) continue; opts.set(o.name, String(v)); argv.push(String(v)); if (o.type === "user") mentions.push(String(v)); }
  let deferred = false;
  if (c.slow) { await i.deferReply(c.uses.has("ephemeral") ? { flags: EPH } : {}); deferred = true; }
  const send = o => deferred ? i.editReply((delete o.flags, o)) : i.reply(o);
  const r = await R.exec(c, { kind: "slash", D, client: i.client, inter: i, user: i.user, member: i.member, guild: i.guild, channel: i.channel, argv, opts, mentions, cmd: { id: c.id, name: c.name }, prefix: prefix(), sb });
  if (r.error) return void await send({ content: "⚠️ Error en el comando: " + r.error.slice(0, 1500), flags: EPH }), true;
  const p = R.payload(r);
  if (r.stopped || r.out.eph) p.flags = EPH;
  if (!p.content && !p.embeds) { p.content = r.stopped ? "Comando cancelado." : "✓"; p.flags = EPH; }
  p.allowedMentions = { parse: ["users"] };
  await send(p); return true;
}

// Botón de un mensaje de SBScript (id «sbs:…»; los antiguos «fcs:…» también funcionan): se busca el comando de tipo «boton» cuyo activador coincide
async function runButton(i) {
  ensure(); const bid = String(i.customId).slice(4), EPH = D.MessageFlags.Ephemeral;
  const c = btns.find(b => b.meta.coincidencia === "exacta" ? bid === b.meta.disparador : b.meta.coincidencia === "empieza" ? bid.startsWith(b.meta.disparador) : bid.includes(b.meta.disparador));
  if (!c) return void await i.reply({ content: "Este botón ya no hace nada.", flags: EPH });
  if (spam(i.user.id)) return void await i.reply({ content: "Más despacio: espera un segundo.", flags: EPH });
  const sb = userOf(i.user.id);
  if (!allowed(c, sb, i.member)) return void await i.reply({ content: NOPE[c.meta.acceso], flags: EPH });
  const upd = c.uses.has("updatemessage"); let deferred = false;
  if (c.slow) { if (upd) await i.deferUpdate(); else await i.deferReply(c.uses.has("ephemeral") ? { flags: EPH } : {}); deferred = true; }
  const r = await R.exec(c, { kind: "button", D, client: i.client, inter: i, btn: bid, user: i.user, member: i.member, guild: i.guild, channel: i.channel, argv: [], opts: new Map(), mentions: [], cmd: { id: c.id, name: c.name }, prefix: prefix(), sb });
  if (r.error) { const o = { content: "⚠️ Error en el comando: " + r.error.slice(0, 1500), flags: EPH }; return void await (deferred ? (upd ? i.followUp(o) : i.editReply((delete o.flags, o))) : i.reply(o)); }
  const p = R.payload(r); p.allowedMentions = { parse: ["users"] };
  if (!p.content && !p.embeds && !p.files && !p.components) { if (deferred && upd) return; if (r.stopped || !r.out.update) { const o = { content: r.stopped ? "Cancelado." : "✓", flags: EPH }; return void await (deferred ? i.followUp(o) : i.reply(o)); } }
  if (r.stopped) { const o = { content: r.content || "Cancelado.", flags: EPH }; return void await (deferred ? i.followUp(o) : i.reply(o)); }
  if (r.out.update) { if (deferred) await i.editReply(p); else await i.update(p); return; }
  if (r.out.eph) p.flags = EPH;
  if (deferred) { delete p.flags; await i.editReply(p); } else await i.reply(p);
}

async function onMessage(m) {
  if (m.author.bot || !m.guild || !m.content || (!pre.size && !trig.length)) return;
  ensure(); const pf = prefix(), text = m.content.trim(); let c = null, argv = [];
  if (pre.size && text.startsWith(pf)) { const [w, ...rest] = text.slice(pf.length).split(/\s+/); c = pre.get((w || "").toLowerCase()); argv = rest; }
  if (!c) for (const t of trig) {
    const want = t.meta.disparador.toLowerCase(), low = text.toLowerCase(), k = t.meta.coincidencia;
    if (k === "exacta" ? low === want : k === "empieza" ? low.startsWith(want) : low.includes(want)) { c = t; argv = (k === "empieza" ? text.slice(want.length) : text).split(/\s+/).filter(Boolean); break; }
  }
  if (!c || spam(m.author.id)) return;
  const sb = userOf(m.author.id);
  if (!allowed(c, sb, m.member)) { if (c.meta.tipo === "prefijo") await m.reply({ content: NOPE[c.meta.acceso], allowedMentions: { repliedUser: false } }).catch(() => { }); return; }
  if (c.slow) m.channel.sendTyping?.().catch(() => { });
  const r = await R.exec(c, { kind: c.meta.tipo === "prefijo" ? "prefix" : "message", D, client: m.client, msg: m, user: m.author, member: m.member, guild: m.guild, channel: m.channel, argv, opts: new Map(), mentions: [...m.mentions.users.keys()], cmd: { id: c.id, name: c.name }, prefix: pf, sb });
  const box = { allowedMentions: { parse: ["users"], repliedUser: false } };
  if (r.error) return void await m.reply({ ...box, content: (sb?.is_admin ? "⚠️ Error en el comando: " + r.error : "Ocurrió un error en este comando.").slice(0, 1500) }).catch(() => { });
  const p = { ...R.payload(r), ...box }; if (!p.content && !p.embeds && !p.files) { if (r.out.del) m.delete().catch(() => { }); return; }
  if (r.out.del) { m.delete().catch(() => { }); await m.channel.send(p).catch(() => { }); } else await m.reply(p).catch(() => { });
}

// En la prueba del editor los archivos adjuntos se muestran como imagen incrustada (data URI) en lugar de enviarse
function preview(p) {
  const files = p.files || []; delete p.files; p.attachments = files.map(f => ({ name: f.name, size: f.attachment.length }));
  const e = p.embeds?.[0]; const m = /^attachment:\/\/(.+)$/.exec(e?.image?.url || "");
  if (m) { const f = files.find(x => x.name === m[1]); if (f) e.image.url = "data:image/png;base64," + f.attachment.toString("base64"); }
  return p;
}

// Prueba sin tocar Discord: las acciones (roles, mensajes, expulsiones…) solo se describen
async function dry(code, meta, { args = "", options = {}, sb = null } = {}) {
  const c = compile({ id: "prueba", code: String(code || ""), meta: norm(meta || {}) });
  if (c.errors.length) return { errors: c.errors };
  const user = { id: "100000000000000001", username: "tu_usuario", globalName: "Tú", bot: false, displayAvatarURL: () => "https://cdn.discordapp.com/embed/avatars/0.png", send: async () => { } };
  const opts = new Map(Object.entries(options).map(([k, v]) => [k, String(v)])), argv = c.meta.tipo === "slash" ? [...opts.values()] : String(args).split(/\s+/).filter(Boolean);
  const r = await R.exec(c, { kind: "test", dry: true, btn: c.meta.tipo === "boton" ? String(args || c.meta.disparador || "id").trim() : undefined, user, member: { displayName: "Tú", permissions: { has: () => true }, roles: { cache: { has: () => true } } }, guild: { id: "200000000000000002", name: "Servidor de prueba", memberCount: 42 }, channel: { id: "300000000000000003", name: "general" }, argv, opts, mentions: [...String(args).matchAll(/<@!?(\d{5,})>|(?<!\d)(\d{17,20})(?!\d)/g)].map(m => m[1] || m[2]).slice(0, 10), cmd: { id: "prueba", name: "prueba" }, prefix: prefix(), sb, limitMs: 3000 });
  return { errors: [], error: r.error, stopped: r.stopped, message: r.error ? null : preview(R.payload(r)), ephemeral: !!r.out.eph, simulated: r.sim, deletes: r.out.del };
}

const init = (d, reserved, onChange) => { D = d; hook = onChange; for (const n of reserved || []) RESERVED.add(n); ensure(); };
const setPrefix = p => { p = String(p || "").trim(); if (!/^\S{1,3}$/.test(p)) throw Error("El prefijo debe tener de 1 a 3 caracteres sin espacios"); store.setS("discord_prefix", p); };

module.exports = { normMeta: norm, slugName: seg, init, list, read, save, remove, folder, checkCode, dry, slashJson, runSlash, runButton, onMessage, prefix, setPrefix, docs: () => DOCS, hasSlash: n => { ensure(); return slash.has(n); }, hasMessages: () => { ensure(); return pre.size > 0 || trig.length > 0; }, limits: { cmds: MAX_CMDS, code: MAX_CODE, slash: MAX_SLASH }, OPT_TYPES: Object.keys(OPT), ACCESS, MATCH };
