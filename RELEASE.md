# Versión 2.18.0

Los comandos de SBScript pueden usar **menús de selección** y **formularios (modales)**, y el **agente de IA ya no se detiene a mitad de trabajo**: sigue hasta avisar de que ha terminado. Incluye correcciones de errores y opciones slash nuevas. No se ha quitado nada: los comandos de la 2.17.0 siguen funcionando igual.

## Menús de selección (nuevos tipos de componente)
- `$addSelect[id;textoGuía;mín;máx]` + `$addSelectOption[etiqueta;valor;descripción;emoji;marcada]`: menú de textos (hasta 25 opciones).
- `$addUserSelect`, `$addRoleSelect`, `$addMentionableSelect` y `$addChannelSelect` (este con filtro de tipos: `texto,voz,categoria,anuncios,escenario,foro`): lo elegido llega como IDs.
- Un menú ocupa una fila; un mensaje admite 5 filas entre botones y menús (con avisos claros si te pasas).
- `$clearSelects` y `$clearComponents` (quita botones y menús).
- Nuevo tipo de comando **Selección**: se ejecuta al elegir; su activador es el id del menú (exacto o «empieza así»). Lee la elección con `$selectValues[sep]`, `$selectValue[n]`, `$selectCount`, `$selectId`, `$selectArg[n]` e `$isSelect`. Admite `$updateMessage`.

## Formularios (modales)
- `$showModal[id;título]` abre un formulario y `$addTextInput[id;etiqueta;corto|largo;obligatorio;mín;máx;guía;valorInicial]` añade hasta 5 campos.
- Se abre desde un slash, un botón o un menú; debe ser la única respuesta del comando (no se pone «pensando» antes, así que no se mezcla con la IA).
- Nuevo tipo de comando **Formulario**: se ejecuta al enviarlo; lee los campos con `$modalValue[campo]`, `$modalId`, `$modalArg[n]` e `$isModal`. Si el formulario se abrió desde un botón o menú, puede editar ese mensaje con `$updateMessage`.
- Los selectores dentro de un formulario no se incluyen todavía (dependen de la versión de discord.js).

## Opciones slash
- Nuevos tipos `mentionable` (usuario o rol) y `attachment` (archivo adjunto: `$option` devuelve su URL).
- **Respuestas fijas** para opciones `string`, `integer` y `number`: `Elige color ~ rojo,azul,verde` en la descripción; Discord las muestra como lista.

## Agente de IA
- **No se detiene hasta terminar:** el agente trabaja hasta que escribe una marca interna de fin (`[[FIN]]`, que el usuario no ve; se explica en su prompt). Si responde sin herramientas y sin la marca, el sistema le pide que continúe (hasta 3 avisos seguidos). Si necesita una decisión del usuario, la pregunta y cierra también con la marca.
- Límites por mensaje ampliados: 40 pasos (antes 14), 60 escrituras (antes 25), 12 pruebas (antes 6) y 8 minutos. Si se alcanzan, el agente resume lo hecho y basta escribir «continúa».
- **Gasta menos:** cuando la conversación crece, los resultados y códigos antiguos se recortan automáticamente; sigue contando como **un solo uso** del límite de IA por mensaje.
- Conoce los tipos Selección y Formulario, las funciones nuevas y las opciones slash nuevas (también el generador de un solo paso).

## Correcciones
- Un comando slash o de mensaje que solo enviaba botones, menús o archivos (sin texto ni tarjeta) respondía solo «✓» en privado; ahora envía el mensaje.
- Los comandos de mensaje/prefijo que respondían solo con componentes se descartaban sin enviar nada.
- `$for` evaluaba sus argumentos a la vez (en paralelo); ahora lo hace en orden.
- Errores de validación más claros para botones, menús y formularios (ids repetidos, menús sin opciones, campos sin `$showModal`…).

## Editor y wiki
- Los tipos **Selección** y **Formulario** aparecen al crear y editar comandos (etiquetas `sel` y `frm`), con plantillas y campos de prueba propios: opciones separadas por coma para menús y `campo=texto|otro=texto` para formularios.
- La vista previa muestra los menús desplegables y cómo se vería el formulario.
- Nueva guía en la wiki: **Menús de selección y formularios (2.18.0)**, categoría nueva «Menús y formularios» con ejemplos de cada función, y la guía del agente actualizada.
