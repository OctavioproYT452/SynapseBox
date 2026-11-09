// Agente de IA: uso por los usuarios y configuración por el administrador.
const router = require("express").Router();
const { wrap } = require("../lib/utils");
const { need, needAdmin } = require("../middleware/auth");
const ai = require("../ai");

const needAI = (req, res, next) => ai.enabled() ? next() : res.status(404).json({ error: "No encontrado" }); // IA desactivada: la API no existe
router.get("/api/ai/status", need, needAI, (req, res) => res.json({ usage: ai.status(req.user) }));
router.post("/api/ai/chat", need, needAI, async (req, res) => {
  try { res.json(await ai.chat(req.user, req.body.messages)); }
  catch (e) { res.status(e.code || 400).json({ error: e.message }); }
});
// Agente del panel (2.17.5): streaming NDJSON (una línea JSON por evento). Cada mensaje gasta un uso del límite.
router.post("/api/ai/agent", need, needAI, async (req, res) => {
  res.writeHead(200, { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no", Connection: "keep-alive" });
  const ac = new AbortController(); res.on("close", () => { if (!res.writableEnded) ac.abort(); });
  const emit = ev => { if (!res.writableEnded && !res.destroyed) res.write(JSON.stringify(ev) + "\n"); };
  const b = req.body || {};
  try { await ai.agent.run(req.user, { messages: b.messages, context: b.context, signal: ac.signal, emit }); }
  catch (e) { if (!e.aborted) emit({ type: "error", message: e.message }); }
  if (!res.writableEnded) res.end();
});
router.get("/api/admin/ai", needAdmin, (req, res) => res.json(ai.publicConfig()));
router.post("/api/admin/ai", needAdmin, wrap(async (req, res) => { ai.save(req.body || {}); res.json({ success: true, ...ai.publicConfig() }); }));
router.post("/api/admin/ai/test", needAdmin, async (req, res) => {
  try { res.json({ ok: true, reply: await ai.test(req.body || {}) }); }
  catch (e) { res.status(400).json({ error: e.message + (e.detail ? " (" + e.detail + ")" : "") }); }
});
module.exports = router;
