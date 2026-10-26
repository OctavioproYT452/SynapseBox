# Versión 2.16.2

Corrección de errores, funciones equivalentes a BDFD para SBScript y «Propiedades» en el panel de archivos.

## Errores corregidos
- **Botones y modales de Discord:** en `src/discord/index.js` una condición mal agrupada (`A && B || C`) hacía que cualquier interacción cuyo id empezara por `sbs:` se tratara como botón aunque no lo fuera. Ahora solo se tratan como botón los botones con id `fcs:` o `sbs:`.
- **Wiki de SBScript:** los 8 ejemplos que faltaban (`$median`, `$coinFlip`, `$average`, `$dice`, `$isPalindrome`, `$initials`, `$daysUntil`, `$weekday`) ya están y se comprobaron uno a uno; el resto de ejemplos se ejecutaron en seco y los únicos que no corren fuera de Discord son los que necesitan un usuario o la IA.
- Revisadas las rutas de archivos, el descompresor y el guardado de comandos `.sbs`/`.fcs` tras los cambios de las versiones anteriores: sin más fallos.

## Nuevas funciones de SBScript (28, equivalentes de BDFD)
- **Texto:** `$replaceText[texto;buscar;nuevo;veces]`, `$cropText`, `$charCount`, `$byteCount`, `$numberSeparator`, `$checkContains`, `$randomText`.
- **Lógica:** `$checkCondition[condición]`.
- **Matemáticas:** `$sub`, `$multi`, `$divide`, `$modulo`, `$isInteger`, `$isValidHex`.
- **Lista de partes (como en BDFD):** `$textSplit`, `$splitText`, `$getTextSplitLength`, `$joinSplitText`, `$editSplitText`, `$removeSplitTextElement`.
- **Tiempo:** `$year`, `$month`, `$day`, `$hour`, `$minute`, `$second` (UTC o una zona, p. ej. `$hour[Europe/Madrid]`), `$dateStamp`, `$getTimestamp`.
- **Nombres de BDFD aceptados** para funciones que ya existían: `$toLowercase`, `$toUppercase`, `$toTitleCase`, `$trimSpace`, `$authorID`, `$authorAvatar`, `$membersCount`, `$guildID`.
- La wiki (y la de la IA del editor) tiene ejemplo y marca «Nuevo» para cada una, y un consejo para quien viene de BDFD.

## Panel de usuarios
- **Propiedades:** nueva opción en el menú de cada archivo o carpeta con tipo, tamaño (en carpetas, el total y cuántos elementos), ubicación, fechas de modificación y creación y huella **SHA-256** de archivos de hasta 500 MB (botón «Calcular» y «Copiar»). Usa la ruta nueva `GET /api/file-info` y respeta el sandbox y los permisos de las carpetas compartidas.

## Compatibilidad
- Sin cambios en la base de datos ni en los plugins. Los comandos existentes siguen igual; solo ten en cuenta que `$year`, `$month`, `$day`, `$hour`, `$minute` y `$second` ahora son funciones.
- `data/` solo lleva `version.json`.

## Archivos modificados
- `src/discord/index.js`, `src/discord/script/functions.js`, `src/discord/script/wiki.js`, `src/routes/files.js`
- `public/js/panel.js`, `public/codeview.css`
- `README.md`, `RELEASE.md`, `package.json`, `data/version.json`
