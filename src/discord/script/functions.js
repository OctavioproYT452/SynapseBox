// Funciones de SBScript. Cada una: F(categoría, nombre, argumentos, descripción, función, opciones)
//   opciones: min/max (nº de argumentos), lazy (recibe los argumentos sin evaluar), q (no deja salto de línea en la salida)
const { get, all, run } = require("../../db");
const { usage } = require("../../lib/storage");
const { limitB } = require("../../lib/paths");
const ver = require("../../version");
const R = require("./runtime");
const dstore = require("../store");
const crypto = require("crypto");
const { genCaptcha } = require("./captcha");
const ai = require("../../ai");

const FN = {}, LIST = [], QUIET = new Set();
const F = (c, n, a, d, fn, o = {}) => { FN[n.toLowerCase()] = { n, a, d, c, fn, ...o }; LIST.push({ n, a, d, c, min: o.min || 0, q: !!o.q }); if (o.q) QUIET.add(n.toLowerCase()); };
const S = (v, d = "") => (v === undefined || v === "" ? d : String(v));
const N = (v, d = 0) => { const x = R.num(v); return isNaN(x) ? d : x; };
const id = v => String(v || "").replace(/\D/g, "");
const fmtB = n => n < 1024 ? n + " B" : n < 1048576 ? (n / 1024).toFixed(1) + " KB" : n < 1073741824 ? (n / 1048576).toFixed(1) + " MB" : (n / 1073741824).toFixed(2) + " GB";
const say = (ctx, text) => { if (ctx.dry) ctx.sim.push(text); };

// ---- ayudantes ----
async function who(ctx, v) {
  const uid = id(v) || ctx.user.id;
  if (uid === ctx.user.id) return { id: uid, user: ctx.user, member: ctx.member };
  if (ctx.dry) return { id: uid, user: { id: uid, username: "usuario" + uid.slice(-4), displayAvatarURL: () => "" }, member: null };
  const member = ctx.guild ? await ctx.guild.members.fetch(uid).catch(() => null) : null;
  const user = member?.user || await ctx.client.users.fetch(uid).catch(() => null);
  if (!user) throw Error("No encuentro a ese usuario");
  return { id: uid, user, member };
}
const perm = (ctx, p) => ctx.dry || !!ctx.member?.permissions?.has?.(String(p).trim());
function need(ctx, p) { if (!perm(ctx, p)) throw Error(`quien usa el comando necesita el permiso de Discord «${p}»`); }
const act = async (ctx, desc, fn) => { if (ctx.dry) { ctx.sim.push(desc); return; } await fn(); };
const sameGuild = ctx => { if (!ctx.guild) throw Error("solo funciona dentro de un servidor"); return ctx.guild; };

// Variables guardadas (en la base de datos, con límites)
const SC = { user: "user", server: "guild", global: "global" };
const vkey = (ctx, sc, who2) => sc === "user" ? (id(who2) || ctx.user.id) : sc === "guild" ? (ctx.guild?.id || "dm") : "g";
function vget(ctx, sc, key, name) {
  const k = `${sc}|${key}|${name}`; if (ctx.dry && ctx.dryVars?.has(k)) return ctx.dryVars.get(k);
  return get("SELECT value FROM discord_vars WHERE scope=? AND key=? AND name=?", sc, key, name)?.value;
}
function vset(ctx, sc, key, name, value) {
  value = String(value).slice(0, 1000); if (!/^[\w.-]{1,40}$/.test(name)) throw Error("el nombre de la variable solo puede tener letras, números, _ . - (máx. 40)");
  if (ctx.dry) { (ctx.dryVars ||= new Map()).set(`${sc}|${key}|${name}`, value); ctx.sim.push(`guardaría la variable ${sc}:${name} = ${value.slice(0, 40)}`); return; }
  if (get("SELECT 1 x FROM discord_vars WHERE scope=? AND key=? AND name=?", sc, key, name) === undefined && get("SELECT COUNT(*) n FROM discord_vars").n >= 20000) throw Error("se alcanzó el máximo de variables guardadas (20 000)");
  run("INSERT OR REPLACE INTO discord_vars(scope,key,name,value) VALUES(?,?,?,?)", sc, key, name, value);
}

function vdel(ctx, sc, key, name) { if (ctx.dry) ctx.dryVars?.delete(`${sc}|${key}|${name}`); else run("DELETE FROM discord_vars WHERE scope=? AND key=? AND name=?", sc, key, name); }
const num2 = (v) => { const x = R.num(v); return isNaN(x) ? 0 : x; };

// Cuenta de SynapseBox de quien usa el comando o, si se indica un ID/mención de Discord, de esa persona (null si no está vinculada o está suspendida)
function sbOf(ctx, v) { const uid = id(v); if (!uid || uid === ctx.user.id) return ctx.sb || null; const u = dstore.userByDiscord(uid); return u && !u.suspended ? u : null; }
const sbNeed = (ctx, v) => { const u = sbOf(ctx, v); if (!u) throw Error(id(v) && id(v) !== ctx.user.id ? "esa persona no tiene la cuenta de SynapseBox vinculada" : "necesita la cuenta vinculada"); return u; };

// ---- calculadora segura (sin eval) ----
function calc(src) {
  const t = src.replace(/\s+/g, "").replace(/,/g, "."); let p = 0;
  const peek = () => t[p], eat = c => t[p] === c ? (p++, true) : false;
  const prim = () => { if (eat("(")) { const v = add(); if (!eat(")")) throw Error("falta «)»"); return v; } if (eat("-")) return -pow(); if (eat("+")) return pow(); const m = /^\d*\.?\d+(e[+-]?\d+)?/i.exec(t.slice(p)); if (!m) throw Error("expresión no válida cerca de «" + t.slice(p, p + 6) + "»"); p += m[0].length; return Number(m[0]); };
  const pow = () => { const b = prim(); return eat("^") ? Math.pow(b, pow()) : b; };
  const mul = () => { let v = pow(); for (;;) { if (eat("*")) v *= pow(); else if (eat("/")) { const d = pow(); if (d === 0) throw Error("división entre cero"); v /= d; } else if (eat("%")) { const d = pow(); if (d === 0) throw Error("división entre cero"); v %= d; } else return v; } };
  const add = () => { let v = mul(); for (;;) { if (eat("+")) v += mul(); else if (eat("-")) v -= mul(); else return v; } };
  if (t.length > 200) throw Error("expresión demasiado larga");
  const v = add(); if (p < t.length) throw Error("expresión no válida cerca de «" + peek() + "»");
  return Number.isFinite(v) ? Math.round(v * 1e10) / 1e10 : (() => { throw Error("resultado no válido"); })();
}
const human = s => { s = Math.max(0, Math.floor(s)); const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return [d && d + " d", h && h + " h", m && m + " min", (x || !(d || h || m)) && x + " s"].filter(Boolean).join(" "); };
const pad = (n, l = 2) => String(n).padStart(l, "0");
function dateFmt(f, d) { return f.replace(/YYYY|MM|DD|HH|mm|ss/g, t => ({ YYYY: d.getFullYear(), MM: pad(d.getMonth() + 1), DD: pad(d.getDate()), HH: pad(d.getHours()), mm: pad(d.getMinutes()), ss: pad(d.getSeconds()) })[t]); }
const cool = new Map(), capFail = new Map();

// =================== Quién y dónde ===================
const C1 = "Contexto";
F(C1, "message", "[n]", "Todo lo que escribió quien usó el comando después del nombre; con un número, solo esa palabra.", (c, a) => a[0] ? (c.argv.join(" ").split(/\s+/).filter(Boolean)[N(a[0]) - 1] ?? "") : c.argv.join(" "));
F(C1, "argCount", "", "Cuántas palabras escribió después del comando.", c => c.argv.join(" ").split(/\s+/).filter(Boolean).length);
F(C1, "option", "nombre", "Valor de una opción de un comando slash.", (c, a) => c.opts?.get(S(a[0]).toLowerCase()) ?? "", { min: 1 });
F(C1, "mentioned", "[n]", "ID del usuario mencionado (n.º 1 por defecto) o de la opción de tipo usuario.", (c, a) => c.mentions?.[N(a[0], 1) - 1] ?? "");
F(C1, "commandName", "", "Nombre del comando que se ejecuta.", c => c.cmd.name);
F(C1, "prefix", "", "Prefijo de los comandos de mensaje.", c => c.prefix || "!");
F(C1, "userId", "", "ID de Discord de quien usa el comando.", c => c.user.id);
F(C1, "username", "[id]", "Nombre de usuario (el tuyo o el del ID indicado).", async (c, a) => (await who(c, a[0])).user.username);
F(C1, "nickname", "[id]", "Apodo en el servidor (o el nombre si no tiene).", async (c, a) => { const w = await who(c, a[0]); return w.member?.displayName || w.user.globalName || w.user.username; });
F(C1, "mention", "[id]", "Menciona a un usuario (por defecto a quien usa el comando).", (c, a) => `<@${id(a[0]) || c.user.id}>`);
F(C1, "avatar", "[id]", "Enlace de la foto de perfil.", async (c, a) => (await who(c, a[0])).user.displayAvatarURL({ size: 512 }));
F(C1, "isBot", "[id]", "true si el usuario es un bot.", async (c, a) => !!(await who(c, a[0])).user.bot);
F(C1, "serverName", "", "Nombre del servidor de Discord.", c => c.guild?.name ?? "Mensaje directo");
F(C1, "serverId", "", "ID del servidor.", c => c.guild?.id ?? "");
F(C1, "memberCount", "", "Número de miembros del servidor.", c => c.guild?.memberCount ?? 0);
F(C1, "channelId", "", "ID del canal donde se usó.", c => c.channel?.id ?? "");
F(C1, "channelName", "", "Nombre del canal donde se usó.", c => c.channel?.name ?? "");
F(C1, "roleName", "idRol", "Nombre de un rol del servidor.", (c, a) => c.dry ? "rol" : sameGuild(c).roles.cache.get(id(a[0]))?.name ?? "", { min: 1 });
F(C1, "hasRole", "idRol;[idUsuario]", "true si el usuario tiene ese rol.", async (c, a) => { const w = await who(c, a[1]); return !!w.member?.roles?.cache?.has?.(id(a[0])); }, { min: 1 });
F(C1, "hasPerm", "permiso;[idUsuario]", "true si tiene el permiso de Discord (ManageMessages, BanMembers, Administrator…).", async (c, a) => { const w = await who(c, a[1]); return c.dry ? true : !!w.member?.permissions?.has?.(S(a[0]).trim()); }, { min: 1 });
F(C1, "createdAt", "[id]", "Cuándo se creó la cuenta de Discord (segundos Unix). Úsalo con $discordTime o $timeAgo.", async (c, a) => { const x = id(a[0]) || c.user.id; if (x.length < 15) throw Error("ID no válido"); return Number((BigInt(x) >> 22n) + 1420070400000n) / 1000 | 0; });
F(C1, "joinedAt", "[id]", "Cuándo entró al servidor (segundos Unix; vacío si no está).", async (c, a) => { const w = await who(c, a[0]); return w.member?.joinedTimestamp ? Math.floor(w.member.joinedTimestamp / 1000) : c.dry ? Math.floor(Date.now() / 1000) - 86400 * 30 : ""; });
F(C1, "userRoles", "[id];[separador]", "Nombres de los roles del usuario (sin @everyone), separados por coma o por lo que indiques.", async (c, a) => { const w = await who(c, a[0]); if (c.dry) return ["Miembro", "VIP"].join(S(a[1], ", ")); return [...(w.member?.roles?.cache?.values?.() || [])].filter(r => r.name !== "@everyone").sort((x, y) => y.position - x.position).map(r => r.name).join(S(a[1], ", ")); });
F(C1, "serverIcon", "", "Enlace del icono del servidor (vacío si no tiene).", c => c.guild?.iconURL?.({ size: 512 }) ?? "");
F(C1, "mentionRole", "idRol", "Menciona un rol (no avisa a nadie: solo se ve el nombre).", (c, a) => `<@&${id(a[0])}>`, { min: 1 });
F(C1, "mentionChannel", "[idCanal]", "Enlace a un canal (por defecto, el actual).", (c, a) => `<#${id(a[0]) || c.channel?.id || ""}>`);
F(C1, "ownerId", "", "ID del dueño del servidor.", c => c.guild?.ownerId ?? "");
F(C1, "isOwner", "[id]", "true si el usuario es el dueño del servidor.", (c, a) => (c.guild?.ownerId ?? "") === (id(a[0]) || c.user.id));
F(C1, "boostCount", "", "Número de mejoras (boosts) del servidor.", c => c.guild?.premiumSubscriptionCount ?? 0);
F(C1, "channelTopic", "", "Tema del canal actual (vacío si no tiene).", c => c.channel?.topic ?? "");
F(C1, "isSbAdmin", "[idUsuario]", "true si esa persona (por defecto, quien usa el comando) tiene su cuenta de SynapseBox vinculada y es administrador.", (c, a) => !!sbOf(c, a[0])?.is_admin);
F(C1, "isLinked", "[idUsuario]", "true si esa persona (por defecto, quien usa el comando) tiene una cuenta de SynapseBox vinculada.", (c, a) => !!sbOf(c, a[0]));

// =================== Respuesta ===================
const C2 = "Respuesta";
const E = (n, a, d, k, tr = x => x) => F(C2, n, a, d, (c, v) => { c.out.embed[k] = tr(S(v[0])); return ""; }, { q: true, min: 1 });
E("title", "texto", "Título de la tarjeta (embed).", "title"); E("description", "texto", "Texto principal de la tarjeta.", "description");
E("footer", "texto", "Pie de la tarjeta.", "footer"); E("author", "texto", "Autor de la tarjeta.", "author");
E("image", "url", "Imagen grande de la tarjeta.", "image", x => /^https?:\/\//i.test(x) ? x : ""); E("thumbnail", "url", "Imagen pequeña de la tarjeta.", "thumbnail", x => /^https?:\/\//i.test(x) ? x : "");
E("color", "#rrggbb", "Color de la tarjeta, en hexadecimal.", "color", x => { const m = /^#?([0-9a-f]{6})$/i.exec(x.trim()); if (!m) throw Error("el color debe ser como #4f8cff"); return parseInt(m[1], 16); });
const URL_OK = x => /^https?:\/\//i.test(x) ? x.slice(0, 1000) : "";
E("footerIcon", "url", "Icono pequeño junto al pie de la tarjeta (solo enlaces http/https).", "footerIcon", URL_OK);
E("authorIcon", "url", "Icono redondo junto al autor de la tarjeta (solo enlaces http/https).", "authorIcon", URL_OK);
E("authorUrl", "url", "Enlace que se abre al pulsar el nombre del autor.", "authorUrl", URL_OK);
E("titleUrl", "url", "Convierte el título de la tarjeta en un enlace.", "titleUrl", URL_OK);
F(C2, "genCaptcha", "[longitud]", "Crea una imagen de captcha (4-8 caracteres, por defecto 5) y la envía dentro de la tarjeta junto al resto de tu mensaje. El código se guarda en la variable de usuario «captcha» ($getUserVar[captcha]); compruébalo con $checkCaptcha.", (c, a) => {
  const r = genCaptcha(N(a[0], 5)); vset(c, "user", c.user.id, "captcha", r.code); capFail.delete(c.user.id);
  c.out.files = c.out.files.filter(f => f.name !== "captcha.png"); c.out.files.push({ name: "captcha.png", data: r.png }); c.out.embed.image = "attachment://captcha.png"; return "";
}, { q: true });
F(C2, "addField", "nombre;valor;[enLinea]", "Añade un campo a la tarjeta (máx. 25).", (c, a) => { if (c.out.fields.length < 25) c.out.fields.push({ name: S(a[0], "\u200b").slice(0, 256), value: S(a[1], "\u200b").slice(0, 1024), inline: R.truthy(S(a[2], "no")) }); return ""; }, { q: true, min: 2 });
F(C2, "timestamp", "", "Pone la hora actual en la tarjeta.", c => { c.out.embed.timestamp = new Date().toISOString(); return ""; }, { q: true });
F(C2, "ephemeral", "", "Solo quien usó el comando ve la respuesta (comandos slash).", c => { c.out.eph = true; return ""; }, { q: true });
F(C2, "deleteCommand", "", "Borra el mensaje que escribió el usuario (comandos de mensaje).", c => { c.out.del = true; return ""; }, { q: true });
F(C2, "addReaction", "emoji", "Reacciona al mensaje del usuario (comandos de mensaje).", async (c, a) => { if (c.kind === "slash" || c.kind === "test") return say(c, "reaccionaría con " + a[0]); await c.msg.react(S(a[0]).trim()).catch(() => { throw Error("emoji no válido"); }); }, { min: 1 });
F(C2, "sendMessage", "idCanal;texto", "Envía un mensaje a otro canal del mismo servidor.", async (c, a) => { const g = sameGuild(c); await act(c, `enviaría «${S(a[1]).slice(0, 40)}» al canal ${a[0]}`, async () => { const ch = await g.channels.fetch(id(a[0])).catch(() => null); if (!ch?.isTextBased?.()) throw Error("ese canal no existe o no es de texto"); await ch.send({ content: S(a[1]).slice(0, 2000), allowedMentions: { parse: [] } }); }); }, { min: 2 });
F(C2, "sendDM", "texto  o  idUsuario;texto", "Envía un mensaje privado a quien usó el comando, o al usuario con esa ID si la pones primero.", async (c, a) => {
  const to = a.length > 1 && /^(<@!?)?\d{15,22}>?$/.test(S(a[0]).trim()); // con ID: $sendDM[id;texto]; sin ID funciona como siempre
  const text = S(to ? a.slice(1).join(";") : a[0]).slice(0, 2000), w = to ? await who(c, a[0]) : { id: c.user.id, user: c.user };
  await act(c, `enviaría un privado${to ? " a " + w.id : ""}: «${text.slice(0, 40)}»`, async () => { await w.user.send({ content: text, allowedMentions: { parse: [] } }).catch(() => { throw Error("no se pudo enviar el privado (¿los tiene cerrados?)"); }); });
}, { min: 1 });

// =================== Botones ===================
// Los botones se envían con el mensaje. Al pulsarlos se ejecuta un comando de tipo «Botón» cuyo texto activador coincide con el id del botón.
const CB = "Botones", STYLE = { azul: 1, primary: 1, blurple: 1, gris: 2, secondary: 2, grey: 2, gray: 2, verde: 3, success: 3, green: 3, rojo: 4, danger: 4, red: 4 };
const btnEmoji = v => { v = S(v).trim(); if (!v) return undefined; const m = /^<(a?):(\w{2,32}):(\d{15,25})>$/.exec(v); if (m) return { name: m[2], id: m[3], animated: !!m[1] }; return [...v].length <= 8 && !/[\w<>:]/.test(v) ? { name: v } : undefined; };
const BTN_ID = /^[A-Za-z0-9_:.-]{1,80}$/;
function pushBtn(c, b) { if (c.out.buttons.length >= 25) throw Error("máximo 25 botones por mensaje"); c.out.buttons.push(b); return ""; }
F(CB, "addButton", "etiqueta;id;[estilo];[emoji];[desactivado]", "Añade un botón al mensaje (máx. 25, 5 por fila). Al pulsarlo se ejecuta el comando de tipo «Botón» cuyo activador sea el id. Estilos: azul, gris, verde, rojo. Truco: pon datos en el id separados por «:» (ej. rol:123) y léelos con $buttonArg.", (c, a) => {
  const label = S(a[0]).slice(0, 80), bid = S(a[1]).trim(); if (!label && !btnEmoji(a[3])) throw Error("el botón necesita una etiqueta o un emoji"); if (!BTN_ID.test(bid)) throw Error("el id del botón solo admite letras, números y _ : . - (máx. 80)");
  const st = STYLE[S(a[2], "azul").trim().toLowerCase()]; if (!st) throw Error("estilo no válido (azul, gris, verde, rojo)");
  const b = { type: 2, style: st, label: label || undefined, custom_id: "sbs:" + bid }; const em = btnEmoji(a[3]); if (em) b.emoji = em; if (R.truthy(S(a[4], "no"))) b.disabled = true; return pushBtn(c, b);
}, { q: true, min: 2 });
F(CB, "addLinkButton", "etiqueta;url;[emoji]", "Añade un botón que abre un enlace (solo http/https). No ejecuta ningún comando.", (c, a) => {
  const url = S(a[1]).trim(); if (!/^https?:\/\//i.test(url)) throw Error("el enlace debe empezar por http:// o https://");
  const label = S(a[0]).slice(0, 80); if (!label) throw Error("el botón necesita una etiqueta");
  const b = { type: 2, style: 5, label, url: url.slice(0, 512) }; const em = btnEmoji(a[2]); if (em) b.emoji = em; return pushBtn(c, b);
}, { q: true, min: 2 });
F(CB, "clearButtons", "", "Quita todos los botones del mensaje (útil con $updateMessage).", c => { c.out.buttons = []; c.out.clearButtons = true; return ""; }, { q: true });
F(CB, "updateMessage", "", "En un comando de tipo «Botón»: en vez de enviar un mensaje nuevo, edita el mensaje donde está el botón.", c => { c.out.update = true; return ""; }, { q: true });
F(CB, "buttonId", "", "Id del botón que se ha pulsado (sin el prefijo interno).", c => c.btn ?? "");
F(CB, "buttonArg", "n", "La parte n (desde 1) del id del botón separado por «:». Con el id rol:123, $buttonArg[1] es rol y $buttonArg[2] es 123.", (c, a) => String(c.btn ?? "").split(":")[N(a[0], 1) - 1] ?? "", { min: 1 });
F(CB, "isButtonClick", "", "true si el comando se ejecuta porque alguien pulsó un botón.", c => c.kind === "button" || (c.kind === "test" && c.btn !== undefined));

// =================== Lógica ===================
const C3 = "Lógica y control";
F(C3, "onlyIf", "condición;mensajeSiFalla", "Detiene el comando (y muestra el mensaje) si la condición no se cumple.", async (c, a) => { if (!(await R.cond(c, a[0] || []))) throw new R.Stop(a[1] ? await R.ev(c, a[1]) : ""); }, { lazy: true, min: 1, q: true });
F(C3, "onlyAdmin", "[mensaje]", "Solo para administradores de SynapseBox (vinculados) o con permiso «Gestionar servidor».", (c, a) => { if (!(c.sb?.is_admin || perm(c, "ManageGuild"))) throw new R.Stop(S(a[0], "Solo los administradores pueden usar este comando.")); }, { q: true });
F(C3, "onlyPerms", "permisos;[mensaje]", "Solo quien tenga TODOS los permisos de Discord (separados por coma).", (c, a) => { for (const p of S(a[0]).split(",")) if (p.trim() && !perm(c, p)) throw new R.Stop(S(a[1], "No tienes permiso para usar este comando.")); }, { q: true, min: 1 });
F(C3, "onlyRoles", "idRoles;[mensaje]", "Solo quien tenga alguno de esos roles (IDs separados por coma).", (c, a) => { if (c.dry) return; const ok = S(a[0]).split(",").some(r => c.member?.roles?.cache?.has?.(id(r))); if (!ok) throw new R.Stop(S(a[1], "No tienes el rol necesario.")); }, { q: true, min: 1 });
F(C3, "onlyLinked", "[mensaje]", "Solo para quien haya vinculado su cuenta de SynapseBox.", (c, a) => { if (!c.sb) throw new R.Stop(S(a[0], "Primero vincula tu cuenta con /vincular.")); }, { q: true });
F(C3, "cooldown", "segundos;[mensaje]", "Limita cada cuánto puede usarlo cada persona (máx. 1 día).", (c, a) => { if (c.dry) return; const k = c.cmd.id + "|" + c.user.id, t = Date.now(), s = Math.min(86400, N(a[0], 5)), nx = cool.get(k) || 0; if (t < nx) throw new R.Stop(S(a[1], `Espera ${human((nx - t) / 1000 + 0.99)} para usarlo otra vez.`)); cool.set(k, t + s * 1000); if (cool.size > 5000) for (const [x, v] of cool) if (v < t) cool.delete(x); }, { q: true, min: 1 });
F(C3, "checkCaptcha", "texto", "true si el texto coincide con el captcha que se le generó a quien usa el comando (sin distinguir mayúsculas). Si acierta, el captcha se borra; tras 5 fallos seguidos también se invalida.", (c, a) => {
  const code = vget(c, "user", c.user.id, "captcha"); if (!code) return false;
  if (S(a[0]).replace(/\s+/g, "").toUpperCase() === String(code).toUpperCase()) { vdel(c, "user", c.user.id, "captcha"); capFail.delete(c.user.id); return true; }
  if (!c.dry) { const n = (capFail.get(c.user.id) || 0) + 1; if (n >= 5) { vdel(c, "user", c.user.id, "captcha"); capFail.delete(c.user.id); } else capFail.set(c.user.id, n); if (capFail.size > 5000) capFail.clear(); }
  return false;
}, { min: 1 });
F(C3, "clearCaptcha", "", "Borra el captcha pendiente de quien usa el comando.", c => { vdel(c, "user", c.user.id, "captcha"); capFail.delete(c.user.id); return ""; }, { q: true });
F(C3, "chance", "porcentaje", "true con esa probabilidad (0-100). Ej.: $chance[25] es verdadero una de cada cuatro veces.", (c, a) => Math.random() * 100 < N(a[0]), { min: 1 });
F(C3, "stop", "[mensaje]", "Termina el comando aquí (con un mensaje opcional).", (c, a) => { throw new R.Stop(S(a[0])); }, { q: true });
F(C3, "break", "", "Sale del bucle actual.", () => { throw new R.Brk(); }, { q: true });
F(C3, "default", "texto;porDefecto", "Devuelve el texto, o el valor por defecto si está vacío.", (c, a) => S(a[0], S(a[1])), { min: 2 });
F(C3, "c", "texto", "Comentario: no hace nada.", () => "", { q: true });
F(C3, "set", "variable;valor", "Guarda un valor temporal (solo mientras se ejecuta el comando).", (c, a) => { c.vars.set(S(a[0]).trim(), S(a[1])); return ""; }, { q: true, min: 2 });
F(C3, "get", "variable;[porDefecto]", "Lee un valor temporal guardado con $set o un $for.", (c, a) => c.vars.get(S(a[0]).trim()) ?? S(a[1]), { min: 1 });

// =================== Variables guardadas ===================
const C4 = "Variables guardadas";
for (const [nm, sc, lab] of [["User", "user", "de cada usuario"], ["Server", "server", "de cada servidor"], ["Global", "global", "global"]]) {
  const idArg = sc === "user" ? ";[idUsuario]" : "";
  F(C4, `set${nm}Var`, `nombre;valor${idArg}`, `Guarda una variable ${lab} que se conserva siempre.`, (c, a) => { vset(c, SC[sc], vkey(c, SC[sc], a[2]), S(a[0]).trim(), S(a[1])); return ""; }, { q: true, min: 2 });
  F(C4, `get${nm}Var`, `nombre;[porDefecto]${idArg}`, `Lee una variable ${lab}.`, (c, a) => vget(c, SC[sc], vkey(c, SC[sc], a[2]), S(a[0]).trim()) ?? S(a[1]), { min: 1 });
  F(C4, `del${nm}Var`, `nombre${idArg}`, `Borra una variable ${lab}.`, (c, a) => { const k = vkey(c, SC[sc], a[1]); if (c.dry) c.sim.push(`borraría la variable ${a[0]}`); else run("DELETE FROM discord_vars WHERE scope=? AND key=? AND name=?", SC[sc], k, S(a[0]).trim()); return ""; }, { q: true, min: 1 });
}
for (const [nm, sc, lab] of [["User", "user", "de usuario"], ["Server", "server", "de servidor"], ["Global", "global", "global"]]) {
  const idArg = sc === "user" ? ";[idUsuario]" : "";
  F(C4, `inc${nm}Var`, `nombre;[cantidad];[mínimo];[máximo]${idArg}`, `Suma (o resta, con negativo) a una variable ${lab}. Cantidad por defecto: 1. Opcionalmente limita el resultado entre un mínimo y un máximo. No escribe nada: lee el resultado con $get${nm}Var.`, (c, a) => {
    const k = vkey(c, SC[sc], a[4]), nameV = S(a[0]).trim(); let v = num2(vget(c, SC[sc], k, nameV)) + N(a[1], 1);
    if (S(a[2]) !== "") v = Math.max(v, N(a[2])); if (S(a[3]) !== "") v = Math.min(v, N(a[3]));
    v = Math.round(v * 1e10) / 1e10; vset(c, SC[sc], k, nameV, v); return "";
  }, { q: true, min: 1 });
}
F(C4, "rankUserVar", "nombre;[idUsuario]", "Puesto de un usuario en el ranking de una variable (1 = el mayor). Vacío si no tiene la variable.", (c, a) => {
  const nameV = S(a[0]).trim(), v = vget(c, "user", vkey(c, "user", a[1]), nameV); if (v === undefined) return "";
  return get("SELECT COUNT(*) n FROM discord_vars WHERE scope='user' AND name=? AND CAST(value AS REAL) > CAST(? AS REAL)", nameV, v).n + 1;
}, { min: 1 });
F(C4, "topUserVar", "nombre;[cuántos];[plantilla]", "Ranking de la variable de usuario (de mayor a menor). Plantilla: {pos} {user} {value}.", (c, a) => all("SELECT key,value FROM discord_vars WHERE scope='user' AND name=? ORDER BY CAST(value AS REAL) DESC LIMIT ?", S(a[0]).trim(), Math.min(25, Math.max(1, N(a[1], 10)))).map((r, k) => S(a[2], "{pos}. {user} — {value}").replace(/\{pos\}/g, k + 1).replace(/\{user\}/g, `<@${r.key}>`).replace(/\{value\}/g, r.value)).join("\n"), { min: 1 });

// =================== Matemáticas ===================
const C5 = "Matemáticas";
F(C5, "calc", "operación", "Calcula: + - * / % ^ y paréntesis. Ej.: $calc[(2+3)*4].", (c, a) => calc(S(a[0])), { min: 1 });
F(C5, "random", "mínimo;máximo", "Número entero al azar entre dos valores.", (c, a) => { const lo = Math.ceil(N(a[0])), hi = Math.floor(N(a[1])); if (hi < lo) throw Error("el máximo debe ser mayor que el mínimo"); return lo + Math.floor(Math.random() * (hi - lo + 1)); }, { min: 2 });
F(C5, "round", "número;[decimales]", "Redondea.", (c, a) => { const m = 10 ** Math.min(10, N(a[1])); return Math.round(N(a[0]) * m) / m; }, { min: 1 });
F(C5, "floor", "número", "Redondea hacia abajo.", (c, a) => Math.floor(N(a[0])), { min: 1 });
F(C5, "ceil", "número", "Redondea hacia arriba.", (c, a) => Math.ceil(N(a[0])), { min: 1 });
F(C5, "abs", "número", "Valor absoluto.", (c, a) => Math.abs(N(a[0])), { min: 1 });
F(C5, "min", "a;b;…", "El menor de varios números.", (c, a) => Math.min(...a.map(x => N(x))), { min: 1 });
F(C5, "max", "a;b;…", "El mayor de varios números.", (c, a) => Math.max(...a.map(x => N(x))), { min: 1 });
F(C5, "sum", "a;b;…", "Suma varios números.", (c, a) => a.reduce((s, x) => s + N(x), 0), { min: 1 });
F(C5, "formatNumber", "número", "Pone separador de miles (1.234.567).", (c, a) => N(a[0]).toLocaleString("es-ES"), { min: 1 });

F(C5, "clamp", "número;mínimo;máximo", "Limita un número entre un mínimo y un máximo.", (c, a) => Math.min(Math.max(N(a[0]), N(a[1])), N(a[2])), { min: 3 });
F(C5, "percent", "parte;total;[decimales]", "Qué porcentaje es una parte del total (sin el signo %).", (c, a) => { const t = N(a[1]); if (!t) throw Error("el total no puede ser 0"); const m = 10 ** Math.min(6, N(a[2], 0)); return Math.round(N(a[0]) / t * 100 * m) / m; }, { min: 2 });
F(C5, "progressBar", "valor;máximo;[largo];[lleno];[vacío]", "Barra de progreso de texto. Ej.: $progressBar[7;10;10] → ▰▰▰▰▰▰▰▱▱▱", (c, a) => { const t = N(a[1]), n = Math.min(40, Math.max(2, N(a[2], 10))), k = t > 0 ? Math.round(Math.min(1, Math.max(0, N(a[0]) / t)) * n) : 0; return S(a[3], "▰").repeat(k) + S(a[4], "▱").repeat(n - k); }, { min: 2 });
F(C5, "randomColor", "", "Color hexadecimal al azar, para usar con $color.", () => "#" + crypto.randomInt(0, 0x1000000).toString(16).padStart(6, "0"));
F(C5, "plural", "número;singular;plural", "Elige la palabra según el número. Ej.: $plural[$get[n];moneda;monedas]", (c, a) => N(a[0]) === 1 ? S(a[1]) : S(a[2]), { min: 3 });

// =================== Texto ===================
const C6 = "Texto";
F(C6, "upper", "texto", "MAYÚSCULAS.", (c, a) => S(a[0]).toUpperCase(), { min: 1 });
F(C6, "lower", "texto", "minúsculas.", (c, a) => S(a[0]).toLowerCase(), { min: 1 });
F(C6, "capitalize", "texto", "Primera letra en mayúscula.", (c, a) => { const t = S(a[0]); return t.charAt(0).toUpperCase() + t.slice(1); }, { min: 1 });
F(C6, "length", "texto", "Número de caracteres.", (c, a) => S(a[0]).length, { min: 1 });
F(C6, "wordCount", "texto", "Número de palabras.", (c, a) => S(a[0]).split(/\s+/).filter(Boolean).length, { min: 1 });
F(C6, "trim", "texto", "Quita espacios al principio y al final.", (c, a) => S(a[0]).trim(), { min: 1 });
F(C6, "replace", "texto;buscar;reemplazo", "Reemplaza todas las apariciones.", (c, a) => S(a[0]).split(S(a[1])).join(S(a[2])), { min: 3 });
F(C6, "substring", "texto;desde;[hasta]", "Parte del texto (desde 0).", (c, a) => S(a[0]).slice(N(a[1]), a[2] === undefined || a[2] === "" ? undefined : N(a[2])), { min: 2 });
F(C6, "repeatText", "texto;veces", "Repite el texto (máx. 50 veces).", (c, a) => S(a[0]).repeat(Math.min(50, Math.max(0, N(a[1])))), { min: 2 });
F(C6, "reverse", "texto", "Invierte el texto.", (c, a) => [...S(a[0])].reverse().join(""), { min: 1 });
F(C6, "split", "texto;separador;n", "La parte n (desde 1) del texto separado.", (c, a) => S(a[0]).split(S(a[1])).at(N(a[2]) > 0 ? N(a[2]) - 1 : N(a[2])) ?? "", { min: 3 });
F(C6, "contains", "texto;buscar", "true si el texto contiene lo buscado (sin distinguir mayúsculas).", (c, a) => S(a[0]).toLowerCase().includes(S(a[1]).toLowerCase()), { min: 2 });
F(C6, "choose", "a;b;c;…", "Elige una opción al azar.", (c, a) => a[Math.floor(Math.random() * a.length)] ?? "", { min: 1 });
F(C6, "urlEncode", "texto", "Codifica el texto para usarlo en un enlace.", (c, a) => encodeURIComponent(S(a[0])), { min: 1 });
F(C6, "newline", "", "Salto de línea.", () => "\n");

F(C6, "titleCase", "texto", "Primera letra de cada palabra en mayúscula.", (c, a) => S(a[0]).toLowerCase().replace(/(^|\s)(\S)/g, (m, s1, l) => s1 + l.toUpperCase()), { min: 1 });
F(C6, "truncate", "texto;máximo;[final]", "Corta el texto si es largo y añade «…» (o lo que indiques).", (c, a) => { const t = S(a[0]), m = Math.max(1, N(a[1], 100)), e = S(a[2], "…"); return t.length <= m ? t : t.slice(0, Math.max(0, m - e.length)) + e; }, { min: 2 });
F(C6, "pad", "texto;largo;[relleno];[derecha]", "Rellena el texto hasta un largo (por la izquierda; con «yes» como 4.º argumento, por la derecha). Útil para alinear.", (c, a) => { const L = Math.min(100, N(a[1])), f = S(a[2], " ").slice(0, 1) || " "; return R.truthy(S(a[3], "no")) ? S(a[0]).padEnd(L, f) : S(a[0]).padStart(L, f); }, { min: 2 });
F(C6, "count", "texto;buscar", "Cuántas veces aparece lo buscado en el texto.", (c, a) => S(a[1]) ? S(a[0]).split(S(a[1])).length - 1 : 0, { min: 2 });
F(C6, "startsWith", "texto;inicio", "true si el texto empieza así (sin distinguir mayúsculas).", (c, a) => S(a[0]).toLowerCase().startsWith(S(a[1]).toLowerCase()), { min: 2 });
F(C6, "endsWith", "texto;final", "true si el texto termina así (sin distinguir mayúsculas).", (c, a) => S(a[0]).toLowerCase().endsWith(S(a[1]).toLowerCase()), { min: 2 });
F(C6, "indexOf", "texto;buscar", "Posición (desde 0) de la primera aparición, o -1.", (c, a) => S(a[0]).indexOf(S(a[1])), { min: 2 });
F(C6, "slug", "texto", "Convierte el texto en algo apto para enlaces: minúsculas, sin tildes y con guiones.", (c, a) => S(a[0]).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""), { min: 1 });
F(C6, "hash", "texto;[sha256|sha1|md5]", "Huella (hash) del texto en hexadecimal. Por defecto sha256.", (c, a) => { const al = S(a[1], "sha256").toLowerCase(); if (!["sha256", "sha1", "md5"].includes(al)) throw Error("algoritmo no válido"); return crypto.createHash(al).update(S(a[0])).digest("hex"); }, { min: 1 });
F(C6, "randomString", "[largo];[tipo]", "Texto al azar seguro (máx. 64). Tipos: alnum (por defecto), letters, numbers, hex. Sirve para códigos y contraseñas.", (c, a) => { const set = { alnum: "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789", letters: "abcdefghijklmnopqrstuvwxyz", numbers: "0123456789", hex: "0123456789abcdef" }[S(a[1], "alnum").toLowerCase()]; if (!set) throw Error("tipo no válido (alnum, letters, numbers, hex)"); return Array.from({ length: Math.min(64, Math.max(1, N(a[0], 8))) }, () => set[crypto.randomInt(0, set.length)]).join(""); });
F(C6, "shuffle", "a;b;c;…", "Mezcla las opciones y las devuelve separadas por coma.", (c, a) => { const x = [...a]; for (let k = x.length - 1; k > 0; k--) { const j = crypto.randomInt(0, k + 1); [x[k], x[j]] = [x[j], x[k]]; } return x.join(", "); }, { min: 1 });

F(C6, "sort", "a;b;c;…", "Ordena las opciones alfabéticamente (o de menor a mayor si son números) y las devuelve separadas por coma.", (c, a) => [...a].sort((x, y) => { const p = R.num(x), q = R.num(y); return !isNaN(p) && !isNaN(q) ? p - q : String(x).localeCompare(String(y), "es"); }).join(", "), { min: 1 });
F(C6, "unique", "a;b;c;…", "Quita las opciones repetidas y las devuelve separadas por coma.", (c, a) => [...new Set(a.map(x => String(x).trim()))].join(", "), { min: 1 });
F(C6, "lines", "texto", "Cuenta las líneas de un texto.", (c, a) => S(a[0]).split(/\r?\n/).length, { min: 1 });
F(C5, "median", "a;b;…", "Mediana (el valor del medio) de varios números.", (c, a) => { const v = a.map(x => N(x)).sort((x, y) => x - y), m = v.length >> 1; return v.length % 2 ? v[m] : +((v[m - 1] + v[m]) / 2).toFixed(6); }, { min: 1 });
F(C5, "coinFlip", "", "Lanza una moneda: cara o cruz.", () => Math.random() < 0.5 ? "🪙 cara" : "🪙 cruz");
F(C5, "average", "a;b;…", "Promedio de varios números.", (c, a) => +(a.reduce((s, x) => s + N(x), 0) / a.length).toFixed(6), { min: 1 });
F(C5, "dice", "[dados];[caras]", "Tira dados (1 por defecto, de 6 caras; máx. 20 dados y 1000 caras). Ej.: $dice[2;6] → «🎲 4 + 2 = 6».", (c, a) => { const n = Math.min(20, Math.max(1, Math.floor(N(a[0], 1)))), f = Math.min(1000, Math.max(2, Math.floor(N(a[1], 6)))); const r = Array.from({ length: n }, () => 1 + Math.floor(Math.random() * f)); return n === 1 ? `🎲 ${r[0]}` : `🎲 ${r.join(" + ")} = ${r.reduce((x, y) => x + y, 0)}`; });
F(C6, "isPalindrome", "texto", "true si el texto se lee igual al derecho y al revés (ignora mayúsculas, acentos y símbolos).", (c, a) => { const t = S(a[0]).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9ñ]/g, ""); return t.length > 0 && t === [...t].reverse().join(""); }, { min: 1 });
F(C6, "initials", "texto;[máx]", "Iniciales de cada palabra en mayúsculas (máx. 10). Ej.: «juan pérez» → JP.", (c, a) => S(a[0]).split(/\s+/).filter(Boolean).map(w => [...w][0].toUpperCase()).join("").slice(0, Math.min(10, Math.max(1, N(a[1], 10)))), { min: 1 });
// =================== Novedades 2.15.3: más texto y matemáticas ===================
const noAcc = s => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
F(C6, "removeAccents", "texto", "Quita las tildes y diéresis (á → a, ñ → n).", (c, a) => noAcc(S(a[0])), { min: 1 });
F(C6, "between", "texto;inicio;fin", "Lo que hay entre dos textos. Ej.: $between[a(hola)b;(;)] → hola.", (c, a) => { const t = S(a[0]), i = t.indexOf(S(a[1])); if (i < 0) return ""; const s = i + S(a[1]).length, j = S(a[2]) ? t.indexOf(S(a[2]), s) : -1; return j < 0 ? "" : t.slice(s, j); }, { min: 3 });
F(C6, "charAt", "texto;posición", "El carácter en esa posición (desde 1; negativa = desde el final).", (c, a) => { const ch = [...S(a[0])], n = N(a[1]); return ch.at(n > 0 ? n - 1 : n) ?? ""; }, { min: 2 });
F(C6, "wordAt", "texto;n", "La palabra n del texto (desde 1; negativa = desde el final).", (c, a) => { const w = S(a[0]).split(/\s+/).filter(Boolean), n = N(a[1]); return w.at(n > 0 ? n - 1 : n) ?? ""; }, { min: 2 });
F(C6, "isEmpty", "texto", "true si el texto está vacío o solo tiene espacios.", (c, a) => !S(a[0]).trim(), { min: 1 });
F(C6, "replaceFirst", "texto;buscar;reemplazo", "Reemplaza solo la primera aparición.", (c, a) => { const t = S(a[0]), s = S(a[1]), i = s ? t.indexOf(s) : -1; return i < 0 ? t : t.slice(0, i) + S(a[2]) + t.slice(i + s.length); }, { min: 3 });
F(C6, "base64Encode", "texto", "Codifica el texto en Base64.", (c, a) => Buffer.from(S(a[0]).slice(0, 4000)).toString("base64"), { min: 1 });
F(C6, "base64Decode", "texto", "Decodifica un texto en Base64 (vacío si no es válido).", (c, a) => { const s = S(a[0]).trim(); return /^[A-Za-z0-9+/_-]*={0,2}$/.test(s) && s.length <= 6000 ? Buffer.from(s, "base64").toString("utf8") : ""; }, { min: 1 });
F(C6, "urlDecode", "texto", "Decodifica un texto de un enlace (%20 → espacio).", (c, a) => { try { return decodeURIComponent(S(a[0])); } catch { return S(a[0]); } }, { min: 1 });
F(C5, "sqrt", "número", "Raíz cuadrada (error si es negativo).", (c, a) => { const x = N(a[0]); if (x < 0) throw Error("no existe la raíz de un número negativo"); return +Math.sqrt(x).toFixed(10); }, { min: 1 });
F(C5, "power", "base;exponente", "Eleva un número a una potencia (máx. exponente 1000).", (c, a) => { const r = N(a[0]) ** Math.max(-1000, Math.min(1000, N(a[1]))); if (!isFinite(r)) throw Error("el resultado es demasiado grande"); return +r.toFixed(10); }, { min: 2 });
F(C5, "mod", "a;b", "Resto de dividir a entre b.", (c, a) => { if (!N(a[1])) throw Error("no se puede dividir entre 0"); return N(a[0]) % N(a[1]); }, { min: 2 });
F(C5, "isNumber", "texto", "true si el texto es un número válido.", (c, a) => S(a[0]).trim() !== "" && !isNaN(R.num(S(a[0]).trim())), { min: 1 });
F(C5, "range", "desde;hasta;[paso]", "Lista de números separados por coma (máx. 100). Ej.: $range[1;5] → 1, 2, 3, 4, 5.", (c, a) => { const d = N(a[0]), h = N(a[1]), p = Math.abs(N(a[2], 1)) || 1, o = []; if (d <= h) for (let x = d; x <= h && o.length < 100; x += p) o.push(+x.toFixed(10)); else for (let x = d; x >= h && o.length < 100; x -= p) o.push(+x.toFixed(10)); return o.join(", "); }, { min: 2 });
F(C5, "lerp", "desde;hasta;t", "Valor entre dos números según t (0 a 1). Ej.: $lerp[0;100;0.25] → 25.", (c, a) => +(N(a[0]) + (N(a[1]) - N(a[0])) * N(a[2])).toFixed(10), { min: 3 });
// ---- más funciones 2.15.3 ----
const gcd2 = (a, b) => { a = Math.abs(Math.round(a)); b = Math.abs(Math.round(b)); while (b) [a, b] = [b, a % b]; return a; };
const nums = a => a.map(x => N(x));
F(C5, "gcd", "a;b;…", "Máximo común divisor de varios números enteros.", (c, a) => nums(a).reduce(gcd2), { min: 2 });
F(C5, "lcm", "a;b;…", "Mínimo común múltiplo de varios números enteros.", (c, a) => { const r = nums(a).reduce((x, y) => { const g = gcd2(x, y); return g ? Math.abs(Math.round(x) * Math.round(y)) / g : 0; }); if (!isFinite(r) || r > 9e15) throw Error("el resultado es demasiado grande"); return r; }, { min: 2 });
F(C5, "factorial", "n", "Factorial de un número (0 a 20).", (c, a) => { const n = Math.round(N(a[0])); if (n < 0 || n > 20) throw Error("el número debe estar entre 0 y 20"); let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; }, { min: 1 });
F(C5, "isPrime", "n", "true si el número es primo.", (c, a) => { const n = Math.round(N(a[0])); if (n < 2 || n > 9e15) return false; if (n < 4) return true; if (n % 2 === 0) return false; for (let i = 3; i * i <= n; i += 2) if (n % i === 0) return false; return true; }, { min: 1 });
F(C5, "fibonacci", "n", "El número n de la sucesión de Fibonacci (0 a 78).", (c, a) => { const n = Math.round(N(a[0])); if (n < 0 || n > 78) throw Error("n debe estar entre 0 y 78"); let x = 0, y = 1; for (let i = 0; i < n; i++) [x, y] = [y, x + y]; return x; }, { min: 1 });
F(C5, "log", "número;[base]", "Logaritmo (natural por defecto; indica la base, p. ej. 10 o 2).", (c, a) => { const x = N(a[0]), b = a[1] === undefined || a[1] === "" ? Math.E : N(a[1]); if (x <= 0 || b <= 0 || b === 1) throw Error("valores no válidos para el logaritmo"); return +(Math.log(x) / Math.log(b)).toFixed(10); }, { min: 1 });
F(C5, "sign", "número", "-1 si es negativo, 1 si es positivo, 0 si es cero.", (c, a) => Math.sign(N(a[0])), { min: 1 });
F(C5, "trunc", "número", "Quita los decimales (sin redondear).", (c, a) => Math.trunc(N(a[0])), { min: 1 });
F(C5, "randomFloat", "[mínimo];[máximo];[decimales]", "Número decimal al azar (de 0 a 1 por defecto; hasta 10 decimales, 2 por defecto).", (c, a) => { const lo = N(a[0], 0), hi = N(a[1], 1); if (hi < lo) throw Error("el máximo debe ser mayor que el mínimo"); return +(lo + crypto.randomInt(0, 1e9) / 1e9 * (hi - lo)).toFixed(Math.min(10, Math.max(0, N(a[2], 2)))); });
F(C5, "stdDev", "a;b;…", "Desviación estándar (poblacional) de varios números.", (c, a) => { const v = nums(a), m = v.reduce((s, x) => s + x, 0) / v.length; return +Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / v.length).toFixed(6); }, { min: 1 });
F(C5, "toBase", "número;base", "Convierte un entero a otra base (2 a 36). Ej.: $toBase[255;16] → ff.", (c, a) => { const b = Math.round(N(a[1])); if (b < 2 || b > 36) throw Error("la base debe estar entre 2 y 36"); return Math.trunc(N(a[0])).toString(b); }, { min: 2 });
F(C5, "fromBase", "texto;base", "Convierte un texto de otra base (2 a 36) a número decimal. Ej.: $fromBase[ff;16] → 255.", (c, a) => { const b = Math.round(N(a[1])); if (b < 2 || b > 36) throw Error("la base debe estar entre 2 y 36"); const r = parseInt(S(a[0]).trim(), b); return isNaN(r) ? 0 : r; }, { min: 2 });
F(C5, "roman", "número", "Número romano (1 a 3999). Ej.: $roman[2026] → MMXXVI.", (c, a) => { let n = Math.round(N(a[0])); if (n < 1 || n > 3999) throw Error("el número debe estar entre 1 y 3999"); let r = ""; for (const [v, s] of [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]]) while (n >= v) { r += s; n -= v; } return r; }, { min: 1 });
F(C5, "ordinal", "número", "Número con ordinal en español. Ej.: $ordinal[3] → 3.º", (c, a) => Math.round(N(a[0])) + ".º", { min: 1 });
F(C5, "bytes", "número", "Tamaño legible a partir de bytes. Ej.: $bytes[1536] → 1.5 KB.", (c, a) => fmtB(Math.max(0, N(a[0]))), { min: 1 });

F(C6, "left", "texto;n", "Los primeros n caracteres.", (c, a) => [...S(a[0])].slice(0, Math.max(0, N(a[1]))).join(""), { min: 2 });
F(C6, "right", "texto;n", "Los últimos n caracteres.", (c, a) => { const ch = [...S(a[0])], n = Math.max(0, N(a[1])); return n ? ch.slice(-n).join("") : ""; }, { min: 2 });
F(C6, "lastIndexOf", "texto;buscar", "Posición (desde 0) de la última aparición, o -1.", (c, a) => S(a[0]).lastIndexOf(S(a[1])), { min: 2 });
F(C6, "containsAny", "texto;a;b;…", "true si el texto contiene alguna de las palabras (sin distinguir mayúsculas).", (c, a) => { const t = S(a[0]).toLowerCase(); return a.slice(1).some(x => S(x) && t.includes(S(x).toLowerCase())); }, { min: 2 });
F(C6, "containsAll", "texto;a;b;…", "true si el texto contiene todas las palabras (sin distinguir mayúsculas).", (c, a) => { const t = S(a[0]).toLowerCase(); return a.slice(1).every(x => t.includes(S(x).toLowerCase())); }, { min: 2 });
F(C6, "equalsIgnoreCase", "a;b", "true si dos textos son iguales sin distinguir mayúsculas ni tildes.", (c, a) => noAcc(S(a[0])).toLowerCase() === noAcc(S(a[1])).toLowerCase(), { min: 2 });
F(C6, "camelCase", "texto", "Convierte a camelCase. Ej.: «hola mundo» → holaMundo.", (c, a) => noAcc(S(a[0])).toLowerCase().replace(/[^a-z0-9]+(.)?/g, (m, ch) => ch ? ch.toUpperCase() : ""), { min: 1 });
F(C6, "snakeCase", "texto", "Convierte a snake_case. Ej.: «Hola Mundo» → hola_mundo.", (c, a) => noAcc(S(a[0])).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""), { min: 1 });
F(C6, "reverseWords", "texto", "Invierte el orden de las palabras.", (c, a) => S(a[0]).split(/\s+/).filter(Boolean).reverse().join(" "), { min: 1 });
F(C6, "escapeMarkdown", "texto", "Escapa los símbolos de Markdown de Discord (* _ ~ ` | > #) para mostrarlos tal cual.", (c, a) => S(a[0]).replace(/([\\*_~`|>#])/g, "\\$1"), { min: 1 });
F(C6, "rot13", "texto", "Cifrado simple ROT13 (aplícalo dos veces para volver al original).", (c, a) => S(a[0]).replace(/[a-z]/gi, ch => { const b = ch <= "Z" ? 65 : 97; return String.fromCharCode((ch.charCodeAt(0) - b + 13) % 26 + b); }), { min: 1 });
F(C6, "countLetters", "texto", "Cuenta solo las letras (sin números, espacios ni símbolos).", (c, a) => (S(a[0]).match(/\p{L}/gu) || []).length, { min: 1 });
F(C6, "uuid", "", "Identificador único aleatorio (UUID).", () => crypto.randomUUID());


// =================== Tiempo ===================
const C7 = "Tiempo";
F(C7, "isLeapYear", "[año]", "true si el año es bisiesto (el actual por defecto).", (c, a) => { const y = Math.round(N(a[0], new Date().getUTCFullYear())); return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; });
F(C7, "daysInMonth", "[mes];[año]", "Cuántos días tiene un mes (1 a 12; el actual por defecto).", (c, a) => { const d = new Date(); const m = Math.round(N(a[0], d.getUTCMonth() + 1)), y = Math.round(N(a[1], d.getUTCFullYear())); if (m < 1 || m > 12) throw Error("el mes debe estar entre 1 y 12"); return new Date(Date.UTC(y, m, 0)).getUTCDate(); });
F(C7, "unix", "", "Segundos desde 1970 (ahora).", () => Math.floor(Date.now() / 1000));
F(C7, "date", "[formato];[unix]", "Fecha y hora. Formato con YYYY MM DD HH mm ss (por defecto DD/MM/YYYY HH:mm).", (c, a) => dateFmt(S(a[0], "DD/MM/YYYY HH:mm"), a[1] ? new Date(N(a[1]) * 1000) : new Date()));
F(C7, "discordTime", "unix;[estilo]", "Hora que Discord muestra en la zona de cada persona (estilo: t T d D f F R).", (c, a) => `<t:${Math.floor(N(a[0]))}:${/^[tTdDfFR]$/.test(S(a[1])) ? a[1] : "f"}>`, { min: 1 });
F(C7, "duration", "segundos", "Convierte segundos en «1 d 2 h 3 min».", (c, a) => human(N(a[0])), { min: 1 });
F(C7, "uptime", "", "Tiempo que lleva encendido el servidor.", () => human(process.uptime()));

F(C7, "parseDate", "fecha", "Convierte «2026-12-25» o «2026-12-25 18:30» en segundos Unix (hora del servidor).", (c, a) => { const m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?$/.exec(S(a[0]).trim()); if (!m) throw Error("usa el formato AAAA-MM-DD o AAAA-MM-DD HH:mm"); const d = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)); if (isNaN(d)) throw Error("fecha no válida"); return Math.floor(d / 1000); }, { min: 1 });
F(C7, "timeAgo", "unix", "Tiempo transcurrido desde un instante: «hace 2 h 5 min» (o «dentro de…» si es futuro).", (c, a) => { const d = Math.floor(Date.now() / 1000) - N(a[0]); return (d >= 0 ? "hace " : "dentro de ") + human(Math.abs(d)); }, { min: 1 });
F(C7, "daysBetween", "unix1;unix2", "Días enteros entre dos instantes.", (c, a) => Math.floor(Math.abs(N(a[1]) - N(a[0])) / 86400), { min: 2 });
F(C7, "daysUntil", "unix", "Días enteros que faltan para un instante (0 si ya pasó).", (c, a) => Math.max(0, Math.ceil((N(a[0]) - Date.now() / 1000) / 86400)), { min: 1 });
F(C7, "weekday", "[unix]", "Nombre del día de la semana (lunes, martes…) de un instante; hoy si no se indica.", (c, a) => ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"][(a[0] ? new Date(N(a[0]) * 1000) : new Date()).getDay()]);

// =================== SynapseBox ===================
const C8 = "SynapseBox";
F(C8, "sbUser", "[idUsuario]", "Usuario de SynapseBox vinculado a esa persona (por defecto, quien usa el comando); vacío si no hay.", (c, a) => sbOf(c, a[0])?.username ?? "");
F(C8, "sbSpace", "[idUsuario]", "Espacio usado por esa persona (requiere cuenta vinculada).", async (c, a) => fmtB(await usage(sbNeed(c, a[0]))));
F(C8, "sbQuota", "[idUsuario]", "Espacio total de la cuenta vinculada de esa persona.", (c, a) => { const l = limitB(sbNeed(c, a[0])); return Number.isFinite(l) ? fmtB(l) : "sin límite"; });
F(C8, "sbPercent", "[idUsuario]", "Porcentaje de espacio usado por esa persona.", async (c, a) => { const u = sbNeed(c, a[0]), l = limitB(u); return Number.isFinite(l) ? Math.round(await usage(u) / l * 100) : 0; });
F(C8, "sbUsers", "", "Número de cuentas del servidor de SynapseBox.", () => get("SELECT COUNT(*) n FROM users").n);
F(C8, "sbVersion", "", "Versión instalada de SynapseBox.", () => ver.info().current);

// =================== Moderación (el que usa el comando debe tener el permiso en Discord) ===================
const C9 = "Moderación";
F(C9, "giveRole", "idRol;[idUsuario]", "Da un rol (quien lo usa necesita «Gestionar roles»).", async (c, a) => { need(c, "ManageRoles"); const g = sameGuild(c), w = await who(c, a[1]); await act(c, `daría el rol ${a[0]} a ${w.user.username}`, async () => { const m = w.member || await g.members.fetch(w.id); await m.roles.add(id(a[0])); }); }, { q: true, min: 1 });
F(C9, "takeRole", "idRol;[idUsuario]", "Quita un rol (necesita «Gestionar roles»).", async (c, a) => { need(c, "ManageRoles"); const g = sameGuild(c), w = await who(c, a[1]); await act(c, `quitaría el rol ${a[0]} a ${w.user.username}`, async () => { const m = w.member || await g.members.fetch(w.id); await m.roles.remove(id(a[0])); }); }, { q: true, min: 1 });
F(C9, "kick", "idUsuario;[motivo]", "Expulsa a un miembro (necesita «Expulsar miembros»).", async (c, a) => { need(c, "KickMembers"); const g = sameGuild(c), w = await who(c, a[0]); await act(c, `expulsaría a ${w.user.username}`, async () => { await (w.member || await g.members.fetch(w.id)).kick(S(a[1]).slice(0, 200)); }); }, { q: true, min: 1 });
F(C9, "ban", "idUsuario;[motivo]", "Banea a un usuario (necesita «Banear miembros»).", async (c, a) => { need(c, "BanMembers"); const g = sameGuild(c), w = await who(c, a[0]); await act(c, `baneará a ${w.user.username}`, async () => { await g.members.ban(w.id, { reason: S(a[1]).slice(0, 200) }); }); }, { q: true, min: 1 });
F(C9, "timeout", "idUsuario;minutos;[motivo]", "Aísla a un miembro (necesita «Aislar miembros»). 0 = quitar.", async (c, a) => { need(c, "ModerateMembers"); const g = sameGuild(c), w = await who(c, a[0]), min = Math.min(40320, Math.max(0, N(a[1]))); await act(c, `aislaría a ${w.user.username} ${min} min`, async () => { await (w.member || await g.members.fetch(w.id)).timeout(min ? min * 60000 : null, S(a[2]).slice(0, 200)); }); }, { q: true, min: 2 });
F(C9, "deleteMessages", "cantidad", "Borra mensajes recientes del canal (1-100; necesita «Gestionar mensajes»).", async (c, a) => { need(c, "ManageMessages"); const n = Math.min(100, Math.max(1, N(a[0]))); await act(c, `borraría ${n} mensajes`, async () => { await c.channel.bulkDelete(n, true); }); }, { q: true, min: 1 });

F(C9, "setNickname", "idUsuario;apodo", "Cambia el apodo de un miembro (necesita «Gestionar apodos»). Vacío = quitarlo.", async (c, a) => { need(c, "ManageNicknames"); const g = sameGuild(c), w = await who(c, a[0]); await act(c, `cambiaría el apodo de ${w.user.username} a «${S(a[1]).slice(0, 32)}»`, async () => { await (w.member || await g.members.fetch(w.id)).setNickname(S(a[1]).slice(0, 32) || null); }); }, { q: true, min: 1 });
F(C9, "unban", "idUsuario;[motivo]", "Quita el baneo a un usuario (necesita «Banear miembros»).", async (c, a) => { need(c, "BanMembers"); const g = sameGuild(c), uid = id(a[0]); if (!uid) throw Error("falta el ID"); await act(c, `quitaría el baneo a ${uid}`, async () => { await g.members.unban(uid, S(a[1]).slice(0, 200)); }); }, { q: true, min: 1 });
F(C9, "slowmode", "segundos", "Modo lento del canal actual (0-21600 s; necesita «Gestionar canales»). 0 lo quita.", async (c, a) => { need(c, "ManageChannels"); const n = Math.min(21600, Math.max(0, N(a[0]))); await act(c, `pondría el modo lento a ${n} s`, async () => { await c.channel.setRateLimitPerUser(n); }); }, { q: true, min: 1 });

// Roles "de autoservicio": los da el BOT (necesita «Gestionar roles» y que el rol esté por debajo del suyo), así que quien usa el comando NO necesita ese permiso.
// Para que esto no sirva para escalar privilegios, solo se permiten roles sin permisos peligrosos y que no sean de bots/integraciones ni @everyone.
const DANGER = ["Administrator", "ManageGuild", "ManageRoles", "ManageChannels", "ManageWebhooks", "KickMembers", "BanMembers", "ModerateMembers", "ManageMessages", "ManageNicknames", "ManageThreads", "ManageEvents", "ManageGuildExpressions", "MentionEveryone", "ViewAuditLog", "ViewGuildInsights"];
function grantable(g, roleId) { // devuelve el rol o lanza un error que explica por qué no se puede
  const r = g.roles.cache.get(roleId); if (!r) throw Error("ese rol no existe en este servidor");
  const me = g.members.me; if (!me?.permissions?.has("ManageRoles")) throw Error("el bot no tiene el permiso «Gestionar roles» en este servidor");
  if (r.id === g.id || r.managed) throw Error("ese rol no se puede dar (es @everyone o de una integración)");
  if (r.position >= me.roles.highest.position) throw Error("el rol está por encima del rol del bot: sube el rol del bot en Ajustes del servidor → Roles");
  const bad = DANGER.filter(p => r.permissions.has(p)); if (bad.length) throw Error(`por seguridad no se pueden dar con SBScript roles con permisos de gestión (${bad.slice(0, 3).join(", ")}…)`);
  return r;
}
const selfRole = (give) => async (c, a) => {
  const g = sameGuild(c), rid = id(a[0]); if (!rid) throw Error("falta el ID del rol");
  await act(c, `${give ? "daría" : "quitaría"} el rol ${rid} a quien usa el comando (lo hace el bot, sin pedir permisos al usuario)`, async () => {
    const r = grantable(g, rid), m = c.member || await g.members.fetch(c.user.id);
    if (give) await m.roles.add(r, "SBScript: $grantRole"); else await m.roles.remove(r, "SBScript: $revokeRole");
  });
};
F(C9, "grantRole", "idRol", "Da un rol a quien usa el comando, lo hace el bot: el usuario NO necesita permisos. Ideal para el captcha. Solo roles sin permisos de gestión y por debajo del rol del bot.", selfRole(true), { q: true, min: 1 });
F(C9, "revokeRole", "idRol", "Quita un rol a quien usa el comando, lo hace el bot (mismas reglas que $grantRole).", selfRole(false), { q: true, min: 1 });
F(C9, "canGrantRole", "idRol", "true si el bot puede dar ese rol con $grantRole (existe, está por debajo del bot y no es peligroso). Para avisar al admin con un mensaje claro.", (c, a) => { if (c.dry) return true; try { grantable(sameGuild(c), id(a[0])); return true; } catch { return false; } }, { min: 1 });
F(C9, "botHasPerm", "permiso", "true si el BOT tiene ese permiso de Discord en el servidor (ManageRoles, BanMembers…).", (c, a) => c.dry ? true : !!c.guild?.members?.me?.permissions?.has?.(S(a[0]).trim()), { min: 1 });

// =================== IA (usa la IA configurada en SynapseBox) ===================
// Sin herramientas: la IA solo recibe el texto y devuelve texto; nunca toca archivos. Máx. 3 llamadas por ejecución.
// Los textos de usuario se pasan como DATOS (no como instrucciones). Se cuentan en el límite de IA de la cuenta vinculada, o 10 por hora si no hay.
const CA = "IA";
async function askAI(c, task, text) {
  if (!ai.enabled()) throw Error("la IA no está activada: configúrala en el panel de administración");
  if (c.out.ai >= 3) throw Error("máximo 3 llamadas a la IA por ejecución");
  c.out.ai++; const t0 = Date.now();
  try { return await ai.ask({ u: c.sb, did: c.user.id, system: c.aiSystem, free: c.dry, prompt: text === undefined ? task : `${task}\n\n<datos>\n${S(text).slice(0, 4000)}\n</datos>` }); }
  finally { c.deadline += Date.now() - t0; } // el tiempo de espera de la IA no cuenta para el límite de 4 s
}
F(CA, "aiAvailable", "", "true si la IA está configurada (para dar una alternativa si no lo está).", () => ai.enabled());
F(CA, "aiPersona", "descripción", "Define cómo debe comportarse la IA en las siguientes llamadas de este comando (máx. 600 caracteres). Ej.: «Eres un pirata gracioso».", (c, a) => { c.aiSystem = S(a[0]).slice(0, 600); return ""; }, { q: true, min: 1 });
F(CA, "ai", "instrucción;[texto]", "Pide algo a la IA. La instrucción la escribes tú; el texto (lo que escribe el usuario) se trata como datos. Ej.: $ai[Responde en una frase;$message]", (c, a) => askAI(c, S(a[0]), a.length > 1 ? S(a[1]) : undefined), { min: 1 });
F(CA, "aiSummarize", "texto;[frases]", "Resume un texto en pocas frases (3 por defecto).", (c, a) => askAI(c, `Resume el texto en ${Math.min(10, Math.max(1, N(a[1], 3)))} frase(s).`, a[0]), { min: 1 });
F(CA, "aiTranslate", "texto;idioma", "Traduce un texto al idioma indicado (español, inglés, japonés…).", (c, a) => askAI(c, `Traduce el texto a ${S(a[1]).slice(0, 40)}. Devuelve solo la traducción.`, a[0]), { min: 2 });
F(CA, "aiFix", "texto", "Corrige la ortografía y la gramática sin cambiar el significado.", (c, a) => askAI(c, "Corrige la ortografía y la gramática del texto sin cambiar su significado. Devuelve solo el texto corregido.", a[0]), { min: 1 });
F(CA, "aiRewrite", "texto;estilo", "Reescribe el texto con otro estilo (formal, divertido, más corto…).", (c, a) => askAI(c, `Reescribe el texto con este estilo: ${S(a[1]).slice(0, 80)}. Devuelve solo el texto reescrito.`, a[0]), { min: 2 });
F(CA, "aiExplain", "tema", "Explica un tema de forma sencilla y breve.", (c, a) => askAI(c, "Explica el tema de forma sencilla y breve, como a alguien que empieza.", a[0]), { min: 1 });
F(CA, "aiIdeas", "tema;[cantidad]", "Da una lista de ideas sobre un tema (5 por defecto, máx. 10).", (c, a) => askAI(c, `Da ${Math.min(10, Math.max(1, N(a[1], 5)))} ideas breves y distintas sobre el tema, una por línea con «• » delante.`, a[0]), { min: 1 });
F(CA, "aiSentiment", "texto", "Devuelve positivo, negativo o neutral según el tono del texto.", async (c, a) => { const r = (await askAI(c, "Indica el sentimiento del texto. Responde con una sola palabra: positivo, negativo o neutral.", a[0])).toLowerCase(); return /negativ/.test(r) ? "negativo" : /positiv/.test(r) ? "positivo" : "neutral"; }, { min: 1 });
F(CA, "aiClassify", "texto;cat1,cat2,…", "Elige a cuál de tus categorías pertenece el texto. Devuelve una de ellas (vacío si ninguna encaja).", async (c, a) => { const cats = S(a[1]).split(",").map(x => x.trim()).filter(Boolean).slice(0, 20); if (!cats.length) throw Error("indica las categorías separadas por coma"); const r = (await askAI(c, `Clasifica el texto en UNA de estas categorías: ${cats.join(", ")}. Responde solo con el nombre exacto de la categoría.`, a[0])).toLowerCase(); return cats.find(x => r === x.toLowerCase()) || cats.find(x => r.includes(x.toLowerCase())) || ""; }, { min: 2 });
F(CA, "aiModerate", "texto", "true si la IA considera el texto ofensivo, acoso, spam o inapropiado; si no, false. Pensado para comandos de mensaje.", async (c, a) => /^\s*(si|sí|true|yes)/i.test(await askAI(c, "¿El texto contiene insultos, acoso, discurso de odio, spam o contenido inapropiado? Responde solo «si» o «no».", a[0])), { min: 1 });

// =================== HTTP y JSON (httpjson.js) ===================
require("./httpjson")(F, { S, N, act });

// Los comandos guardados antes del cambio de nombre (FCScript → SBScript) usaban $fcUser, $fcSpace, $isFcAdmin… Siguen funcionando, sin aparecer en la wiki.
for (const n of ["User", "Space", "Quota", "Percent", "Users", "Version"]) FN["fc" + n.toLowerCase()] = FN["sb" + n.toLowerCase()];
FN["isfcadmin"] = FN["issbadmin"];

const BLOCKDOCS = [
  { n: "if", a: "condición", d: "Empieza una condición. Operadores: == != > < >= <= ~= (contiene), && (y), || (o).", c: "Bloques", blk: true },
  { n: "elseif", a: "condición", d: "Otra condición si la anterior no se cumplió.", c: "Bloques", blk: true },
  { n: "else", a: "", d: "Lo que pasa si ninguna condición se cumplió.", c: "Bloques", blk: true },
  { n: "endif", a: "", d: "Cierra el $if.", c: "Bloques", blk: true },
  { n: "for", a: "variable;desde;hasta;[paso]", d: "Repite (máx. 200 vueltas). Lee la variable con $get[variable].", c: "Bloques", blk: true },
  { n: "endfor", a: "", d: "Cierra el $for.", c: "Bloques", blk: true },
  { n: "while", a: "condición", d: "Repite mientras se cumpla la condición (máx. 200 vueltas).", c: "Bloques", blk: true },
  { n: "endwhile", a: "", d: "Cierra el $while.", c: "Bloques", blk: true },
];
R.bind(FN);
module.exports = { FN, QUIET, DOCS: [...BLOCKDOCS, ...LIST] };
