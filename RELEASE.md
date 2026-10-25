# Versión 2.15.3

Más funciones para SBScript, renombrado `fc` → `sb` y editor de comandos rediseñado.

## Novedades
- **Nuevas funciones (59):**
  - JSON: `$jsonArrayCount` ahora, **sin claves, devuelve cuántas listas hay en todo el JSON** cargado con `$jsonParse` (las anidadas también cuentan; con una clave sigue dando los elementos de esa lista), `$jsonObjectCount`, `$jsonLength`, `$jsonKeys`, `$jsonType`, `$jsonArrayUnique`, `$jsonArrayRemove`, `$jsonArraySum`.
  - Texto: `$removeAccents`, `$between`, `$charAt`, `$wordAt`, `$isEmpty`, `$replaceFirst`, `$base64Encode`, `$base64Decode`, `$urlDecode`.
  - Matemáticas: `$sqrt`, `$power`, `$mod`, `$isNumber`, `$range`, `$lerp`, `$gcd`, `$lcm`, `$factorial`, `$isPrime`, `$fibonacci`, `$log`, `$sign`, `$trunc`, `$randomFloat`, `$stdDev`, `$toBase`, `$fromBase`, `$roman`, `$ordinal`, `$bytes`.
  - Más texto: `$left`, `$right`, `$lastIndexOf`, `$containsAny`, `$containsAll`, `$equalsIgnoreCase`, `$camelCase`, `$snakeCase`, `$reverseWords`, `$escapeMarkdown`, `$rot13`, `$countLetters`, `$uuid`.
  - Tiempo: `$isLeapYear`, `$daysInMonth`.
  - Más JSON: `$jsonArrayMax`, `$jsonArrayMin`, `$jsonArrayAverage`, `$jsonArrayInsert`, `$jsonArraySlice`, `$jsonValues`, `$jsonMerge`.
- **Renombrado `fc` → `sb`:** `$isFcAdmin` pasa a `$isSbAdmin`; internamente los botones usan `sbs:`, los modales `sb-…` y los comandos se guardan como `.sbs`. Los nombres antiguos (`$isFcAdmin`, `$fcUser`…, botones `fcs:`, archivos `.fcs`, modales `fc-…`) **siguen funcionando**.
- **Editor rediseñado:** nuevo estilo (barra lateral, pestaña del comando, panel de propiedades, panel de funciones, panel de problemas/pruebas y barras de desplazamiento), línea actual resaltada, autocompletado que se abre hacia arriba si no cabe, atajos (**Tab / Mayús+Tab**, **Ctrl+/**, **Ctrl+Enter**), sangría automática en `$if`/`$for`/`$while` y barra de símbolos en móvil.
- **Errores del editor corregidos:** el panel de funciones heredaba márgenes de la wiki; escribir `\[` ya no añade un `]` de más (necesario para JSON); el tamaño y la altura de línea del código eran fijos (ahora son variables y el autocompletado y los saltos a errores se calculan con ellas); el teclado de iOS hacía zoom al escribir; el panel de propiedades ocupaba media pantalla en móvil (ahora empieza plegado).
- **Wiki y wiki de la IA:** las funciones nuevas llevan ejemplo y la marca «Nuevo»; la IA del editor las conoce automáticamente.

## Compatibilidad
- La carpeta `data/` de este paquete solo lleva `version.json`: no incluye bases de datos, así que copiarlo a tu servidor no sustituye tu `synapsebox.db`.
- Sin cambios en el servidor, la base de datos ni los plugins. Las cookies (`fc_sid`), claves del navegador y variables de entorno se mantienen para no cerrar sesiones ni romper instalaciones.

## Archivos modificados
- `src/discord/script/functions.js`, `src/discord/script/httpjson.js`, `src/discord/script/wiki.js`, `src/discord/custom.js`, `src/discord/index.js`, `src/discord/commands.js`, `src/routes/discord-custom.js`
- `public/js/dc-editor.js`, `public/dc-editor.css`
- `README.md`, `RELEASE.md`, `package.json`, `data/version.json`
