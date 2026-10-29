# Versión 2.17.0

Nuevo **agente de IA** en el editor de comandos de SBScript: un chat en streaming, parecido al de Claude, que ve tus comandos como archivos y puede crearlos, editarlos, leerlos, probarlos y revisarlos, varios a la vez con un solo mensaje. Además, el editor se ha rediseñado para convivir con el chat. No se ha quitado nada: el generador de un solo paso sigue disponible en la API.

## Agente de IA (botón ✨ IA, o `Ctrl+Mayús+I`)
- **Streaming en directo:** el texto aparece según se escribe y cada herramienta que usa es una tarjeta que se va completando (preparando → ejecutando → hecho / con errores), con el diff de los cambios y accesos directos para abrir cada comando.
- **Los comandos son archivos:** herramientas para listar, leer (varios a la vez), buscar (como grep), crear, editar con reemplazos exactos, reescribir, mover, borrar, **revisar la sintaxis**, **probar** (simulación, no toca Discord) y consultar la wiki.
- **Varios comandos con un solo mensaje:** encadena hasta 14 pasos y 25 escrituras por mensaje (por ejemplo, un panel con botones y los comandos de botón que lo hacen funcionar).
- **Se corrige sola:** cada escritura devuelve los errores del analizador y el agente los arregla antes de responder.
- **Cambios reales y reversibles:** lo que crea o edita se guarda en el servidor, la lista y el editor se actualizan al momento y cada respuesta trae un botón **Deshacer** (disponible dos horas, también tras pulsar **Detener**). Si hay cambios sin guardar en el comando abierto, no se pisan: se avisa.
- **Contexto del editor:** con «Comando abierto» marcado, el agente conoce el comando que editas y tu borrador sin guardar.
- **Gasta mucho menos:** un uso del límite de IA por mensaje y unos 2 500 tokens de instrucciones (reglas + índice de nombres de funciones) en lugar de ~22 000; los detalles y ejemplos de la wiki los pide solo cuando los necesita. La conversación solo reenvía texto, no los resultados de las herramientas.
- **Seguridad:** solo administradores; solo toca comandos de SBScript (nunca archivos del servidor); las pruebas son simulaciones; el contenido de los comandos se trata como datos, no como órdenes.
- Nueva guía en la wiki: **Agente de IA del editor (2.17.0)**.

## Diseño del editor
- Tres columnas (comandos · editor · agente) con el ancho del chat **ajustable arrastrando** el borde (se recuerda).
- Con el chat abierto, la barra del editor se compacta y el panel de funciones pasa a superponerse para que el código tenga sitio; en pantallas medianas la lista de comandos se convierte en un cajón lateral.
- En móvil el agente ocupa toda la pantalla, con el teclado y la zona segura del iPhone respetados.
- Botón **✨ IA** también en la barra del editor y en la pantalla de inicio; respeta `prefers-reduced-motion`.

## API
- `POST /api/admin/discord/cmds/agent` — respuesta en NDJSON (una línea JSON por evento: `text`, `tool_prep`, `tool_prog`, `tool_start`, `tool_end`, `changed`, `done`, `error`).
- `POST /api/admin/discord/cmds/agent/undo` — `{ "runId": "…" }` restaura los comandos tocados por esa ejecución.

## Interno
- `src/ai/llm.js`: nuevo `llmStream` (SSE de la API compatible con OpenAI; funciona con Grok, OpenAI, Gemini y Ollama, y vuelve a la respuesta completa si el proveedor no hace streaming).
- `src/ai/ask.js`: `begin()` abre un uso del límite y lo devuelve si el proveedor falla antes de responder.
- `src/discord/script/agent.js` (agente) y `public/js/dc-ai.js` + `public/dc-ai.css` (chat).
