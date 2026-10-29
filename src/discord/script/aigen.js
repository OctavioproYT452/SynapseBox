// Generador de comandos SBScript con IA. La IA lee TODA la wiki (guías, recetas y las funciones con su ejemplo), escribe el comando,
// se comprueba con el analizador y, si hay errores, se le devuelven para que los corrija (máx. 2 reintentos).
// Nunca guarda nada: devuelve el código al editor para que la persona lo revise, lo pruebe y lo guarde ella.
const ai = require("../../ai");
const wiki = require("./wiki");
const { DOCS } = require("./functions");
const custom = require("../custom");

let KNOW = null;
function flat(b) { return b.t === "p" || b.t === "tip" ? String(b.v) : b.t === "ul" ? b.v.map(x => "- " + x).join("\n") : b.t === "code" ? "```\n" + b.v + "\n```" : b.t === "table" ? [b.h.join(" | "), ...b.r.map(r => r.join(" | "))].join("\n") : ""; }
function knowledge() {
  if (KNOW) return KNOW;
  const guides = wiki.GUIDES.map(g => `## ${g.title}\n` + g.b.map(flat).filter(Boolean).join("\n")).join("\n\n");
  const by = {}; DOCS.forEach(d => (by[d.c] ??= []).push(d));
  const funcs = Object.entries(by).map(([c, l]) => `### ${c}\n` + l.map(d => { const ex = wiki.EXAMPLES[d.n]; return `$${d.n}${d.a ? "[" + d.a + "]" : ""} — ${d.d}` + (ex ? `\n   ej: ${ex[0].replace(/\n/g, " ⏎ ")}${ex[1] ? "  (" + ex[1] + ")" : ""}` : ""); }).join("\n")).join("\n\n");
  return (KNOW = { guides, funcs });
}
const SYSTEM = () => {
  const k = knowledge();
  return `Eres un experto en SBScript, el lenguaje de comandos propios del bot de Discord de SynapseBox. Tu trabajo: convertir lo que pide el administrador en UN comando SBScript correcto.

Reglas estrictas:
- Usa SOLO funciones que existan en la REFERENCIA de abajo, con sus argumentos tal como están indicados ([x] = opcional). No inventes funciones ni sintaxis de otros lenguajes. Los nombres no distinguen mayúsculas.
- Los argumentos se separan con ; y se pueden anidar funciones. Escapes: \\$ \; \\[ \\] \\\\. Comentarios: líneas que empiezan por //.
- Los bloques son $if/$elseif/$else/$endif, $for/$endfor y $while/$endwhile. Condiciones con == != > < >= <= ~= && ||.
- Máximo 20000 caracteres de código. Escribe los textos para el usuario en español, a menos que se pida otro idioma.
- Para comandos slash, define las opciones en la cabecera y léelas con $option[nombre]. Para prefijo/mensaje, usa $message, $message[n] y $mentioned[n].
- Los botones se ponen con $addButton/$addLinkButton en el mensaje; lo que pasa al pulsarlos se programa en OTRO comando de tipo boton cuyo disparador es el id del botón. Si hacen falta varios comandos (p. ej. un panel y su botón), genera solo el que se pide y explica en NOTAS el comando de tipo boton que falta, con su código. El sistema de tickets ya existe (/tickets): no lo reprogrames.
- HTTP y JSON (estilo BDFD): primero se hace la petición ($httpGet/$httpPost/$httpPut/$httpPatch/$httpDelete, que no escriben nada) y luego se lee con $httpResult[clave;…] y $httpStatus. Para trabajar con la respuesta usa $jsonParse[$httpResult] y $json[clave;…]; en listas la primera posición es 0. Pon siempre un mensaje de error en la petición (último argumento) y valida con $onlyIf[$httpStatus==200;…]. Solo hay http/https públicos, máx. 5 peticiones, 8 s y 1 MB. Si escribes un JSON a mano, sus corchetes se escapan como \\[ y \\]. No inventes APIs ni claves: usa las URLs que dé el administrador y avisa en NOTAS de las claves que debe revisar.
- Para elegir entre textos sin bloques usa $ternary[cond;sí;no], $switch[valor;caso;resultado;…;porDefecto] o $coalesce; para duraciones escritas («2h30m») usa $parseDuration y $addTime; para unidades usa $convertUnit; para dados de rol $rollDice[2d6+3]; para fechas de creación de IDs de Discord $snowflakeTime. Prefiere estas funciones a escribir bloques $if largos.
- Si lo pedido necesita algo que SBScript no puede hacer, haz lo más cercano posible y explícalo en NOTAS. No prometas funciones inexistentes.
- Usa $cooldown en comandos que puedan abusarse, $onlyIf para validar entradas y los permisos adecuados en moderación. Si usas IA ($ai…), compruébalo con $aiAvailable cuando tenga sentido.
- Si te dan un comando existente para modificar, devuelve el comando COMPLETO ya modificado.

FORMATO DE RESPUESTA (exacto, sin bloques de código markdown, sin nada antes ni después):
===META===
nombre: nombre-en-minusculas (letras, números, - y _; máx. 32)
tipo: slash | prefijo | mensaje | boton
descripcion: máx. 100 caracteres (obligatoria en slash)
acceso: todos | vinculados | admin | gestores
opciones: nombre:tipo:si|no:descripción | otra:tipo:no:descripción     (solo slash; tipos: string integer number boolean user channel role; si|no = obligatoria)
alias: a, b     (solo prefijo, opcional)
disparador: texto que activa el comando (tipo mensaje) o id del botón sin el prefijo (tipo boton; letras, números y _ : . -)
coincidencia: exacta | contiene | empieza     (mensaje: las tres; boton: exacta | empieza)
===CODIGO===
(el código SBScript)
===NOTAS===
(2-4 líneas en español: qué hace, cómo usarlo y cualquier limitación o ajuste que deba hacer el administrador, como poner un ID de rol)

========== GUÍAS DE LA WIKI ==========
${k.guides}

========== REFERENCIA DE FUNCIONES (${DOCS.length}) ==========
${k.funcs}`;
};

function section(t, name, next) { const a = t.indexOf(name); if (a < 0) return ""; const from = a + name.length, b = next.map(n => t.indexOf(n, from)).filter(x => x >= 0).sort((x, y) => x - y)[0]; return t.slice(from, b ?? t.length).replace(/^\s*\n/, "").replace(/\s+$/, ""); }
function parse(raw) {
  let t = String(raw).replace(/\r/g, "").replace(/```[a-z]*\n?/gi, ""); // por si la IA añade vallas de markdown
  const metaTxt = section(t, "===META===", ["===CODIGO==="]), code = section(t, "===CODIGO===", ["===NOTAS==="]), notes = section(t, "===NOTAS===", []);
  if (!code) throw Error("la IA no devolvió el código en el formato esperado");
  const m = {}; for (const l of metaTxt.split("\n")) { const x = /^\s*([a-záéíóúñ]+)\s*:\s*(.*)$/i.exec(l); if (x) m[x[1].toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")] = x[2].trim(); }
  return { m, code: code.replace(/^\n+/, ""), notes };
}

// current: { name, meta, code } si se quiere modificar un comando abierto · tipo: "" (que decida la IA) o slash|prefijo|mensaje
async function generate(user, { instructions, current = null, tipo = "" }) {
  instructions = String(instructions || "").trim().slice(0, 4000); if (instructions.length < 8) throw Error("Describe con más detalle qué debe hacer el comando");
  return ai.session(user, async chat => {
    const first = (current ? `Comando actual (nombre «${String(current.name || "").slice(0, 40)}», tipo ${current.meta?.tipo}):\n===CODIGO===\n${String(current.code || "").slice(0, 20000)}\n\nModifícalo según esto:\n` : "Crea un comando nuevo:\n") + instructions + (tipo ? `\n\nEl tipo debe ser: ${tipo}.` : "");
    const msgs = [{ role: "system", content: SYSTEM() }, { role: "user", content: first }];
    let last = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const raw = await chat(msgs); msgs.push({ role: "assistant", content: raw });
      let p; try { p = parse(raw); } catch (e) { msgs.push({ role: "user", content: "Error: " + e.message + ". Responde de nuevo SOLO con el formato exacto (===META===, ===CODIGO===, ===NOTAS===)." }); continue; }
      const meta = custom.normMeta({ ...p.m, tipo: tipo || p.m.tipo || current?.meta?.tipo }), errors = custom.checkCode(p.code, meta);
      last = { name: custom.slugName(p.m.nombre || current?.name || "comando-ia") || "comando-ia", meta, code: p.code.slice(0, 20000), notes: p.notes, errors, attempts: attempt + 1 };
      if (!errors.length) return last;
      msgs.push({ role: "user", content: "El analizador encontró estos errores. Corrígelos y devuelve el comando COMPLETO en el mismo formato:\n" + errors.slice(0, 15).map(e => `- línea ${e.line}, col ${e.col}: ${e.msg}`).join("\n") });
    }
    if (!last) throw Error("la IA no devolvió un comando válido; inténtalo de nuevo con otra descripción");
    last.notes = (last.notes ? last.notes + "\n" : "") + "⚠️ Quedan errores que la IA no pudo corregir: revísalos en el panel «Problemas».";
    return last;
  });
}

module.exports = { generate, SYSTEM, parse };
