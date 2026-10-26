# Versión 2.16.0

Sandbox de archivos más estricto y más funciones para SBScript.

## Seguridad
- **Sandbox de usuarios:** `safe()` (la comprobación central de rutas que usan archivos, subidas, compartir, colaboración, papelera, WebDAV y la IA) ahora, además de rechazar `..` y rutas absolutas, **resuelve los enlaces simbólicos en disco** y rechaza cualquier ruta cuyo destino real quede fuera de la carpeta raíz del usuario. También rechaza caracteres de control y rutas de más de 4096 caracteres.
- **Descomprimir ZIP:** además de lo que ya hacía (rutas con `..`, absolutas, enlaces simbólicos omitidos, bombas de compresión, CRC), ahora rechaza rutas `//`, caracteres de control, más de 64 niveles de carpetas y nombres de más de 255 caracteres, y comprueba en disco que cada carpeta creada sigue dentro del destino.
- Los nombres de archivo con caracteres de control ya no se aceptan.
- Probado con enlaces simbólicos hacia fuera, `../`, ZIP con `../../`, rutas absolutas y entradas que son enlaces.

## Nuevas funciones (37)
- **Formato de Discord:** `$bold`, `$italic`, `$underline`, `$strike`, `$spoiler`, `$quote`, `$inlineCode`, `$codeBlock`, `$hyperlink`, `$stripMarkdown`.
- **Texto:** `$swapCase`, `$kebabCase`, `$pascalCase`, `$extractNumbers`, `$longestWord`, `$vowelCount`, `$isUrl`, `$isEmail`, `$domain`.
- **Matemáticas:** `$cbrt`, `$hypot`, `$sin`, `$cos`, `$tan`, `$mode`, `$variance`, `$distance`, `$percentChange`, `$celsiusToFahrenheit`, `$fahrenheitToCelsius`.
- **Tiempo:** `$timestampCode` (devuelve el código de hora de Discord de ahora, p. ej. `<t:1700000000:R>`, para usarlo donde quieras; a diferencia de `$timestamp`, no pone la fecha en el embed), `$addDays`, `$isWeekend`, `$quarter`.
- **JSON:** `$jsonArrayRandom`, `$jsonArrayShuffle`, `$jsonArrayFlat`.
- La wiki (y la wiki de la IA del editor) incluye ejemplo y marca «Nuevo» para cada una.

## Compatibilidad
- Sin cambios en la base de datos, los plugins ni los comandos guardados.
- Si algún día enlazas a mano una carpeta de usuario con un enlace simbólico, el destino debe seguir dentro de esa misma carpeta; los que apuntan fuera dejan de funcionar (es lo que se busca).
- La carpeta `data/` del paquete solo lleva `version.json`.

## Archivos modificados
- `src/lib/paths.js`, `src/lib/unzip.js`, `src/discord/script/functions.js`, `src/discord/script/httpjson.js`, `src/discord/script/wiki.js`
- `README.md`, `RELEASE.md`, `package.json`, `data/version.json`
