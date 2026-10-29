// Agente de IA de SynapseBox (Grok de xAI, OpenAI/ChatGPT, Google Gemini u Ollama).
// - La configuración vive en la tabla "settings" de la base de datos y se lee al iniciar el servidor (init / reload).
// - El agente SOLO puede tocar la carpeta del usuario que lo usa: listar, leer, crear carpetas/archivos, mover, copiar y borrar.
//   No existe ninguna herramienta para ejecutar nada: los archivos que crea son datos (modo 0644, nunca ejecutables).
const { reload, enabled, describe, save, publicConfig } = require("./config");
const { status, usedBy, limitFor, purge } = require("./limits");
const { test, llmStream } = require("./llm");
const { chat } = require("./chat");
const { ask, session, begin } = require("./ask");
const { IMPL } = require("./tools");
const { PROVIDERS, CLOUD, DEF } = require("./constants");

module.exports = { init: reload, reload, enabled, describe, save, publicConfig, test, llmStream, getConfig: require("./config").getConfig, chat, ask, session, begin, status, usedBy, limitFor, purge, PROVIDERS, CLOUD, DEF, _impl: IMPL };
