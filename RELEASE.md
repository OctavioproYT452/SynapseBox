# Versión 2.16.5

41 funciones nuevas de SBScript (con ejemplos en la wiki y conocidas por la IA del editor), un bug corregido y mejoras de robustez y accesibilidad. No se ha quitado nada.

## Nuevas funciones de SBScript (2.16.5)
- **Elegir sin bloques:** `$ternary`, `$switch`, `$coalesce`, `$inRange`, `$isOneOf`, `$not`.
- **Texto:** `$wrapText`, `$sentenceCase`, `$maskText`, `$mockText`, `$lineAt`, `$center`, `$removeEmojis`, `$leetSpeak`, `$caesar`, `$morse`, `$fromMorse`, `$hexToRgb`, `$rgbToHex`.
- **Matemáticas:** `$percentOf`, `$discount`, `$roundTo`, `$mapRange`, `$isEven`, `$isOdd`, `$digitSum`, `$simplifyFraction`, `$rollDice` (p. ej. `2d6+3`) y `$convertUnit` (longitud, masa, volumen, velocidad, datos y temperatura).
- **Tiempo:** `$parseDuration` («1h30m», «2 días»), `$addTime`, `$age`, `$dayOfYear`, `$weekNumber`, `$startOfDay`, `$snowflakeTime` (fecha de creación de cualquier ID de Discord) y `$countdown`.
- **JSON:** `$jsonArrayContains`, `$jsonArrayFirst`, `$jsonArrayLast` y `$jsonGetOr`.
- La wiki marca las nuevas con «Nuevo», tiene la guía **Utilidades y atajos (2.16.5)** y la IA del editor ya las usa (y prefiere `$ternary`/`$switch` a los `$if` largos).

## Corrección
- `$mode` convertía los valores vacíos en números (por ejemplo `$mode[;a;a]`). Ahora los trata como texto vacío.

## Mejoras
- **Robustez:** un error sin gestionar en un plugin o en el bot de Discord ya no tumba el servidor (se avisa en la consola); los errores internos (500) quedan registrados en la consola; aviso claro si el puerto está ocupado; cierre ordenado con `SIGTERM`/`Ctrl+C`.
- **Rendimiento:** los archivos de `/vendor` (visor de PDF, JSZip…) se guardan 7 días en la caché del navegador.
- **Monitorización:** nuevo `GET /api/health` (sin sesión) que responde `{"ok":true}`.
- **Accesibilidad y diseño:** contorno visible al navegar con teclado y menos movimiento si el sistema lo pide (`prefers-reduced-motion`) en toda la web.
