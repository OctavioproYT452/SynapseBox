// Comandos propios del bot de Discord: API del editor web (solo administradores).
const router = require("express").Router();
const { wrap } = require("../lib/utils");
const { needAdmin } = require("../middleware/auth");
const dc = require("../discord");
const custom = require("../discord/custom");
const store = require("../discord/store");
const logger = require("../discord/logger");
const updates = require("../discord/updates");

const log = (req, t) => logger.log("admin", `**${logger.md(req.user.username)}** *(admin, por la web)* ${t}`);

router.get("/api/admin/discord/cmds", needAdmin, wrap(async (req, res) => {
  res.json({ ...custom.list(), prefix: custom.prefix(), limits: custom.limits, types: custom.OPT_TYPES, access: custom.ACCESS, match: custom.MATCH, bot: { ready: dc.state.ready, content: dc.state.content, configured: dc.state.configured } });
}));
router.get("/api/admin/discord/cmds/get", needAdmin, wrap(async (req, res) => res.json(custom.read(String(req.query.id || "")))));
router.get("/api/admin/discord/script/wiki", needAdmin, (req, res) => {
  const w = require("../discord/script/wiki");
  res.json({ guides: w.GUIDES, cats: w.CATS, news: w.NEW, version: require("../version").info().current, functions: custom.docs().map(d => ({ ...d, ex: w.EXAMPLES[d.n] || null })) });
});
router.get("/api/admin/discord/script/docs", needAdmin, (req, res) => res.json(custom.docs()));

router.post("/api/admin/discord/cmds/save", needAdmin, wrap(async (req, res) => {
  const b = req.body || {}, r = custom.save({ id: b.id ? String(b.id) : null, folder: b.folder, name: b.name, meta: b.meta, code: b.code });
  log(req, `${b.id ? "guardó" : "creó"} el comando propio **${logger.md(r.id)}**`);
  res.json({ success: true, ...r });
}));
// Crear o modificar un comando con IA (la IA lee toda la wiki). No guarda nada: devuelve el código para revisarlo en el editor.
router.post("/api/admin/discord/cmds/ai", needAdmin, wrap(async (req, res) => {
  const ai = require("../ai"); if (!ai.enabled()) throw Error("La IA no está activada: configúrala en el panel de administración");
  const b = req.body || {}, cur = b.current && typeof b.current === "object" ? { name: String(b.current.name || ""), meta: b.current.meta || {}, code: String(b.current.code || "") } : null;
  const r = await require("../discord/script/aigen").generate(req.user, { instructions: b.instructions, current: cur, tipo: ["slash", "prefijo", "mensaje"].includes(b.tipo) ? b.tipo : "" });
  log(req, `usó la IA para ${cur ? "modificar" : "crear"} un comando propio (**${logger.md(r.name)}**)`);
  res.json(r);
}));
// Agente de IA del editor (2.17.0): chat en streaming (una línea JSON por evento) que lee, crea, edita, prueba y revisa varios comandos con un solo mensaje.
router.post("/api/admin/discord/cmds/agent", needAdmin, async (req, res) => {
  const ai = require("../ai"); if (!ai.enabled()) return res.status(404).json({ error: "La IA no está activada: configúrala en el panel de administración" });
  res.writeHead(200, { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no", Connection: "keep-alive" });
  const ac = new AbortController(); res.on("close", () => { if (!res.writableEnded) ac.abort(); });
  const emit = ev => { if (!res.writableEnded && !res.destroyed) res.write(JSON.stringify(ev) + "\n"); };
  const b = req.body || {}; let r = null;
  try { r = await require("../discord/script/agent").run(req.user, { messages: b.messages, current: b.current, runId: b.runId, signal: ac.signal, emit }); }
  catch (e) { if (!e.aborted) emit({ type: "error", message: e.message }); }
  if (r?.changes.length) log(req, `usó el agente de IA y cambió ${r.touched.length} comando(s) propio(s): **${logger.md(r.touched.slice(0, 5).join(", "))}**`);
  if (!res.writableEnded) res.end();
});
router.post("/api/admin/discord/cmds/agent/undo", needAdmin, wrap(async (req, res) => {
  const r = require("../discord/script/agent").undo(req.user, req.body?.runId); log(req, `deshizo los cambios del agente de IA (${r.ids.length} comando(s))`); res.json({ success: true, ...r });
}));
router.post("/api/admin/discord/cmds/delete", needAdmin, wrap(async (req, res) => {
  const id = String(req.body?.id || ""); custom.remove(id); log(req, `borró el comando propio **${logger.md(id)}**`); res.json({ success: true });
}));
router.post("/api/admin/discord/cmds/check", needAdmin, wrap(async (req, res) => res.json({ errors: custom.checkCode(req.body?.code, req.body?.meta) })));
router.post("/api/admin/discord/cmds/test", needAdmin, wrap(async (req, res) => {
  const b = req.body || {}; res.json(await custom.dry(b.code, b.meta, { args: b.args, options: b.options || {}, sb: req.user }));
}));
router.post("/api/admin/discord/folders", needAdmin, wrap(async (req, res) => {
  const b = req.body || {}; custom.folder(String(b.action), String(b.path || ""), b.to, !!b.force);
  log(req, `${{ create: "creó", rename: "renombró", delete: "borró" }[b.action] || "cambió"} la carpeta de comandos **${logger.md(b.path)}**`); res.json({ success: true });
}));
router.post("/api/admin/discord/prefix", needAdmin, wrap(async (req, res) => { custom.setPrefix(req.body?.prefix); res.json({ success: true, prefix: custom.prefix() }); }));

// Canales de registros y de actualizaciones, elegidos desde la web (igual que /config en Discord)
router.post("/api/admin/discord/update-notice", needAdmin, wrap(async (req, res) => {
  const v = await updates.notify(req.user.username);
  log(req, `envió el aviso de actualización (${v}) al canal de actualizaciones`); res.json({ success: true, version: v });
}));
router.post("/api/admin/discord/channel", needAdmin, wrap(async (req, res) => {
  const w = req.body?.which === "update" ? "update" : req.body?.which === "log" ? "log" : null, cid = String(req.body?.channel_id || "");
  if (!w) throw Error("Canal inválido");
  if (!cid) { store.setChannel(w, null); return res.json({ success: true }); }
  if (!dc.state.ready) throw Error("El bot no está conectado");
  if (!dc.guildList().some(g => g.channels.some(c => c.id === cid))) throw Error("Ese canal no existe o el bot no puede escribir en él");
  await logger.sendTo(cid, { embeds: [{ color: 0x2ecc71, title: w === "log" ? "Canal de registros configurado" : "Canal de actualizaciones configurado", description: `Configurado por ${logger.md(req.user.username)} desde la web.`, footer: { text: "SynapseBox" } }] }).catch(e => { throw Error("El bot no puede escribir en ese canal: " + e.message); });
  store.setChannel(w, cid); if (w === "update") updates.announce().catch(() => { });
  log(req, `configuró el canal de ${w === "log" ? "registros" : "actualizaciones"}`); res.json({ success: true });
}));

module.exports = router;
