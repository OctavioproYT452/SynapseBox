// Bot de Discord de SynapseBox (OPCIONAL). Solo se activa si en el archivo .env hay un DISCORD_TOKEN.
// Sin token no se carga nada: el servidor funciona exactamente igual que siempre.
//   - Vincular cuentas con un formulario privado (usuario, contraseña y 2FA).
//   - Registro de actividad en un canal (sin guardar nada en disco) y avisos de actualización en otro.
//   - Comandos de barra: unos para todos los usuarios vinculados y otros solo para administradores.
const logger = require("./logger");
const updates = require("./updates");
const welcome = require("./welcome");
const custom = require("./custom");
const ver = require("../version");

let client = null, cmds = null, D = null;
const state = { configured: false, ready: false, tag: null, error: null, invite: null, guilds: 0, members: false, content: false };
let lastSync = "", syncTimer = null;

function start() {
  const token = String(process.env.DISCORD_TOKEN || "").trim();
  if (!token) return;
  state.configured = true;
  try { D = require("discord.js"); }
  catch { state.error = "Falta la librería discord.js: ejecuta «npm install» en la carpeta del proyecto"; console.warn("[Discord] " + state.error); return; }
  try { cmds = require("./commands")(D); }
  catch (e) { state.error = "No se pudo preparar el bot: " + e.message; console.error("[Discord] " + state.error); return; }
  try { custom.init(D, cmds.names, () => { clearTimeout(syncTimer); syncTimer = setTimeout(() => syncSlash().catch(() => { }), 2500); }); }
  catch (e) { console.error("[Discord] No se pudieron cargar los comandos propios:", e.message); }
  connect(token, 0);
  ver.onCheck(() => { if (state.ready) updates.announce().catch(() => { }); }); // avisa de versiones nuevas
}

// Se intenta con todos los intents y, si Discord rechaza alguno de los privilegiados (Developer Portal → Bot → Privileged
// Gateway Intents), se prueba sin ellos: «Server Members» solo sirve para las bienvenidas y «Message Content» para los
// comandos propios de prefijo o de mensaje. Todo lo demás funciona igual.
const TIERS = [{ m: true, c: true }, { m: true, c: false }, { m: false, c: true }, { m: false, c: false }];
function connect(token, tier) {
  const t = TIERS[tier], G = D.GatewayIntentBits, intents = [G.Guilds];
  if (t.m) intents.push(G.GuildMembers);
  if (t.c) intents.push(G.GuildMessages, G.MessageContent);
  try { client = new D.Client({ intents }); }
  catch (e) { state.error = "No se pudo preparar el bot: " + e.message; console.error("[Discord] " + state.error); return; }
  state.members = t.m; state.content = t.c;
  client.once(D.Events.ClientReady, onReady);
  client.on(D.Events.InteractionCreate, handle);
  if (t.m) client.on(D.Events.GuildMemberAdd, m => welcome.onJoin(m));
  if (t.c) client.on(D.Events.MessageCreate, m => custom.onMessage(m).catch(e => console.error("[Discord]", e.message)));
  client.on(D.Events.Error, e => console.error("[Discord]", e.message));
  client.login(token).catch(e => {
    if (tier < TIERS.length - 1 && /disallowed/i.test(e.code + " " + e.message)) {
      if (tier === 0) console.warn("[Discord] Algún permiso especial del bot no está activado (Developer Portal → Bot → Privileged Gateway Intents): «Server Members» (bienvenidas) y «Message Content» (comandos de prefijo/mensaje). Se prueba sin ellos.");
      try { client.destroy(); } catch { }
      return connect(token, tier + 1);
    }
    state.error = "No se pudo iniciar sesión: " + (/token/i.test(e.code + " " + e.message) ? "el token no es válido" : e.message);
    console.error("[Discord] " + state.error);
  });
}

// Registra en Discord los comandos del bot y los propios (solo si cambiaron, para no gastar el límite diario de Discord)
async function syncSlash() {
  if (!client || !state.ready) return;
  const json = [...cmds.json, ...custom.slashJson()], sig = JSON.stringify(json);
  if (sig === lastSync) return;
  await client.application.commands.set(json, String(process.env.DISCORD_GUILD_ID || "").trim() || undefined);
  lastSync = sig;
}

async function onReady(c) {
  state.ready = true; state.error = null; state.tag = c.user.tag; state.guilds = c.guilds.cache.size;
  state.invite = `https://discord.com/oauth2/authorize?client_id=${c.user.id}&scope=bot%20applications.commands&permissions=268553232`; // ver canal + enviar mensajes + insertar enlaces + adjuntar archivos + leer historial + gestionar roles (bienvenida y $giveRole) + gestionar canales (tickets)
  logger.setSender(async (id, payload) => {
    const ch = await client.channels.fetch(id);
    if (!ch || !ch.isTextBased()) throw Error("El canal no existe o no es de texto");
    return ch.send({ allowedMentions: { parse: [] }, ...payload }); // sin menciones, salvo el rol que el admin pida para las actualizaciones
  });
  try { await syncSlash(); }
  catch (e) { console.error("[Discord] No se pudieron registrar los comandos:", e.message); }
  console.log(`Bot de Discord conectado como ${c.user.tag}. Invítalo con: ${state.invite}`);
  updates.announce().catch(() => { });
}

async function handle(i) {
  try {
    if (i.isChatInputCommand()) { if (!(custom.hasSlash(i.commandName) && await custom.runSlash(i))) await cmds.run(i); }
    else if ((i.isButton() || i.isModalSubmit()) && String(i.customId).startsWith("tk:")) await cmds.tickets.component(i);
    else if (i.isButton() && (String(i.customId).startsWith("fcs:") || String(i.customId).startsWith("sbs:"))) await custom.runButton(i);
    else if (i.isModalSubmit() && (i.customId === "sb-link" || i.customId === "fc-link")) await cmds.submitLink(i);
    else if (i.isModalSubmit() && (i.customId === "sb-welcome" || i.customId === "fc-welcome")) await cmds.submitWelcome(i);
  } catch (e) {
    console.error("[Discord]", e.message);
    try { if (!i.replied && !i.deferred) await i.reply({ content: "Ocurrió un error inesperado.", flags: D.MessageFlags.Ephemeral }); } catch { /* la interacción ya caducó */ }
  }
}

// Servidores del bot con sus canales de texto en los que puede escribir y su bienvenida (para el panel web)
function guildList() {
  if (!client || !state.ready) return [];
  return [...client.guilds.cache.values()].map(g => {
    const me = g.members.me;
    return {
      id: g.id, name: g.name, members: g.memberCount,
      channels: [...g.channels.cache.values()].filter(c => (c.type === D.ChannelType.GuildText || c.type === D.ChannelType.GuildAnnouncement) && (!me || c.permissionsFor(me)?.has(["ViewChannel", "SendMessages"])))
        .sort((a, b) => a.rawPosition - b.rawPosition).map(c => ({ id: c.id, name: c.name })),
      can_roles: !!me?.permissions.has("ManageRoles"),
      categories: [...g.channels.cache.values()].filter(c => c.type === D.ChannelType.GuildCategory).sort((a, b) => a.rawPosition - b.rawPosition).map(c => ({ id: c.id, name: c.name })),
      all_roles: [...g.roles.cache.values()].filter(r => r.id !== g.id && !r.managed).sort((a, b) => b.position - a.position).map(r => ({ id: r.id, name: r.name })),
      tickets: cmds?.tickets?.info(g) || null,
      roles: [...g.roles.cache.values()].filter(r => !welcome.roleProblem(g, r)).sort((a, b) => b.position - a.position).map(r => ({ id: r.id, name: r.name })),
      welcome: welcome.config(g.id),
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

// Nombre del canal para mostrarlo en el panel de administración
async function channelName(id) {
  if (!id || !client || !state.ready) return null;
  const ch = client.channels.cache.get(id) || await client.channels.fetch(id).catch(() => null);
  return ch?.name || null;
}

const guildOf = id => client?.guilds.cache.get(String(id || "")) || null;
const tickets = () => cmds?.tickets || null;
module.exports = { start, state, channelName, guildList, guildOf, tickets, syncSlash, enabled: () => state.configured };
