# Versión 2.18.5

El agente de IA del panel de archivos (el que ve tus archivos y los organiza) pasa a ser un **agente de verdad**: trabaja en streaming, encadena muchos pasos con un solo mensaje, tiene muchas más herramientas y también puede **crear y aplicar temas** guardándolos en «Mis temas». No se ha quitado nada.

## Agente de archivos (botón «Asistente IA» o `Ctrl+Mayús+I`)
- **Streaming en directo:** el texto aparece según se escribe y cada herramienta es una tarjeta (preparando → ejecutando → hecho / error) que se puede abrir para ver el resultado. Botón **Detener** (lo ya hecho se mantiene).
- **No se detiene hasta acabar:** hasta 30 pasos y 10 herramientas por paso con **un solo uso** del límite de IA por mensaje. Si el proveedor falla antes de responder, el uso se devuelve.
- **Varios archivos a la vez:** `create_files`, `move_items`, `delete_items` (a la papelera), `read_files`.
- **Editar sin reescribir:** `edit_file` con reemplazos exactos (falla sin cambiar nada si el texto no coincide) y `append_file`.
- **Encontrar y entender:** `tree`, `search_files` (nombre con `*`, extensión, tamaño, antigüedad), `grep_files` (dentro del contenido), `file_info`.
- **Limpieza y orden:** `organize_folder` (por tipo, extensión o año, con vista previa), `storage_report` (uso, tipos, carpetas y archivos más grandes, antiguos, papelera), `find_duplicates` (por contenido; nunca borra solo).
- **Papelera y favoritos:** `list_trash`, `restore_trash`, `list_favorites`, `set_favorite`.
- **Temas:** `list_themes`, `save_theme` (parte del tema actual o de otro guardado, crea SIEMPRE un tema nuevo en Apariencia → Mis temas, nunca pisa uno existente, lo aplica al instante y avisa si el contraste es malo) y `apply_theme`. Fondos y botones solo con archivos de tu carpeta «Temas».
- **Contexto del panel:** sabe qué carpeta tienes abierta y qué has seleccionado («organiza esta carpeta»). Casilla para desactivarlo y botón **Preguntar a la IA** en la barra de selección.
- **Diseño nuevo del chat:** markdown, sugerencias rápidas, indicador de uso, ir al final, pantalla completa en móvil y `prefers-reduced-motion`.
- **Seguridad:** sigue confinado a la carpeta del usuario (sin enlaces simbólicos, sin `..`), sin ejecutar nada, archivos siempre 0644, cuota respetada y contenido de los archivos tratado como datos, no como órdenes.

## API
- `POST /api/ai/agent` — respuesta NDJSON (una línea JSON por evento: `text`, `tool_prep`, `tool_prog`, `tool_start`, `tool_end`, `changed`, `theme`, `done`, `error`). Cuerpo: `{ messages, context: { cwd, selected } }`.
- `POST /api/ai/chat` sigue funcionando (sin streaming) y ahora usa las mismas herramientas.

## Interno
- `src/ai/agent.js` (agente en streaming), `src/ai/tools.js` (de 7 a 27 herramientas), `src/services/themes.js` (`checkMedia`, `saveNamedTheme`, `applyUserTheme`), `public/js/ai.js` y estilos en `public/style.css`.
