// Cliente LLM (API compatible con OpenAI: Grok, OpenAI/ChatGPT, Gemini y Ollama).
const { PROVIDERS, CLOUD, ALL, LLM_TIMEOUT } = require("./constants");
const { getConfig, usable } = require("./config");
const { cleanUrl, cleanModel, cleanKey } = require("./validate");

async function llm(c, messages, tools, timeout = LLM_TIMEOUT) {
  const P = PROVIDERS[c.provider]; // undefined si es Ollama
  const url = (P ? P.base : c.ollamaUrl.replace(/\/+$/, "") + "/v1") + "/chat/completions";
  const headers = { "Content-Type": "application/json" };
  if (P) headers.Authorization = "Bearer " + c.keys[c.provider];
  const body = { model: P ? c.models[c.provider] : c.ollamaModel, messages, stream: false };
  if (!P || P.temperature) body.temperature = 0.2; // los modelos GPT-5 de OpenAI no admiten otra temperatura que la de por defecto
  if (tools) { body.tools = tools; body.tool_choice = "auto"; }
  let r, txt;
  try { r = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(timeout) }); txt = await r.text(); }
  catch (e) { const err = Error(e.name === "TimeoutError" ? "El proveedor de IA tardó demasiado en responder" : "No se pudo conectar con el proveedor de IA"); err.detail = e.message + (e.cause?.message ? " - " + e.cause.message : ""); err.provider = true; throw err; }
  if (!r.ok) { const err = Error(`El proveedor de IA devolvió un error (${r.status})`); err.detail = txt.slice(0, 300); err.provider = true; throw err; }
  let m; try { m = JSON.parse(txt).choices[0].message; } catch { const err = Error("Respuesta inesperada del proveedor de IA"); err.detail = txt.slice(0, 300); err.provider = true; throw err; }
  return m;
}

// Igual que llm() pero con streaming (SSE): onText(delta) recibe el texto según llega y onTool(index, {id,name,chars}) avisa de cada llamada a herramienta en construcción.
// Devuelve el mismo mensaje final { content, tool_calls }. signal permite cancelar; idle = ms máximos sin recibir nada.
async function llmStream(c, messages, tools, { onText, onTool, signal, idle = 60000, total = 240000 } = {}) {
  const P = PROVIDERS[c.provider];
  const url = (P ? P.base : c.ollamaUrl.replace(/\/+$/, "") + "/v1") + "/chat/completions";
  const headers = { "Content-Type": "application/json" };
  if (P) headers.Authorization = "Bearer " + c.keys[c.provider];
  const body = { model: P ? c.models[c.provider] : c.ollamaModel, messages, stream: true };
  if (!P || P.temperature) body.temperature = 0.2;
  if (tools) { body.tools = tools; body.tool_choice = "auto"; }
  const ac = new AbortController(); let timer, why = "";
  const arm = ms => { clearTimeout(timer); timer = setTimeout(() => { why = "timeout"; ac.abort(); }, ms); };
  const onAbort = () => { why = why || "abort"; ac.abort(); }; signal?.addEventListener("abort", onAbort); if (signal?.aborted) onAbort();
  const fail = (msg, detail) => { const err = Error(msg); err.detail = detail; err.provider = true; return err; };
  const t0 = Date.now(); arm(idle);
  try {
    let r;
    try { r = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: ac.signal }); }
    catch (e) { if (why === "abort") throw Object.assign(Error("Cancelado"), { aborted: true }); throw fail(why === "timeout" ? "El proveedor de IA tardó demasiado en responder" : "No se pudo conectar con el proveedor de IA", e.message + (e.cause?.message ? " - " + e.cause.message : "")); }
    if (!r.ok) throw fail(`El proveedor de IA devolvió un error (${r.status})`, (await r.text().catch(() => "")).slice(0, 300));
    let content = "", calls = [];
    const feed = d => {
      if (!d) return;
      if (typeof d.content === "string" && d.content) { content += d.content; onText?.(d.content); }
      for (const tc of d.tool_calls || []) {
        const i = Number.isInteger(tc.index) ? tc.index : (tc.id || tc.function?.name ? calls.length : Math.max(0, calls.length - 1));
        const k = calls[i] ??= { id: "", type: "function", function: { name: "", arguments: "" } }, isNew = !k.function.name && !k._seen;
        if (tc.id) k.id = tc.id; if (tc.function?.name) k.function.name += tc.function.name;
        if (typeof tc.function?.arguments === "string") k.function.arguments += tc.function.arguments;
        if (k.function.name) { k._seen = true; onTool?.(i, { id: k.id, name: k.function.name, chars: k.function.arguments.length, first: isNew }); }
      }
    };
    if (!/event-stream/i.test(r.headers.get("content-type") || "")) { // el proveedor no hizo streaming: respuesta completa
      const txt = await r.text(); let m; try { m = JSON.parse(txt).choices[0].message; } catch { throw fail("Respuesta inesperada del proveedor de IA", txt.slice(0, 300)); }
      if (m.content) { content = String(m.content); onText?.(content); }
      calls = (m.tool_calls || []).map((k, i) => { onTool?.(i, { id: k.id, name: k.function?.name, chars: String(k.function?.arguments || "").length, first: true }); return k; });
    } else {
      const dec = new TextDecoder(); let buf = "";
      try {
        for await (const chunk of r.body) {
          arm(idle); if (Date.now() - t0 > total) { why = "timeout"; ac.abort(); }
          buf += dec.decode(chunk, { stream: true });
          let nl; while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
            if (!line.startsWith("data:")) continue; const data = line.slice(5).trim(); if (!data || data === "[DONE]") continue;
            let j; try { j = JSON.parse(data); } catch { continue; }
            if (j.error) throw fail("El proveedor de IA devolvió un error", JSON.stringify(j.error).slice(0, 300));
            feed(j.choices?.[0]?.delta);
          }
        }
      } catch (e) { if (e.provider) throw e; if (why === "abort") throw Object.assign(Error("Cancelado"), { aborted: true }); throw fail(why === "timeout" ? "El proveedor de IA tardó demasiado en responder" : "Se cortó la conexión con el proveedor de IA", e.message); }
    }
    calls = calls.filter(k => k && k.function?.name).map((k, i) => ({ id: k.id || "call_" + i, type: "function", function: { name: k.function.name, arguments: k.function.arguments } }));
    return { role: "assistant", content, tool_calls: calls.length ? calls : undefined };
  } finally { clearTimeout(timer); signal?.removeEventListener("abort", onAbort); }
}
// Prueba de conexión con la configuración indicada (o la guardada si no se pasan datos)
async function test(b = {}) {
  const c = { ...getConfig(), keys: { ...getConfig().keys }, models: { ...getConfig().models } };
  if (ALL.includes(b.provider)) {
    c.provider = b.provider;
    if (CLOUD.includes(b.provider)) { if (b.api_key) c.keys[b.provider] = cleanKey(b.api_key); c.models[b.provider] = cleanModel(b.model || c.models[b.provider]); }
    else { c.ollamaUrl = cleanUrl(b.url || c.ollamaUrl); c.ollamaModel = cleanModel(b.model || c.ollamaModel); }
  }
  if (!usable(c)) throw Error("La IA no está configurada");
  const m = await llm(c, [{ role: "user", content: "Responde solo con la palabra: ok" }], null, 30000);
  return String(m.content || "").slice(0, 80);
}

module.exports = { llm, llmStream, test };
