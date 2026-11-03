// Intérprete de SBScript. Evalúa el árbol creado por parser.js con límites de pasos, de tiempo y de bucles.
// El texto que escribe un usuario NUNCA se vuelve a interpretar como código: solo se inserta como texto.
const MAX_STEPS = 4000, MAX_LOOP = 200;
class Stop extends Error { constructor(msg) { super(msg || ""); this.stop = true; this.msg = msg || ""; } }
class Brk extends Error { }

let FN = {};
const bind = f => { FN = f; };

const truthy = v => { v = String(v).trim().toLowerCase(); return v !== "" && v !== "false" && v !== "0" && v !== "no" && v !== "null"; };
const num = v => { const s = String(v).trim(); return s !== "" && Number.isFinite(Number(s)) ? Number(s) : NaN; };

async function ev(ctx, nodes) { let s = ""; for (const n of nodes) { if (n.t === "text") s += n.v; else s += await node(ctx, n); } return s; }

async function node(ctx, n) {
  if (++ctx.steps > MAX_STEPS) throw Error("El comando hace demasiadas operaciones");
  if (Date.now() > ctx.deadline) throw Error("El comando tardó demasiado en ejecutarse");
  if (n.t === "call") {
    const f = FN[n.name];
    if (!f) throw Error(`La función $${n.raw} no existe`);
    try {
      let r;
      if (f.lazy) r = await f.fn(ctx, n.args);
      else { const a = []; for (const x of n.args) a.push(await ev(ctx, x)); r = await f.fn(ctx, a); }
      return r == null ? "" : String(r);
    } catch (e) {
      if (e.stop || e instanceof Brk || e.at) throw e;
      e.at = n.pos; e.message = `$${f.n}: ${e.message}`; throw e;
    }
  }
  if (n.t === "if") { for (const b of n.branches) if (await cond(ctx, b.cond)) return ev(ctx, b.body); return n.else ? ev(ctx, n.else) : ""; }
  if (n.t === "for") {
    const fa = []; for (const x of n.args) fa.push(await ev(ctx, x)); const [v, a, b, st] = fa; // en orden (antes se evaluaban a la vez) let from = num(a), to = num(b), step = st === undefined ? 1 : num(st);
    if (!v || isNaN(from) || isNaN(to) || isNaN(step) || !step) throw Error("$for[variable;desde;hasta;paso] necesita números válidos");
    let out = "", k = 0;
    for (let x = from; step > 0 ? x <= to : x >= to; x += step) {
      if (++k > MAX_LOOP) throw Error(`Un bucle no puede dar más de ${MAX_LOOP} vueltas`);
      ctx.vars.set(v.trim(), String(x));
      try { out += await ev(ctx, n.body); } catch (e) { if (e instanceof Brk) break; throw e; }
    }
    return out;
  }
  if (n.t === "while") {
    let out = "", k = 0;
    while (await cond(ctx, n.cond)) {
      if (++k > MAX_LOOP) throw Error(`Un bucle no puede dar más de ${MAX_LOOP} vueltas`);
      try { out += await ev(ctx, n.body); } catch (e) { if (e instanceof Brk) break; throw e; }
    }
    return out;
  }
  return "";
}

// Condiciones: los operadores solo cuentan si los escribió el autor del comando (no si vienen de un texto de usuario).
const OPS = /(&&|\|\||==|!=|>=|<=|~=|>|<)/g;
async function cond(ctx, nodes) {
  const toks = []; let cur = "";
  for (const n of nodes) {
    if (n.t === "text") {
      let last = 0, m; OPS.lastIndex = 0;
      while ((m = OPS.exec(n.v))) { toks.push({ s: cur + n.v.slice(last, m.index) }); cur = ""; toks.push({ op: m[1] }); last = m.index + m[0].length; }
      cur += n.v.slice(last);
    } else cur += await node(ctx, n);
  }
  toks.push({ s: cur });
  // toks alterna: valor, operador, valor, operador…  Se separa por || y luego por &&
  const clauses = [[]];
  for (const t of toks) {
    if (t.op === "||") clauses.push([]); else clauses[clauses.length - 1].push(t);
  }
  for (const group of clauses) {
    const ands = [[]];
    for (const t of group) { if (t.op === "&&") ands.push([]); else ands[ands.length - 1].push(t); }
    let all = true;
    for (const c of ands) {
      if (!one(c)) { all = false; break; }
    }
    if (all) return true;
  }
  return false;
  function one(c) {
    const vals = c.filter(t => t.s !== undefined).map(t => t.s.trim()), op = c.find(t => t.op && t.op !== "&&" && t.op !== "||")?.op;
    if (!op) return truthy(vals.join(" "));
    const [a, b = ""] = vals, x = num(a), y = num(b), numeric = !isNaN(x) && !isNaN(y);
    switch (op) {
      case "==": return numeric ? x === y : a === b;
      case "!=": return numeric ? x !== y : a !== b;
      case ">": return numeric ? x > y : a > b;
      case "<": return numeric ? x < y : a < b;
      case ">=": return numeric ? x >= y : a >= b;
      case "<=": return numeric ? x <= y : a <= b;
      case "~=": return a.toLowerCase().includes(b.toLowerCase());
    }
    return false;
  }
}

// Ejecuta un comando ya compilado. ctx lo prepara custom.js (quién lo usa, dónde, opciones…).
async function exec(compiled, ctx) {
  Object.assign(ctx, { http: undefined, json: undefined, steps: 0, deadline: Date.now() + (ctx.limitMs || 4000), vars: new Map(), sim: ctx.sim || [], out: { embed: {}, fields: [], files: [], buttons: [], selects: [], lastSel: null, modalDef: null, inputs: [], modal: null, update: false, clearButtons: false, eph: false, del: false, reactions: [], ai: 0 } });
  try {
    const text = (await ev(ctx, compiled.ast)).replace(/\n{3,}/g, "\n\n").trim();
    finish(ctx.out);
    return { content: text.slice(0, 2000), out: ctx.out, sim: ctx.sim };
  } catch (e) {
    if (e.stop) return { content: e.msg, out: ctx.out, sim: ctx.sim, stopped: true };
    const at = e.at != null ? compiled.lineOf(e.at) : null;
    return { error: e.message + (at ? ` (línea ${at.line})` : ""), out: ctx.out, sim: ctx.sim };
  }
}

// Comprueba los menús y construye el formulario (modal) con lo que fue dejando el script
function finish(o) {
  for (const s of o.selects) {
    if (s.type !== 3) continue;
    const n = (s.options || []).length, id = s.custom_id.slice(4);
    if (!n) throw Error(`El menú «${id}» no tiene opciones: añade al menos una con $addSelectOption`);
    if (s.max_values > n) s.max_values = n; if (s.min_values > s.max_values) s.min_values = s.max_values;
  }
  if (!o.modalDef && o.inputs.length) throw Error("Hay campos con $addTextInput pero falta $showModal[id;título] para abrir el formulario");
  if (o.modalDef) {
    if (!o.inputs.length) throw Error("El formulario no tiene campos: añade al menos uno con $addTextInput");
    o.modal = { custom_id: "sbs:" + o.modalDef.id, title: o.modalDef.title, components: o.inputs.map(t => ({ type: 1, components: [t] })) };
  }
}

// Convierte lo que dejó el script en un mensaje de Discord
function payload(r) {
  const o = r.out, em = o.embed, p = {};
  if (r.content) p.content = r.content;
  if (Object.keys(em).length || o.fields.length) {
    const e = { color: em.color ?? 0x4f8cff };
    for (const k of ["title", "description", "timestamp"]) if (em[k]) e[k] = String(em[k]).slice(0, k === "description" ? 4000 : 256);
    if (em.titleUrl && e.title) e.url = em.titleUrl;
    for (const k of ["image", "thumbnail"]) if (em[k]) e[k] = { url: em[k] };
    if (em.footer || em.footerIcon) e.footer = { text: String(em.footer || "\u200b").slice(0, 2000), ...(em.footerIcon ? { icon_url: em.footerIcon } : {}) };
    if (em.author || em.authorIcon) e.author = { name: String(em.author || "\u200b").slice(0, 256), ...(em.authorIcon ? { icon_url: em.authorIcon } : {}), ...(em.authorUrl ? { url: em.authorUrl } : {}) };
    if (o.fields.length) e.fields = o.fields.slice(0, 25);
    p.embeds = [e];
  }
  if (o.files.length) p.files = o.files.slice(0, 3).map(f => ({ attachment: f.data, name: f.name }));
  const rows = []; for (let k = 0; k < o.buttons.length && k < 25; k += 5) rows.push({ type: 1, components: o.buttons.slice(k, k + 5) });
  for (const s of o.selects) rows.push({ type: 1, components: [s] }); // cada menú ocupa una fila entera
  if (rows.length) p.components = rows.slice(0, 5);
  else if (o.clearButtons) p.components = [];
  return p;
}

module.exports = { exec, ev, cond, payload, bind, Stop, Brk, truthy, num };
