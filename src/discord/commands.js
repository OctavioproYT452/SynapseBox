// Comandos de barra del bot de Discord. Unos son para todos los usuarios vinculados y otros solo para administradores
// (se comprueba en cada uso contra la base de datos: si le quitas el rol de admin o suspendes la cuenta, el efecto es inmediato).
// Por defecto las respuestas son privadas ("efímeras"): solo las ve quien usó el comando. Algunos comandos son públicos
// (los ve todo el canal): los de información del servidor, y otros dejan elegir con la opción «publico» o «privado».
const fsp = require("fs").promises, path = require("path"), crypto = require("crypto"), os = require("os");
const si = require("systeminformation");
const { get, all, run, now, verify } = require("../db");
const { safe, base, limitB } = require("../lib/paths");
const { usage } = require("../lib/storage");
const { errMsg } = require("../lib/utils");
const { locked, addFail, fails } = require("../services/auth");
const tf = require("../services/twofa");
const ai = require("../ai");
const welcome = require("./welcome");
const ver = require("../version");
const store = require("./store");
const logger = require("./logger");
const updates = require("./updates");
const custom = require("./custom");
const { md, code, fmt } = logger;

const P = v => "/" + String(v ?? "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
const publicUrl = () => String(process.env.PUBLIC_URL || "").trim().replace(/\/+$/, "");
const shareUrl = t => (publicUrl() || "") + "/s/" + t;
const unix = ms => Math.floor(ms / 1000);
const GENERIC = e => /^(Type|Reference|Range|Syntax)Error$/.test(e.name) ? "Ocurrió un error inesperado" : errMsg(e);

module.exports = function build(D) {
  const { SlashCommandBuilder, ChannelType, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags, PermissionFlagsBits } = D;
  const EPH = MessageFlags.Ephemeral, COLOR = 0x4f8cff;

  // ---------- ayudantes de respuesta ----------
  const emb = (title, desc) => { const e = new EmbedBuilder().setColor(COLOR).setFooter({ text: "SynapseBox" }); if (title) e.setTitle(title); if (desc) e.setDescription(String(desc).slice(0, 4000)); return e; };
  // pub = respuesta pública (la ve todo el canal, sin menciones que avisen a nadie). Si no, privada.
  const reply = (i, p, pub) => (i.deferred || i.replied) ? i.editReply(p) : pub ? i.reply({ allowedMentions: { parse: [] }, ...p }) : i.reply({ ...p, flags: EPH });
  const say = (i, text) => reply(i, { content: String(text).slice(0, 1900) });
  const defer = (i, pub) => i.deferReply(pub ? {} : { flags: EPH });
  // Opciones para elegir la visibilidad: «publico» (privado por defecto) y «privado» (público por defecto)
  const pubOpt = b => b.addBooleanOption(o => o.setName("publico").setDescription("Mostrar la respuesta a todos en el canal (por defecto solo la ves tú)"));
  const privOpt = b => b.addBooleanOption(o => o.setName("privado").setDescription("Que la respuesta la veas solo tú (por defecto la ve todo el canal)"));
  const isPub = (i, byDefault) => byDefault ? !i.options.getBoolean("privado") : !!i.options.getBoolean("publico");
  const guildOnly = b => b.setDMPermission(false);
  const bar = pct => { const n = Math.max(0, Math.min(10, Math.round(pct / 10))); return "▰".repeat(n) + "▱".repeat(10 - n) + ` ${Math.round(pct)}%`; };
  const adminLine = u => `**${md(u.username)}** *(admin, por Discord)*`;

  // ---------- definición de comandos ----------
  const C = [];
  const cmd = (name, desc) => new SlashCommandBuilder().setName(name).setDescription(desc);
  const add = (b, fn, need) => C.push({ b, fn, need });
  const adminCmd = (name, desc) => cmd(name, "(Admin) " + desc).setDMPermission(false);

  // ===== Para todos =====
  add(pubOpt(cmd("ayuda", "Muestra lo que puede hacer el bot de SynapseBox")), async (i, u) => {
    const pub = isPub(i, false);
    const e = emb("Bot de SynapseBox", pub ? "Comandos del bot de SynapseBox." : "Salvo los marcados como públicos, las respuestas son privadas: solo las ves tú.")
      .addFields({ name: "Para todos", value: [
        "**/vincular** · enlaza tu cuenta con usuario, contraseña y 2FA",
        "**/desvincular** · quita el enlace con tu cuenta",
        "**/cuenta** · tu espacio, 2FA, enlaces y uso de la IA",
        "**/archivos** · mira tu carpeta personal",
        "**/buscar** · busca archivos por nombre",
        "**/enlaces** · lista, crea o revoca tus enlaces para compartir",
        "**/ia** · pide algo al asistente de IA (si está activado)",
        "**/version** · versión instalada y si hay una nueva *(público)*",
        "**/recientes** · **/favoritos** · tus archivos recientes y favoritos",
        "**/comandos** · comandos propios de este servidor",
      ].join("\n") })
      .addFields({ name: "Información del servidor de Discord *(públicos)*", value: [
        "**/ping** · latencia del bot",
        "**/servidorinfo** · datos de este servidor",
        "**/usuarioinfo** · datos de un miembro",
        "**/avatar** · la foto de perfil de alguien",
        "**/dado** · **/moneda** · **/elegir** · **/encuesta** · juegos y votaciones",
        "Añade `privado: sí` para verlos solo tú.",
      ].join("\n") })
      .addFields({ name: "Para quien gestiona el servidor", value: "**/bienvenida** · mensaje de bienvenida y rol automático (canal, texto y códigos como {username})" });
    if (u?.is_admin && !pub) e.addFields({ name: "Solo administradores", value: [
      "**/config** · canales de registros y de actualizaciones",
      "**/servidor** · CPU, memoria, disco y totales",
      "**/usuarios** · lista de cuentas  ·  **/usuario** · detalle de una cuenta",
      "**/suspender**  ·  **/reactivar** · bloquea o devuelve el acceso",
      "**/anuncio** · mensaje para todos en el panel  ·  **/registro** · abre o cierra el registro",
      "**/actualizar** · comprueba y anuncia una versión nueva",
    ].join("\n") });
    await reply(i, { embeds: [e] }, pub);
  }, "maybe");

  // Vincular: un formulario privado (solo lo ve quien lo usa) con usuario, contraseña y, si la cuenta lo tiene, el 2FA.
  add(cmd("vincular", "Vincula tu cuenta de SynapseBox con tu Discord (usuario, contraseña y 2FA)"), async i => {
    const cur = store.userByDiscord(i.user.id);
    if (cur) return say(i, `Ya tienes vinculada la cuenta **${md(cur.username)}**. Si quieres cambiarla, usa **/desvincular** primero.`);
    const field = (id, label, ph, required, max) => new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(TextInputStyle.Short).setPlaceholder(ph).setRequired(required).setMaxLength(max));
    await i.showModal(new ModalBuilder().setCustomId("sb-link").setTitle("Vincular cuenta de SynapseBox").addComponents(
      field("u", "Nombre de usuario", "Tu usuario de SynapseBox", true, 32),
      field("p", "Contraseña", "Solo se comprueba, no se guarda", true, 128),
      field("c", "Código 2FA (solo si lo tienes activado)", "6 dígitos de tu app o un código de recuperación", false, 14)));
  });

  async function submitLink(i) {
    const u = i.fields.getTextInputValue("u").trim(), pw = i.fields.getTextInputValue("p"), c = (i.fields.getTextInputValue("c") || "").trim();
    const kd = "dc|" + i.user.id, ku = "dcu|" + u.toLowerCase().slice(0, 64); // bloqueo por persona de Discord y por cuenta objetivo
    if (locked(kd) || locked(ku)) return say(i, "Demasiados intentos fallidos. Prueba de nuevo en 15 minutos.");
    const fail = msg => { addFail(kd); addFail(ku); return say(i, msg); };
    const row = u ? get("SELECT * FROM users WHERE username=?", u) : null;
    if (!row || !verify(pw, row.password_hash)) return fail("Usuario o contraseña incorrectos.");
    if (row.suspended) return say(i, "Esa cuenta está suspendida. Contacta con un administrador.");
    if (row.totp_on) {
      if (!c) return say(i, "Esta cuenta tiene la verificación en dos pasos activada. Usa **/vincular** otra vez y escribe también el código de 6 dígitos de tu app (o un código de recuperación).");
      const rc = tf.findCode(c);
      if (!(tf.checkTotp(row, c) || (rc && rc.user_id === row.id && (tf.useCode(c), true)))) return fail("El código de verificación no es correcto.");
    }
    const mine = store.userByDiscord(i.user.id);
    if (mine) return say(i, `Ya tienes vinculada la cuenta **${md(mine.username)}**. Usa **/desvincular** primero.`);
    if (store.linkOf(row.id)) return say(i, "Esa cuenta ya está vinculada a otro usuario de Discord. Desvincúlala desde la web (Mi perfil → Discord) o con **/desvincular** desde la cuenta de Discord que la tiene.");
    store.link(row.id, i.user.id, i.user.globalName || i.user.username);
    fails.delete(kd); fails.delete(ku);
    logger.log("cuentas", `**${md(row.username)}** vinculó su cuenta con Discord (${md(i.user.username)})`);
    await reply(i, { embeds: [emb("Cuenta vinculada", `Ahora eres **${md(row.username)}** en SynapseBox. Tu contraseña no se ha guardado.\nPrueba **/cuenta** o **/ayuda**. En la web verás el estado en *Mi perfil → Discord*.`)] });
  }

  add(cmd("desvincular", "Quita el enlace entre tu Discord y tu cuenta de SynapseBox"), async i => {
    const u = store.userByDiscord(i.user.id);
    if (!u) return say(i, "No tienes ninguna cuenta vinculada.");
    store.unlink(u.id);
    logger.log("cuentas", `**${md(u.username)}** desvinculó su cuenta de Discord`);
    await say(i, `Listo: tu Discord ya no está vinculado a **${md(u.username)}**.`);
  });

  add(pubOpt(cmd("cuenta", "Tu cuenta: espacio, 2FA, enlaces y uso de la IA")), async (i, u) => {
    const pub = isPub(i, false);
    const used = await usage(u), lim = limitB(u), pct = Number.isFinite(lim) ? used / lim * 100 : 0;
    const e = emb("Tu cuenta de SynapseBox").addFields(
      { name: "Usuario", value: `${md(u.username)}${u.is_admin ? " · administrador" : ""}`, inline: true },
      { name: "Verificación en dos pasos", value: u.totp_on ? "Activada" : "Desactivada", inline: true },
      { name: "Espacio", value: `${fmt(used)} de ${Number.isFinite(lim) ? fmt(lim) : "sin límite"}${Number.isFinite(lim) ? "\n" + bar(pct) : ""}` },
      { name: "Enlaces activos", value: String(get("SELECT COUNT(*) n FROM shares WHERE user_id=? AND (expires_at IS NULL OR expires_at>?)", u.id, now()).n), inline: true },
      { name: "Carpetas que compartes", value: String(get("SELECT COUNT(DISTINCT path) n FROM collabs WHERE owner_id=?", u.id).n), inline: true },
      { name: "Compartidas contigo", value: String(get("SELECT COUNT(*) n FROM collabs WHERE user_id=?", u.id).n), inline: true },
      ...(pub ? [] : [{ name: "Último acceso web", value: u.last_login ? `<t:${unix(u.last_login)}:R>` : "—", inline: true }]));
    if (ai.enabled()) { const s = ai.status(u); e.addFields({ name: "Asistente de IA", value: s.limit < 0 ? "Sin límite de uso" : s.limit === 0 ? "Desactivado para tu cuenta" : `${s.used} de ${s.limit} usos por ${s.period === "day" ? "día" : "hora"}`, inline: true }); }
    if (!pub) e.addFields({ name: "ID permanente", value: code(u.uuid) }); // el ID permanente nunca se muestra en público
    await reply(i, { embeds: [e] }, pub);
  }, "user");

  add(cmd("archivos", "Mira los archivos de tu carpeta personal").addStringOption(o => o.setName("ruta").setDescription("Carpeta que quieres ver (vacío = inicio), por ejemplo: fotos/2024").setMaxLength(300)), async (i, u) => {
    const root = base(u), rel = (i.options.getString("ruta") || "").trim(), dir = safe(root, rel);
    if (!rel) await fsp.mkdir(root, { recursive: true });
    const es = await fsp.readdir(dir, { withFileTypes: true }).catch(() => { throw Error("No existe esa carpeta"); });
    es.sort((a, b) => b.isDirectory() - a.isDirectory() || a.name.localeCompare(b.name));
    const dirs = es.filter(e => e.isDirectory()).length, shown = es.slice(0, 25), lines = [];
    for (const e of shown) {
      if (e.isDirectory()) { lines.push(`**${md(e.name)}**/`); continue; }
      const s = await fsp.stat(path.join(dir, e.name)).catch(() => null);
      lines.push(`${md(e.name)}${s ? " — " + fmt(s.size) : ""}`);
    }
    await reply(i, { embeds: [emb(`Carpeta ${P(rel)}`, lines.join("\n") || "*Está vacía.*").setFooter({ text: `SynapseBox · ${dirs} carpeta(s) y ${es.length - dirs} archivo(s)${es.length > shown.length ? ` · mostrando ${shown.length}` : ""}` })] });
  }, "user");

  add(cmd("buscar", "Busca archivos y carpetas por nombre").addStringOption(o => o.setName("texto").setDescription("Parte del nombre que buscas").setRequired(true).setMinLength(2).setMaxLength(100)), async (i, u) => {
    const q = i.options.getString("texto").trim().toLowerCase(), root = base(u), out = []; let seen = 0;
    if (q.length < 2) throw Error("Escribe al menos 2 letras");
    await defer(i);
    const walk = async (dir, depth) => {
      if (out.length >= 25 || seen > 20000 || depth > 12) return;
      let es; try { es = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
      for (const e of es) {
        if (out.length >= 25 || ++seen > 20000) return;
        const full = path.join(dir, e.name);
        if (e.name.toLowerCase().includes(q)) out.push({ rel: path.relative(root, full).split(path.sep).join("/"), dir: e.isDirectory() });
        if (e.isDirectory()) await walk(full, depth + 1);
      }
    };
    await walk(root, 0);
    await reply(i, { embeds: [emb(`Resultados para «${q.slice(0, 60)}»`, out.length ? out.map(r => `${r.dir ? "**" + md(P(r.rel)) + "**/" : md(P(r.rel))}`).join("\n") : "*No hay coincidencias.*").setFooter({ text: out.length >= 25 ? "SynapseBox · mostrando los primeros 25" : "SynapseBox" })] });
  }, "user");

  add(cmd("enlaces", "Mira, crea o revoca tus enlaces para compartir")
    .addSubcommand(s => s.setName("listar").setDescription("Tus enlaces activos"))
    .addSubcommand(s => s.setName("crear").setDescription("Crea un enlace para compartir un archivo o una carpeta")
      .addStringOption(o => o.setName("ruta").setDescription("Archivo o carpeta, por ejemplo: fotos/viaje.zip").setRequired(true).setMaxLength(300))
      .addIntegerOption(o => o.setName("dias").setDescription("Días hasta que caduque (vacío = no caduca)").setMinValue(1).setMaxValue(3650)))
    .addSubcommand(s => s.setName("revocar").setDescription("Elimina un enlace").addStringOption(o => o.setName("id").setDescription("El código que aparece en /enlaces listar").setRequired(true).setMinLength(4).setMaxLength(20))), async (i, u) => {
    const sub = i.options.getSubcommand();
    if (sub === "listar") {
      const rows = all("SELECT * FROM shares WHERE user_id=? AND (expires_at IS NULL OR expires_at>?) ORDER BY created_at DESC LIMIT 15", u.id, now());
      const total = get("SELECT COUNT(*) n FROM shares WHERE user_id=? AND (expires_at IS NULL OR expires_at>?)", u.id, now()).n;
      const lines = rows.map(s => `**${s.token.slice(0, 8)}** · ${code(P(s.path))} · ${s.expires_at ? `caduca <t:${unix(s.expires_at)}:R>` : "no caduca"}${s.pw ? " · con contraseña" : ""}${publicUrl() ? "\n" + shareUrl(s.token) : ""}`);
      return reply(i, { embeds: [emb("Tus enlaces", lines.join("\n") || "*No tienes enlaces activos.*").setFooter({ text: `SynapseBox · ${total} activo(s)${total > rows.length ? ` · mostrando ${rows.length}` : ""} · revoca con /enlaces revocar` })] });
    }
    if (sub === "crear") {
      if (!store.actionsOn()) throw Error("Un administrador ha desactivado las acciones sobre archivos desde Discord");
      const rel = (i.options.getString("ruta") || "").trim(), f = safe(base(u), rel);
      if (f === base(u)) throw Error("Indica un archivo o una carpeta dentro de tu espacio");
      const s = await fsp.stat(f).catch(() => { throw Error("No existe ese archivo o carpeta"); });
      const token = crypto.randomBytes(12).toString("base64url"), days = i.options.getInteger("dias") || 0;
      run("INSERT INTO shares VALUES(?,?,?,?,?,?,?)", token, u.id, path.relative(base(u), f), s.isDirectory() ? 1 : 0, days > 0 ? now() + days * 864e5 : null, now(), null);
      logger.log("enlaces", `**${md(u.username)}** creó un enlace para compartir ${code(P(rel))} *(desde Discord)*`);
      return say(i, `Enlace creado para ${code(P(rel))}${days ? ` (caduca en ${days} día${days === 1 ? "" : "s"})` : ""}:\n${shareUrl(token)}${publicUrl() ? "" : "\n*Añade la dirección pública de tu servidor (variable PUBLIC_URL del .env) para recibir el enlace completo.*"}`);
    }
    const id = i.options.getString("id").trim(), rows = all("SELECT token,path FROM shares WHERE user_id=? AND substr(token,1,?)=?", u.id, id.length, id);
    if (!rows.length) throw Error("No encuentro ningún enlace tuyo con ese código");
    if (rows.length > 1) throw Error("Ese código coincide con varios enlaces: escribe más caracteres");
    run("DELETE FROM shares WHERE token=?", rows[0].token);
    logger.log("enlaces", `**${md(u.username)}** revocó el enlace de ${code(P(rows[0].path))} *(desde Discord)*`);
    await say(i, `Enlace revocado: ${code(P(rows[0].path))}.`);
  }, "user");

  add(cmd("papelera", "Mira, restaura o vacía tu papelera de reciclaje")
    .addSubcommand(s => s.setName("ver").setDescription("Lo que hay en tu papelera"))
    .addSubcommand(s => s.setName("restaurar").setDescription("Devuelve un elemento a su sitio original").addStringOption(o => o.setName("id").setDescription("El código que aparece en /papelera ver").setRequired(true).setMinLength(3).setMaxLength(20)))
    .addSubcommand(s => s.setName("vaciar").setDescription("Elimina todo lo de la papelera para siempre")), async (i, u) => {
    const sub = i.options.getSubcommand(), tr = require("../services/trash");
    if (sub === "ver") {
      const items = tr.list(u), sm = tr.summary(u);
      const lines = items.slice(0, 15).map(t => `**${t.id.slice(0, 6)}** · ${code(t.path)} · ${fmt(t.size)} · se elimina <t:${unix(t.expires_at)}:R>`);
      return reply(i, { embeds: [emb("Tu papelera", lines.join("\n") || "*La papelera está vacía.*").setFooter({ text: `SynapseBox · ${sm.count} elemento(s)${items.length > 15 ? " · mostrando 15" : ""} · restaura con /papelera restaurar` })] });
    }
    if (!store.actionsOn()) throw Error("Un administrador ha desactivado las acciones sobre archivos desde Discord");
    if (sub === "vaciar") { const n = await tr.empty(u); logger.log("borrados", `**${md(u.username)}** vació su papelera *(desde Discord)*`); return say(i, `Papelera vaciada (${n} elemento${n === 1 ? "" : "s"}).`); }
    const id = i.options.getString("id").trim(), rows = tr.list(u).filter(t => t.id.startsWith(id));
    if (!rows.length) throw Error("No encuentro nada con ese código en tu papelera");
    if (rows.length > 1) throw Error("Ese código coincide con varios elementos: escribe más caracteres");
    const to = await tr.restore(u, rows[0].id);
    logger.log("borrados", `**${md(u.username)}** restauró ${code(to)} de la papelera *(desde Discord)*`);
    await say(i, `Restaurado en ${code(to)}.`);
  }, "user");
  add(cmd("ia", "Pídele algo al asistente de IA sobre tus archivos").addStringOption(o => o.setName("pregunta").setDescription("Qué quieres que haga o responda").setRequired(true).setMaxLength(2000)), async (i, u) => {
    if (!ai.enabled()) throw Error("La IA no está activada en este servidor");
    if (!store.actionsOn()) throw Error("Un administrador ha desactivado las acciones sobre archivos desde Discord");
    await defer(i);
    let r;
    try { r = await ai.chat(u, [{ role: "user", content: i.options.getString("pregunta") }]); }
    catch (e) { throw Error(e.message); } // los errores de la IA ya vienen redactados para el usuario
    const acts = (r.actions || []).slice(0, 10).map(a => `${a.ok ? "•" : "✗"} ${md(a.text)}`).join("\n");
    const e = emb(null, String(r.reply || "Hecho.").slice(0, 3500));
    if (acts) e.addFields({ name: "Acciones realizadas", value: acts.slice(0, 1000) });
    const s = r.usage; if (s) e.setFooter({ text: `SynapseBox · IA${s.limit >= 0 ? ` · ${s.used}/${s.limit} usos por ${s.period === "day" ? "día" : "hora"}` : ""}` });
    await reply(i, { embeds: [e] });
  }, "user");

  add(privOpt(cmd("version", "Versión instalada de SynapseBox y si hay una nueva")), async i => {
    const v = ver.info();
    await reply(i, { embeds: [emb("SynapseBox", v.url).addFields(
      { name: "Instalada", value: v.current, inline: true },
      { name: "Última publicada", value: v.latest || "sin comprobar", inline: true },
      { name: "Estado", value: v.available ? "Hay una versión nueva" : "Todo al día", inline: true },
      { name: "Servidor activo desde hace", value: `${Math.floor(process.uptime() / 3600)} h ${Math.floor(process.uptime() / 60) % 60} min`, inline: true })] }, isPub(i, true));
  });

  // ===== Información de Discord (públicos por defecto) =====
  add(privOpt(cmd("ping", "Comprueba que el bot responde y cuánto tarda")), async i => {
    const ws = Math.round(i.client.ws.ping);
    await reply(i, { embeds: [emb("🏓 Pong").addFields({ name: "Respuesta", value: `${Math.max(0, Date.now() - i.createdTimestamp)} ms`, inline: true }, { name: "Conexión con Discord", value: ws >= 0 ? `${ws} ms` : "—", inline: true })] }, isPub(i, true));
  });

  add(privOpt(guildOnly(cmd("servidorinfo", "Datos de este servidor de Discord"))), async i => {
    const g = i.guild; if (!g) throw Error("Este comando solo funciona dentro de un servidor");
    const e = emb(md(g.name)).addFields(
      { name: "Dueño", value: `<@${g.ownerId}>`, inline: true },
      { name: "Miembros", value: String(g.memberCount), inline: true },
      { name: "Creado", value: `<t:${unix(g.createdTimestamp)}:D> (<t:${unix(g.createdTimestamp)}:R>)` },
      { name: "Canales", value: String(g.channels.cache.size), inline: true },
      { name: "Roles", value: String(Math.max(0, g.roles.cache.size - 1)), inline: true },
      { name: "Mejoras", value: `${g.premiumSubscriptionCount || 0} (nivel ${g.premiumTier || 0})`, inline: true },
      { name: "ID", value: code(g.id) });
    if (g.iconURL()) e.setThumbnail(g.iconURL({ size: 256 }));
    if (g.description) e.setDescription(md(g.description).slice(0, 300));
    await reply(i, { embeds: [e] }, isPub(i, true));
  });

  add(privOpt(guildOnly(cmd("usuarioinfo", "Datos de un miembro del servidor").addUserOption(o => o.setName("usuario").setDescription("De quién (vacío = tú)")))), async i => {
    const user = i.options.getUser("usuario") || i.user, m = i.options.getMember("usuario") || (user.id === i.user.id ? i.member : null);
    const e = emb(md(m?.displayName || user.globalName || user.username)).setThumbnail((m || user).displayAvatarURL({ size: 256 })).addFields(
      { name: "Usuario", value: `@${md(user.username)}${user.bot ? " · bot" : ""}`, inline: true },
      { name: "Mención", value: `<@${user.id}>`, inline: true },
      { name: "Cuenta creada", value: `<t:${unix(user.createdTimestamp)}:D> (<t:${unix(user.createdTimestamp)}:R>)` });
    if (m?.joinedTimestamp) e.addFields({ name: "Se unió al servidor", value: `<t:${unix(m.joinedTimestamp)}:D> (<t:${unix(m.joinedTimestamp)}:R>)` });
    const roles = m ? [...m.roles.cache.values()].filter(r => r.id !== i.guildId).sort((a, b) => b.position - a.position) : [];
    if (roles.length) e.addFields({ name: `Roles (${roles.length})`, value: roles.slice(0, 15).map(r => `<@&${r.id}>`).join(" ") + (roles.length > 15 ? " …" : "") });
    e.addFields({ name: "ID", value: code(user.id) });
    await reply(i, { embeds: [e] }, isPub(i, true));
  });

  add(privOpt(cmd("avatar", "La foto de perfil de alguien").addUserOption(o => o.setName("usuario").setDescription("De quién (vacío = tú)"))), async i => {
    const user = i.options.getUser("usuario") || i.user, m = i.options.getMember("usuario");
    const url = (m || user).displayAvatarURL({ size: 1024 });
    await reply(i, { embeds: [emb(`Avatar de ${md(m?.displayName || user.globalName || user.username)}`).setImage(url).setDescription(`[Abrir en grande](${url})`)] }, isPub(i, true));
  });

  // ===== Solo administradores =====
  const chOpt = o => o.setName("canal").setDescription("Canal de texto").setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);
  add(adminCmd("config", "Canales y opciones del bot")
    .addSubcommand(s => s.setName("ver").setDescription("Muestra la configuración actual"))
    .addSubcommand(s => s.setName("registros").setDescription("Canal donde se publica lo que hace cada usuario").addChannelOption(chOpt))
    .addSubcommand(s => s.setName("actualizaciones").setDescription("Canal donde se avisa de las versiones nuevas").addChannelOption(chOpt))
    .addSubcommand(s => s.setName("prefijo").setDescription("Prefijo de los comandos propios de texto (por ejemplo !)").addStringOption(o => o.setName("texto").setDescription("1 a 3 caracteres, sin espacios").setRequired(true).setMaxLength(3)))
    .addSubcommand(s => s.setName("quitar").setDescription("Deja de usar uno de los canales").addStringOption(o => o.setName("cual").setDescription("Qué canal quitar").setRequired(true).addChoices({ name: "Registros", value: "log" }, { name: "Actualizaciones", value: "update" }))), async (i, u) => {
    const sub = i.options.getSubcommand();
    if (sub === "ver") {
      const ch = w => store.channel(w) ? `<#${store.channel(w)}>` : "No configurado";
      return reply(i, { embeds: [emb("Configuración del bot").addFields(
        { name: "Canal de registros", value: ch("log"), inline: true },
        { name: "Canal de actualizaciones", value: ch("update"), inline: true },
        { name: "Cuentas vinculadas", value: String(store.countLinks()), inline: true },
        { name: "Prefijo de comandos propios", value: md(custom.prefix()), inline: true },
        { name: "Se registra", value: Object.entries(store.EVENTS).map(([k, l]) => `${store.eventOn(k) ? "✓" : "✗"} ${l}`).join("\n") },
        { name: "Acciones sobre archivos desde Discord (enlaces e IA)", value: store.actionsOn() ? "Permitidas" : "Desactivadas" })
        .setFooter({ text: "SynapseBox · los eventos y las acciones se cambian en la web: Admin → Discord" })] });
    }
    if (sub === "prefijo") { custom.setPrefix(i.options.getString("texto")); logger.log("admin", `${adminLine(u)} cambió el prefijo de los comandos propios`); return say(i, `Prefijo de los comandos propios: **${md(custom.prefix())}**`); }
    if (sub === "quitar") {
      const w = i.options.getString("cual"); store.setChannel(w, null);
      logger.log("admin", `${adminLine(u)} quitó el canal de ${w === "log" ? "registros" : "actualizaciones"}`);
      return say(i, `Listo: ya no se usa el canal de ${w === "log" ? "registros" : "actualizaciones"}.`);
    }
    const ch = i.options.getChannel("canal"), w = sub === "registros" ? "log" : "update";
    try { await logger.sendTo(ch.id, { embeds: [{ color: 0x2ecc71, title: w === "log" ? "Canal de registros configurado" : "Canal de actualizaciones configurado", description: `Configurado por ${md(u.username)}. ${w === "log" ? "Aquí se publicará lo que haga cada usuario." : "Aquí se avisará cuando haya una versión nueva."}`, footer: { text: "SynapseBox" } }] }); }
    catch (e) { throw Error(`No puedo escribir en ${ch}. Dale al bot permiso para ver el canal, enviar mensajes e insertar enlaces. (${e.message})`); }
    store.setChannel(w, ch.id);
    if (w === "update") updates.announce().catch(() => { });
    logger.log("admin", `${adminLine(u)} configuró el canal de ${w === "log" ? "registros" : "actualizaciones"}`);
    await say(i, `Canal de ${w === "log" ? "registros" : "actualizaciones"}: ${ch}.`);
  }, "admin");

  add(pubOpt(adminCmd("servidor", "Estado del servidor: CPU, memoria, disco y totales")), async i => {
    const pub = isPub(i, false);
    await defer(i, pub);
    const [l, m, d] = await Promise.all([si.currentLoad(), si.mem(), si.fsSize()]), dk = d[0] || {};
    await reply(i, { embeds: [emb("Servidor de SynapseBox").addFields(
      { name: "CPU", value: bar(l.currentLoad), inline: true },
      { name: "Memoria", value: `${fmt(m.total - m.available)} de ${fmt(m.total)}\n${bar((m.total - m.available) / m.total * 100)}`, inline: true },
      { name: "Disco", value: dk.size ? `${fmt(dk.used)} de ${fmt(dk.size)}\n${bar(dk.used / dk.size * 100)}` : "—", inline: true },
      { name: "Usuarios", value: String(get("SELECT COUNT(*) n FROM users").n), inline: true },
      { name: "Almacenado", value: fmt(get("SELECT COALESCE(SUM(used_bytes),0) n FROM users").n), inline: true },
      { name: "Enlaces / sesiones", value: `${get("SELECT COUNT(*) n FROM shares").n} / ${get("SELECT COUNT(*) n FROM sessions WHERE expires_at>?", now()).n}`, inline: true },
      { name: "Versión", value: ver.info().current, inline: true },
      { name: "Sistema encendido hace", value: `${Math.floor(os.uptime() / 3600)} h`, inline: true })] }, pub);
  }, "admin");

  add(adminCmd("usuarios", "Lista las cuentas del servidor").addStringOption(o => o.setName("buscar").setDescription("Parte del nombre (vacío = todas)").setMaxLength(32)), async i => {
    const q = (i.options.getString("buscar") || "").trim().toLowerCase();
    const us = all("SELECT username,is_admin,suspended,max_space_mb,used_bytes FROM users ORDER BY username").filter(u => !q || u.username.toLowerCase().includes(q));
    const lines = us.slice(0, 25).map(u => `**${md(u.username)}** · ${u.is_admin ? "admin" : "usuario"}${u.suspended ? " · suspendido" : ""} · ${fmt(u.used_bytes)}${u.max_space_mb < 0 ? "" : " de " + fmt(u.max_space_mb * 1048576)}`);
    await reply(i, { embeds: [emb(`Cuentas (${us.length})`, lines.join("\n") || "*No hay coincidencias.*").setFooter({ text: us.length > 25 ? "SynapseBox · mostrando 25; afina con «buscar»" : "SynapseBox" })] });
  }, "admin");

  const target = i => {
    const t = get("SELECT * FROM users WHERE username=?", String(i.options.getString("usuario") || "").trim());
    if (!t) throw Error("No existe ese usuario");
    return t;
  };
  const userOpt = o => o.setName("usuario").setDescription("Nombre de usuario exacto").setRequired(true).setMaxLength(32);

  add(adminCmd("usuario", "Detalle de una cuenta").addStringOption(userOpt), async i => {
    const t = target(i), dl = store.linkOf(t.id);
    await reply(i, { embeds: [emb(md(t.username)).addFields(
      { name: "Rol", value: t.is_admin ? "Administrador" : "Usuario", inline: true },
      { name: "Estado", value: t.suspended ? "Suspendida" : "Activa", inline: true },
      { name: "2FA", value: t.totp_on ? "Activado" : "Desactivado", inline: true },
      { name: "Espacio", value: `${fmt(t.used_bytes)} de ${t.max_space_mb < 0 ? "sin límite" : fmt(t.max_space_mb * 1048576)}`, inline: true },
      { name: "Enlaces activos", value: String(get("SELECT COUNT(*) n FROM shares WHERE user_id=?", t.id).n), inline: true },
      { name: "Discord", value: dl ? md(dl.discord_name || "vinculado") : "Sin vincular", inline: true },
      { name: "Último acceso", value: t.last_login ? `<t:${unix(t.last_login)}:R>${t.last_ip ? " · " + code(t.last_ip) : ""}` : "Nunca", inline: true },
      { name: "Creada", value: t.created_at ? `<t:${unix(t.created_at)}:D>` : "—", inline: true },
      { name: "ID permanente", value: code(t.uuid) })] });
  }, "admin");

  function setSusp(on) {
    return async (i, u) => {
      const t = target(i);
      if (t.id === u.id) throw Error("No puedes suspenderte a ti mismo");
      if (on === !!t.suspended) throw Error(on ? "Esa cuenta ya estaba suspendida" : "Esa cuenta no estaba suspendida");
      run("UPDATE users SET suspended=? WHERE id=?", on ? 1 : 0, t.id);
      if (on) run("DELETE FROM sessions WHERE user_id=?", t.id);
      logger.log("admin", `${adminLine(u)} ${on ? "suspendió" : "reactivó"} la cuenta de **${md(t.username)}**`);
      await say(i, `Cuenta de **${md(t.username)}** ${on ? "suspendida (sus sesiones se cerraron)" : "reactivada"}.`);
    };
  }
  add(adminCmd("suspender", "Bloquea el acceso de una cuenta y cierra sus sesiones").addStringOption(userOpt), setSusp(true), "admin");
  add(adminCmd("reactivar", "Devuelve el acceso a una cuenta suspendida").addStringOption(userOpt), setSusp(false), "admin");

  add(adminCmd("anuncio", "Pone o quita el mensaje que ven todos en el panel").addStringOption(o => o.setName("texto").setDescription("El mensaje (vacío = quitarlo)").setMaxLength(300)), async (i, u) => {
    const t = (i.options.getString("texto") || "").trim();
    store.setS("announcement", t);
    logger.log("admin", `${adminLine(u)} ${t ? "publicó un anuncio" : "quitó el anuncio"}`);
    await say(i, t ? "Anuncio publicado en el panel de todos los usuarios." : "Anuncio quitado.");
  }, "admin");

  add(adminCmd("registro", "Abre o cierra el registro público de cuentas").addBooleanOption(o => o.setName("activo").setDescription("¿Permitir que cualquiera cree una cuenta?").setRequired(true)), async (i, u) => {
    const on = i.options.getBoolean("activo");
    store.setS("allow_registration", on ? "1" : "0");
    logger.log("admin", `${adminLine(u)} ${on ? "abrió" : "cerró"} el registro público`);
    await say(i, `Registro público ${on ? "activado" : "desactivado"}.`);
  }, "admin");

  add(adminCmd("actualizar", "Comprueba ahora si hay una versión nueva y la anuncia"), async i => {
    await defer(i);
    await ver.checkVersion();
    const v = ver.info();
    if (!v.available) return say(i, `Todo al día: versión **${v.current}**${v.latest ? ` (la última publicada es la **${v.latest}**)` : " (no se pudo consultar GitHub)"}.`);
    let sent = false;
    if (store.channel("update")) sent = await updates.announce(true).catch(() => false);
    await say(i, `Hay una versión nueva: **${v.latest}** (tienes la **${v.current}**). ${sent ? "Ya lo anuncié en el canal de actualizaciones." : store.channel("update") ? "No pude escribir en el canal de actualizaciones." : "Configura un canal con **/config actualizaciones** para recibir el aviso."}`);
  }, "admin");


  // ===== Bienvenidas (administradores de SynapseBox o quien pueda gestionar el servidor de Discord) =====
  const who = (i, u) => u ? adminLine(u) : `**${md(i.user.username)}** *(Discord)*`;
  const chName = id => id ? `<#${id}>` : "No configurado";
  const showVars = () => welcome.VARS.map(([k, d]) => `\`${k}\` · ${d}`).join("\n");
  const fmtTxt = t => String(t || "—").slice(0, 900);

  add(guildOnly(cmd("bienvenida", "Mensaje de bienvenida para los miembros nuevos (también se configura en la web)"))
    .addSubcommand(s => s.setName("ver").setDescription("Muestra la configuración actual"))
    .addSubcommand(s => s.setName("canal").setDescription("Canal donde se envían las bienvenidas").addChannelOption(chOpt))
    .addSubcommand(s => s.setName("mensaje").setDescription("Edita el mensaje y el título de la bienvenida (admite {username}, {members}…)"))
    .addSubcommand(s => s.setName("rol").setDescription("Rol que se da automáticamente a quien entra (sin indicar rol = no dar ninguno)")
      .addRoleOption(o => o.setName("rol").setDescription("El rol a dar")))
    .addSubcommand(s => s.setName("formato").setDescription("Enviar la bienvenida como tarjeta o como texto normal")
      .addStringOption(o => o.setName("tipo").setDescription("Cómo se muestra").setRequired(true).addChoices({ name: "Tarjeta (embed)", value: "embed" }, { name: "Texto normal", value: "texto" })))
    .addSubcommand(s => s.setName("activar").setDescription("Activa las bienvenidas automáticas"))
    .addSubcommand(s => s.setName("desactivar").setDescription("Desactiva las bienvenidas automáticas"))
    .addSubcommand(s => s.setName("probar").setDescription("Envía una bienvenida de prueba contigo como si acabaras de entrar"))
    .addSubcommand(s => s.setName("variables").setDescription("Lista los códigos que puedes usar en el mensaje"))
    .addSubcommand(s => s.setName("restablecer").setDescription("Borra la configuración y vuelve al mensaje por defecto")), async (i, u) => {
    const g = i.guild, sub = i.options.getSubcommand(), cfg = welcome.config(g.id);
    if (sub === "variables") return reply(i, { embeds: [emb("Códigos para el mensaje de bienvenida", showVars() + "\n\nEjemplo: `¡Hola {mention}, ya somos {members} en {server}!`\nSirven en el mensaje y en el título.")] });
    if (sub === "ver") {
      const hasIntent = i.client.options.intents.has(D.GatewayIntentBits.GuildMembers);
      const e = emb("Bienvenidas de " + md(g.name)).addFields(
        { name: "Estado", value: cfg.enabled ? "Activadas" : "Desactivadas", inline: true },
        { name: "Canal", value: chName(cfg.channel_id), inline: true },
        { name: "Rol automático", value: cfg.role_id ? `<@&${cfg.role_id}>` : "Ninguno", inline: true },
        { name: "Formato", value: cfg.embed ? "Tarjeta" : "Texto", inline: true },
        { name: "Título", value: fmtTxt(cfg.title) },
        { name: "Mensaje", value: fmtTxt(cfg.message) });
      if (!hasIntent) e.addFields({ name: "⚠ Falta un permiso del bot", value: "Activa **Server Members Intent** en discord.com/developers/applications → Bot → Privileged Gateway Intents y reinicia SynapseBox. Sin él no puedo ver quién entra." });
      return reply(i, { embeds: [e.setFooter({ text: "SynapseBox · también se edita en la web: Admin → Discord" })] });
    }
    if (sub === "mensaje") {
      const tIn = new TextInputBuilder().setCustomId("t").setLabel("Título (opcional)").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(welcome.MAX_TITLE);
      if (cfg.title) tIn.setValue(cfg.title.slice(0, welcome.MAX_TITLE));
      await i.showModal(new ModalBuilder().setCustomId("sb-welcome").setTitle("Mensaje de bienvenida").addComponents(
        new ActionRowBuilder().addComponents(tIn),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("m").setLabel("Mensaje (usa {username}, {members}…)").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(welcome.MAX_MSG).setValue(cfg.message.slice(0, welcome.MAX_MSG)))));
      return;
    }
    if (sub === "canal") {
      const ch = i.options.getChannel("canal");
      try { await logger.sendTo(ch.id, { embeds: [{ color: 0x2ecc71, title: "Canal de bienvenidas configurado", description: `Configurado por ${md(i.user.username)}. Aquí se saludará a quien entre al servidor (cuando las bienvenidas estén activadas).`, footer: { text: "SynapseBox" } }] }); }
      catch (e) { throw Error(`No puedo escribir en ${ch}. Dale al bot permiso para ver el canal, enviar mensajes e insertar enlaces. (${e.message})`); }
      welcome.save(g.id, { channel_id: ch.id });
      logger.log("admin", `${who(i, u)} configuró el canal de bienvenidas de **${md(g.name)}**`);
      return say(i, `Canal de bienvenidas: ${ch}.${cfg.enabled ? "" : " Cuando quieras, usa **/bienvenida activar**."}`);
    }
    if (sub === "rol") {
      const role = i.options.getRole("rol");
      if (role) { const why = welcome.roleProblem(g, g.roles.cache.get(role.id)); if (why) throw Error(why); }
      welcome.save(g.id, { role_id: role ? role.id : null });
      logger.log("admin", `${who(i, u)} ${role ? "puso el rol automático de bienvenida de" : "quitó el rol automático de bienvenida de"} **${md(g.name)}**`);
      return say(i, role ? `A quien entre se le dará el rol **${md(role.name)}**.${cfg.enabled ? "" : " Falta activar las bienvenidas con **/bienvenida activar**."}` : "Ya no se dará ningún rol al entrar.");
    }
    if (sub === "formato") {
      const embed = i.options.getString("tipo") === "embed"; welcome.save(g.id, { embed });
      logger.log("admin", `${who(i, u)} cambió el formato de las bienvenidas de **${md(g.name)}**`);
      return say(i, `Las bienvenidas se enviarán como ${embed ? "tarjeta" : "texto normal"}.`);
    }
    if (sub === "activar" || sub === "desactivar") {
      const on = sub === "activar";
      if (on && !i.client.options.intents.has(D.GatewayIntentBits.GuildMembers)) throw Error("El bot no tiene activado el permiso «Server Members Intent» (Developer Portal → Bot → Privileged Gateway Intents) y no puede ver quién entra. Actívalo y reinicia SynapseBox");
      welcome.save(g.id, { enabled: on });
      logger.log("admin", `${who(i, u)} ${on ? "activó" : "desactivó"} las bienvenidas de **${md(g.name)}**`);
      return say(i, on ? `Bienvenidas activadas${welcome.config(g.id).channel_id ? " en " + chName(welcome.config(g.id).channel_id) : ""}. Pruébalo con **/bienvenida probar**.` : "Bienvenidas desactivadas.");
    }
    if (sub === "restablecer") {
      welcome.remove(g.id);
      logger.log("admin", `${who(i, u)} restableció las bienvenidas de **${md(g.name)}**`);
      return say(i, "Listo: se borró la configuración de bienvenidas de este servidor.");
    }
    // probar
    const out = welcome.build(cfg, welcome.ctxOf(i.member));
    if (cfg.channel_id) {
      await logger.sendTo(cfg.channel_id, out).catch(e => { throw Error(`No pude escribir en ${chName(cfg.channel_id)}: ${e.message}`); });
      return say(i, `Bienvenida de prueba enviada a ${chName(cfg.channel_id)}.`);
    }
    await reply(i, { ...out, content: out.content ? "Vista previa (aún no hay canal):\n" + out.content : "Vista previa (aún no hay canal configurado):" });
  }, "guildadmin");

  async function submitWelcome(i) {
    if (!i.inGuild() || !i.guild) return say(i, "Esto solo funciona dentro de un servidor.");
    const user = store.userByDiscord(i.user.id), okUser = user && !user.suspended && user.is_admin;
    if (!okUser && !i.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return say(i, "Necesitas ser administrador de SynapseBox o poder gestionar el servidor.");
    try { welcome.save(i.guild.id, { title: i.fields.getTextInputValue("t"), message: i.fields.getTextInputValue("m") }); }
    catch (e) { return say(i, "No se guardó: " + GENERIC(e)); }
    logger.log("admin", `${who(i, okUser ? user : null)} editó el mensaje de bienvenida de **${md(i.guild.name)}**`);
    await say(i, "Mensaje de bienvenida guardado. Pruébalo con **/bienvenida probar**.");
  }

  // ===== Más comandos (v2.10.3) =====
  add(privOpt(cmd("dado", "Tira uno o varios dados").addIntegerOption(o => o.setName("caras").setDescription("Caras del dado (por defecto 6)").setMinValue(2).setMaxValue(1000)).addIntegerOption(o => o.setName("cantidad").setDescription("Cuántos dados (por defecto 1)").setMinValue(1).setMaxValue(10))), async i => {
    const f = i.options.getInteger("caras") || 6, n = i.options.getInteger("cantidad") || 1, r = Array.from({ length: n }, () => 1 + crypto.randomInt(f));
    await reply(i, { embeds: [emb(`🎲 ${n}d${f}`, `**${r.join(" + ")}**${n > 1 ? ` = **${r.reduce((a, b) => a + b, 0)}**` : ""}`)] }, isPub(i, true));
  });
  add(privOpt(cmd("moneda", "Lanza una moneda")), async i => reply(i, { embeds: [emb("🪙 Moneda", `Ha salido **${crypto.randomInt(2) ? "cara" : "cruz"}**`)] }, isPub(i, true)));
  add(privOpt(cmd("elegir", "Elige una opción al azar").addStringOption(o => o.setName("opciones").setDescription("Opciones separadas por comas: pizza, tacos, sushi").setRequired(true).setMaxLength(500))), async i => {
    const o = i.options.getString("opciones").split(",").map(x => x.trim()).filter(Boolean);
    if (o.length < 2) throw Error("Escribe al menos dos opciones separadas por comas");
    await reply(i, { embeds: [emb("🤔 Elijo…", `**${md(o[crypto.randomInt(o.length)])}**`).setFooter({ text: `SynapseBox · entre ${o.length} opciones` })] }, isPub(i, true));
  });
  add(guildOnly(cmd("encuesta", "Crea una encuesta con reacciones")).addStringOption(o => o.setName("pregunta").setDescription("La pregunta").setRequired(true).setMaxLength(200))
    .addStringOption(o => o.setName("opcion1").setDescription("Opción 1").setRequired(true).setMaxLength(80)).addStringOption(o => o.setName("opcion2").setDescription("Opción 2").setRequired(true).setMaxLength(80))
    .addStringOption(o => o.setName("opcion3").setDescription("Opción 3").setMaxLength(80)).addStringOption(o => o.setName("opcion4").setDescription("Opción 4").setMaxLength(80)), async i => {
    const ops = [1, 2, 3, 4].map(n => i.options.getString("opcion" + n)).filter(Boolean), E = ["1️⃣", "2️⃣", "3️⃣", "4️⃣"];
    await i.reply({ allowedMentions: { parse: [] }, embeds: [emb("📊 " + i.options.getString("pregunta"), ops.map((o, k) => `${E[k]} ${md(o)}`).join("\n")).setFooter({ text: `Encuesta de ${i.user.globalName || i.user.username}` })] });
    const msg = await i.fetchReply().catch(() => null);
    for (let k = 0; k < ops.length; k++) await msg?.react(E[k]).catch(() => { });
  });
  add(cmd("recientes", "Tus archivos modificados más recientemente"), async (i, u) => {
    await defer(i); const root = base(u), out = []; let seen = 0;
    const walk = async (dir, d) => { if (seen > 5000 || d > 8) return; let es; try { es = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; } for (const e of es) { if (++seen > 5000) return; const f = path.join(dir, e.name); if (e.isDirectory()) await walk(f, d + 1); else { const s = await fsp.stat(f).catch(() => null); if (s) out.push({ rel: path.relative(root, f).split(path.sep).join("/"), t: s.mtimeMs, size: s.size }); } } };
    await walk(root, 0); out.sort((a, b) => b.t - a.t);
    await reply(i, { embeds: [emb("Archivos recientes", out.slice(0, 10).map(f => `${md(P(f.rel))} — ${fmt(f.size)} · <t:${unix(f.t)}:R>`).join("\n") || "*Aún no tienes archivos.*")] });
  }, "user");
  add(cmd("favoritos", "Tus archivos y carpetas favoritos"), async (i, u) => {
    const f = all("SELECT path FROM favs WHERE user_id=? LIMIT 25", u.id);
    await reply(i, { embeds: [emb("Tus favoritos", f.map(x => md(P(x.path))).join("\n") || "*No tienes favoritos todavía.*")] });
  }, "user");
  add(pubOpt(cmd("comandos", "Comandos propios de este servidor (creados desde la web)")), async i => {
    const l = custom.list().commands.filter(c => c.activo && c.acceso !== "admin" && c.tipo !== "boton"), pf = custom.prefix();
    const line = c => `${c.tipo === "slash" ? "**/" + c.name + "**" : c.tipo === "prefijo" ? "**" + pf + c.name + "**" : "*" + md(c.name) + "* (responde a un mensaje)"}${c.descripcion ? " · " + md(c.descripcion) : ""}`;
    await reply(i, { embeds: [emb("Comandos propios", l.slice(0, 40).map(line).join("\n") || "*Todavía no hay comandos propios.*")] }, isPub(i, false));
  });
  add(guildOnly(cmd("limpiar", "Borra mensajes recientes de este canal").addIntegerOption(o => o.setName("cantidad").setDescription("Cuántos (1-100, no más de 14 días de antigüedad)").setRequired(true).setMinValue(1).setMaxValue(100))), async i => {
    if (!i.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) return say(i, "Necesitas el permiso «Gestionar mensajes» de Discord.");
    const r = await i.channel.bulkDelete(i.options.getInteger("cantidad"), true).catch(() => { throw Error("No pude borrar: el bot necesita «Gestionar mensajes» en este canal"); });
    logger.log("admin", `**${md(i.user.username)}** borró ${r.size} mensaje(s) en <#${i.channel.id}> con /limpiar`);
    await say(i, `Borrados ${r.size} mensaje(s).`);
  });

  // ===== Tickets (botón para abrir, rol de soporte que reclama y cierra) =====
  const tk = require("./tickets")(D);
  add(tk.builder, tk.run, "guildadmin");

  // ---------- ejecución ----------
  const byName = new Map(C.map(c => [c.b.name, c]));
  const last = new Map();
  const cooldown = id => { const t = Date.now(), p = last.get(id) || 0; if (t - p < 1500) return true; last.set(id, t); if (last.size > 2000) for (const [k, v] of last) if (t - v > 6e4) last.delete(k); return false; };

  async function runCommand(i) {
    const c = byName.get(i.commandName); if (!c) return;
    if (cooldown(i.user.id)) return say(i, "Más despacio: espera un par de segundos.");
    let user = store.userByDiscord(i.user.id);
    try {
      if (c.need === "user" || c.need === "admin") {
        if (!user) return say(i, "Primero vincula tu cuenta con **/vincular**.");
        if (user.suspended) return say(i, "Tu cuenta de SynapseBox está suspendida.");
        if (c.need === "admin" && !user.is_admin) return say(i, "Este comando es solo para administradores de SynapseBox.");
      }
      if (c.need === "guildadmin") {
        if (!i.inGuild() || !i.guild) return say(i, "Este comando solo funciona dentro de un servidor.");
        const okUser = user && !user.suspended && user.is_admin;
        if (!okUser && !i.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return say(i, "Este comando es para administradores de SynapseBox o para quien pueda gestionar este servidor de Discord.");
      }
      if (user?.suspended) user = null;
      await c.fn(i, user);
    } catch (e) {
      console.error(`[Discord] /${i.commandName}:`, e.message);
      const msg = "No se pudo completar: " + GENERIC(e);
      // si la respuesta ya se había pospuesto como pública, el error no debe verlo todo el canal
      if (i.deferred && !i.ephemeral) { await i.deleteReply().catch(() => { }); await i.followUp({ content: msg, flags: EPH }).catch(() => { }); return; }
      await Promise.resolve().then(() => say(i, msg)).catch(() => { });
    }
  }

  return { json: C.map(c => c.b.toJSON()), names: C.map(c => c.b.name), run: runCommand, submitLink, submitWelcome, tickets: tk };
};
