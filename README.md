<div align="center">

# SynapseBox

**Tu propia nube de archivos, ligera y autoalojada.**
Sube, organiza, edita y comparte archivos desde cualquier dispositivo, con usuarios, cuotas de espacio y un panel de administración.

![Node](https://img.shields.io/badge/Node.js-%E2%89%A518-339933?logo=node.js&logoColor=white)
![SQLite](https://img.shields.io/badge/Base%20de%20datos-SQLite-003B57?logo=sqlite&logoColor=white)
![License](https://img.shields.io/badge/Licencia-MIT-blue)

</div>

> **Versión 2.16.1.** Qué ha cambiado en esta versión: consulta [RELEASE.md](RELEASE.md).

---

## Índice

1. [Características](#características)
2. [Requisitos](#requisitos)
3. [Instalación](#instalación)
4. [Primer arranque](#primer-arranque)
5. [Configuración](#configuración)
6. [Guía de uso](#guía-de-uso)
7. [Temas y personalización](#temas-y-personalización)
8. [Panel de administración](#panel-de-administración)
   - Relacionado: [Plugins](#plugins)
   - Relacionado: [Visor de documentos](#visor-de-documentos) y [Acceso WebDAV](#acceso-webdav)
9. [Agente de IA (opcional)](#agente-de-ia-opcional)
10. [Bot de Discord (opcional)](#bot-de-discord-opcional)
11. [Seguridad](#seguridad)
12. [Estructura del proyecto](#estructura-del-proyecto)
13. [API](#api)
14. [Despliegue en producción](#despliegue-en-producción)
15. [Copias de seguridad](#copias-de-seguridad)
16. [Migrar desde la versión 1](#migrar-desde-la-versión-1)
17. [Solución de problemas](#solución-de-problemas)
18. [Créditos](#créditos)
19. [Licencia](#licencia)

## Características

**Para los usuarios**

- Subida de archivos y **carpetas completas**, con barra de progreso y arrastrar y soltar.
- Explorador con vista de cuadrícula o lista, orden por nombre, fecha o tamaño y filtro instantáneo.
- **Búsqueda en todas tus carpetas**, **favoritos** y **archivos recientes**.
- Vista previa de imágenes, vídeo, audio, **PDF** y texto, **visor de documentos de Office** (doc, docx, xls, xlsx, ppt, pptx…) y editor integrado para archivos de texto y código.
- **Acceso WebDAV** opcional por usuario: monta tu carpeta como unidad de red con una clave aleatoria que tú generas.
- Renombrar, mover, **duplicar** y eliminar, también en **selección múltiple**.
- **Descarga en ZIP** de carpetas o de una selección de elementos.
- **Comprimir en ZIP** (el archivo se guarda en la misma carpeta, dentro de tu espacio) y **descomprimir** un `.zip` en una carpeta nueva, desde el menú de cada elemento o en selección múltiple.
- **Fondo con imagen, GIF o vídeo** y botones con imagen o GIF en los temas.
- **Enlaces para compartir** con caducidad, **contraseña opcional**, revocables en cualquier momento y con descarga de carpetas en ZIP.
- **Carpetas colaborativas**: comparte una carpeta con otros usuarios por su UUID y asigna a cada uno un rol (solo lectura, edición, creación o permisos totales).
- **Limpieza de espacio** (archivos grandes y duplicados) y **papelera de reciclaje** con restauración.
- Cuota de almacenamiento por usuario con desglose por tipo (imágenes, vídeo, audio, documentos y otros).
- **12 temas** y personalización completa (colores con selector o código hex, tipografía, redondeo y densidad), con **temas propios que se pueden exportar e importar como JSON** y una **comunidad de temas** para compartirlos con los demás usuarios del servidor.
- Atajos de teclado: `/` filtra, `Supr` elimina la selección, `Ctrl+A` selecciona todo, `Esc` sale de la selección.
- **Menú de usuario** ordenado por secciones (*Mis archivos*, *Personalización*, *Mi cuenta*): desplegable en escritorio y panel lateral (hamburguesa) en móvil.
- **Perfil** con tarjetas separadas: almacenamiento, datos de acceso, seguridad y sesiones.
- **Verificación en dos pasos (2FA/TOTP)** opcional para cada cuenta y **códigos de recuperación** para volver a entrar si olvidas el usuario o la contraseña.
- Inicio de sesión animado (todo por código, sin imágenes) con fondo ligero que se adapta al dispositivo y respeta `prefers-reduced-motion`.
- Diseño responsivo: barra superior completa en pantallas grandes y panel lateral en móvil.

**Para el administrador**

- Resumen con CPU, memoria y disco en vivo.
- Gestión de usuarios: crear, cambiar cuota y rol, suspender, restablecer contraseña, cerrar sesiones y eliminar.
- Explorador de los archivos de cualquier usuario.
- Listado y revocación de todos los enlaces compartidos.
- Ajustes: registro público, cuota por defecto y **anuncio** visible para todos los usuarios.
- **Bot de Discord opcional** (con un token en `.env`): vincula cuentas, registra la actividad y avisa de las actualizaciones en tus canales, y ofrece comandos para usuarios y administradores. Ver [Bot de Discord](#bot-de-discord-opcional).

**Técnicas**

- Base de datos **SQLite** local, sin servidor externo.
- Contraseñas con `scrypt`, sesiones en base de datos, 2FA (TOTP) opcional y protección contra fuerza bruta.
- **Sin registros de actividad en el servidor**, para no consumir disco ni memoria (si activas el bot de Discord, la actividad se envía a Discord sin guardarse aquí).
- **Plugins en Node.js** (2.15): cambian iconos, imágenes, funciones y comportamiento; se activan y desactivan desde el admin y se comparten en un repositorio de GitHub.
- Iconos SVG propios, sin librerías de iconos ni de interfaz externas.

## Requisitos

- [Node.js](https://nodejs.org) **18 o superior** (recomendado 22.13 o superior).
- npm.

La base de datos usa `node:sqlite` si tu Node lo incluye (22.13 o superior) y `better-sqlite3` en caso contrario. `better-sqlite3` se instala automáticamente como dependencia opcional; en algunos sistemas necesita herramientas de compilación si no hay binario precompilado.

## Instalación

### Opción 1: instalación en una línea

**Linux y macOS** (instala git y Node.js si faltan, clona el repositorio y ejecuta el instalador):

```bash
curl -fsSL https://raw.githubusercontent.com/OctavioproYT452/SynapseBox/HEAD/get.sh | bash
```

**Windows** (PowerShell):

```powershell
irm https://raw.githubusercontent.com/OctavioproYT452/SynapseBox/HEAD/get.ps1 | iex
```

Se instala en `~/SynapseBox` (Linux/macOS) o `%USERPROFILE%\SynapseBox` (Windows). Variables opcionales:

| Variable | Descripción |
| --- | --- |
| `SYNAPSEBOX_DIR` | Carpeta de destino. |
| `SYNAPSEBOX_REPO` | URL del repositorio (para usar un _fork_). |
| `SYNAPSEBOX_START=1` | (Linux/macOS) arranca el servidor al terminar. |

Si ya existe la carpeta de destino como repositorio, se actualiza con `git pull`.

### Opción 2: clonar y ejecutar el instalador

```bash
git clone https://github.com/OctavioproYT452/SynapseBox.git
cd SynapseBox
bash scripts/unix/install.sh        # Linux y macOS
```

En Windows, haz doble clic en `scripts\windows\install.bat` o ejecuta `.\scripts\windows\install.ps1` en PowerShell.

Los instaladores detectan el sistema (apt, dnf/yum, pacman, zypper, apk, Homebrew, winget o Chocolatey), instalan Node.js y npm si no están, y ejecutan `npm install`. En Linux instalan Node.js 22 mediante NodeSource (apt, dnf, yum) o el repositorio de la distribución; necesitan `root` o `sudo` para instalar paquetes.

### Opción 3: manual

```bash
git clone https://github.com/OctavioproYT452/SynapseBox.git
cd SynapseBox
npm install
```

### Iniciar

```bash
npm start
```

Abre <http://localhost:3001>.

## Primer arranque

1. Abre la aplicación y pulsa **Registrarse**.
2. **El primer usuario que se registre es administrador** automáticamente.
3. Entra en **Admin** (menú superior) para crear usuarios, ajustar cuotas o cerrar el registro público.

## Configuración

Variables de entorno:

| Variable | Por defecto | Descripción |
| --- | --- | --- |
| `PORT` | `3001` | Puerto en el que escucha el servidor. |
| `TRUST_PROXY` | _(vacío)_ | Pon `1` si estás detrás de un proxy inverso (Nginx, Caddy, Cloudflare…) para obtener la IP real y las cookies `Secure`. |
| `DISCORD_TOKEN` | _(vacío)_ | Token del bot de Discord. Sin él, el bot no se activa. Ver [Bot de Discord](#bot-de-discord-opcional). |
| `DISCORD_GUILD_ID` | _(vacío)_ | (Opcional) ID de tu servidor de Discord: los comandos aparecen al instante solo en él. |
| `PUBLIC_URL` | _(vacío)_ | (Opcional) Dirección pública de tu SynapseBox, sin barra final (ej. `https://nube.ejemplo.com`). El bot la usa para dar enlaces completos. |
| `DISCORD_UPDATE_ROLE_ID` | _(vacío)_ | (Opcional) ID de un rol de Discord al que se menciona cuando hay una versión nueva. |

Puedes definirlas en el entorno o, más cómodo, en un archivo **`.env`** en la raíz del proyecto (los instaladores lo crean a partir de `.env.example`; no se sube a GitHub). Las variables del entorno tienen prioridad sobre el `.env`.

```bash
# .env
PORT=8080
TRUST_PROXY=1
```

o bien: `PORT=8080 TRUST_PROXY=1 npm start`.

Ajustes desde el panel de administración: registro público (activar o desactivar), cuota por defecto para nuevos usuarios y anuncio global. Una cuota de `-1` significa almacenamiento ilimitado.

## Guía de uso

| Quiero… | Cómo |
| --- | --- |
| Subir archivos | Botón **Subir**, o arrástralos a la ventana. |
| Subir una carpeta entera | **Subir carpeta**. |
| Buscar en todo mi espacio | Escribe en el filtro y pulsa **Enter**. |
| Descargar una carpeta | Menú **⋯** del elemento → **Descargar ZIP**. |
| Descargar varios elementos | **Seleccionar** → marca elementos → **ZIP**. |
| Compartir | Menú **⋯** → **Compartir**: elige caducidad y, si quieres, contraseña. |
| Gestionar mis enlaces | Menú de usuario → **Enlaces compartidos**. |
| Cambiar el aspecto | Menú de usuario → **Apariencia**. |
| Cambiar usuario o contraseña | Menú de usuario → **Mi perfil** → *Datos de acceso*. |
| Activar el 2FA o crear códigos de recuperación | Menú de usuario → **Seguridad**. |
| Recuperar mi cuenta | En el inicio de sesión: **¿Olvidaste tu usuario o contraseña?** |

Los enlaces compartidos tienen la forma `https://tu-dominio/s/<token>`. Cualquier persona con el enlace puede ver el contenido (y la contraseña, si la configuraste), sin necesidad de cuenta.

### Carpetas colaborativas

El dueño de una carpeta puede invitar a otros usuarios de la instancia:

1. En el menú de una carpeta (`⋯`), elige **Colaboración**.
2. Escribe el **UUID** del usuario (lo encuentra en *Mi perfil*, junto a su nombre), elige su rol y pulsa **Añadir**. Puedes cambiar el rol o quitar a alguien cuando quieras.
3. El usuario añadido verá la carpeta en su panel, en la sección **Compartidas conmigo**, junto al nombre del **dueño** y su rol. Puede abandonar la colaboración con el botón de salida de esa tarjeta.

| Rol | Ver y descargar | Editar contenido, renombrar y mover | Crear carpetas/archivos, subir y copiar | Borrar |
| --- | :-: | :-: | :-: | :-: |
| Solo lectura | ✔ | | | |
| Lectura y edición | ✔ | ✔ | | |
| Lectura, edición y creación | ✔ | ✔ | ✔ | |
| Permisos totales | ✔ | ✔ | ✔ | ✔ |

Notas:

- Los archivos siguen siendo del dueño y **cuentan para su cuota de espacio**.
- Los colaboradores solo ven la carpeta compartida y su contenido, nunca el resto de la cuenta del dueño. No pueden compartir con enlace, marcar favoritos ni cambiar los colaboradores.
- No se puede compartir la carpeta raíz. Si el dueño renombra o mueve la carpeta, la colaboración la sigue; si la borra, se elimina.
- Los permisos se comprueban siempre en el servidor, no solo en la interfaz.

### Estadísticas de uso (2.12.1)

Botón **Estadísticas** de la barra del panel (o del menú de usuario): muestra con barras cuánto ocupas **por tipo** (imágenes, vídeos, audio, documentos, comprimidos, código y otros), las **carpetas que más pesan** y los **archivos antiguos** (sin modificar desde hace más de un año, los 25 más pesados). Desde los antiguos se puede mandar un archivo a la **papelera**. Análisis acotado (30 000 archivos, 20 s) y solo de lectura: no cambia nada en la base de datos.

### Limpieza de espacio

Botón **Limpieza** de la barra del panel (o del menú de usuario): analiza tu carpeta y muestra los **25 archivos más grandes** y los **duplicados** (mismo contenido, comprobado con SHA-256, no solo el nombre), con el espacio que sobra. Cada archivo tiene un botón para moverlo a la papelera. Revisa hasta 30 000 archivos; si tienes más, avisa de que el análisis es parcial. Ruta: `GET /api/cleanup`.

### Papelera de reciclaje

Desde la 2.11.0 **borrar ya no es definitivo**: lo que eliminas (desde la web, WebDAV, el asistente de IA o un administrador) se mueve a la papelera y se puede restaurar.

- **Ver y restaurar:** botón **Papelera** de la barra del panel o en el menú de usuario. Cada elemento muestra su ruta original, tamaño, quién lo borró y los días que le quedan. **Restaurar** lo devuelve a su sitio (con otro nombre, p. ej. `fotos (1)`, si ya existe uno igual y recreando las carpetas que falten); también hay **Eliminar definitivamente** y **Vaciar papelera**.
- **Sin gastar cuota:** la papelera vive en `data/trash/<uuid>/`, fuera de tu espacio, pero tiene un **tope por usuario**; si se llena, se elimina lo más antiguo. Para restaurar sí tiene que caber en tu cuota.
- **Se vacía sola** pasados N días (comprobación al arrancar y cada hora).
- **Carpetas compartidas:** lo que borra un colaborador va a la papelera del dueño de la carpeta.
- **Ajustes** (Admin → Ajustes → Papelera de reciclaje): activar/desactivar, días (1–365, por defecto 30) y tope por usuario en MB (por defecto 2048; -1 = sin límite). Con la papelera desactivada, o si un elemento solo ya supera el tope, se borra definitivamente.
- Al eliminar una cuenta se borra también su papelera. La API: `GET /api/trash`, `POST /api/trash/restore|delete|empty`.
- **Discord:** `/papelera ver`, `/papelera restaurar <id>` y `/papelera vaciar`; el registro de actividad usa el evento «borrados».

### Menú de usuario y perfil

- El botón con tu inicial (en móvil, la hamburguesa) abre el menú: arriba tu nombre y el espacio usado, y debajo las opciones agrupadas con una breve explicación. Se cierra con `Esc`, tocando fuera o al elegir una opción.
- **Mi perfil** reúne en tarjetas el almacenamiento (con desglose por tipo), los datos de acceso (cada cambio en su propio diálogo, con confirmación de contraseña), la seguridad (estado del 2FA y cierre de otras sesiones) y el cierre de sesión.

### Registro, 2FA y recuperación de cuenta

- **Registro**: la contraseña se escribe dos veces (con indicador de coincidencia y de fuerza) y se generan **10 códigos de recuperación** de un solo uso, que se muestran una única vez y se pueden copiar o descargar.
- **2FA (TOTP)**: compatible con Google Authenticator, Aegis, Authy, 1Password… Cualquier cuenta, también las ya existentes, puede activarlo o desactivarlo en **Seguridad**. Se configura con la clave manual (o con el enlace `otpauth://` en el móvil). Desactivarlo pide la contraseña y un código.
- **Recuperación**: en el inicio de sesión, **¿Olvidaste tu usuario o contraseña?** pide un código de recuperación, muestra el usuario de la cuenta y permite elegir una contraseña nueva; al terminar se cierran todas las sesiones. Cada código solo sirve una vez; en **Seguridad** se pueden generar códigos nuevos (invalidan los anteriores).
- Con 2FA activado, el inicio de sesión también acepta un código de recuperación si no tienes la app a mano.
- Si te quedas sin acceso, un administrador con acceso al servidor puede ejecutar `node tools/reset-password.js <usuario> <nueva-contraseña>`, que además desactiva el 2FA de esa cuenta.

### Cuentas: UUID y nombre de usuario

- Cada usuario recibe al crearse un **UUID permanente** que nunca cambia. Sus archivos se guardan en `hosting/<uuid>/`, no con su nombre de usuario.
- El **nombre de usuario** solo existe en la base de datos y se puede cambiar (en **Mi perfil → Datos de acceso**, pidiendo la contraseña; los administradores pueden hacerlo desde el panel de admin). El cambio se refleja al instante en todas partes, por ejemplo como autor en la comunidad de temas, y no mueve ni renombra ningún archivo.
- Al actualizar desde una versión anterior, las carpetas antiguas (`hosting/<usuario>/`) se renombran solas a su UUID al primer arranque.

## Temas y personalización

Desde **Apariencia** puedes elegir un tema y retocar cada detalle. El cambio se ve al instante y se guarda en tu cuenta. El diálogo se organiza en tres pestañas: **Temas** (los incluidos), **Mis temas** (guardar, importar, exportar y publicar) y **Personalizar** (colores agrupados, redondeo, tipografía y densidad).

Temas incluidos: Medianoche, Océano, Bosque, Atardecer, Neón, Dracula, Terminal, Alto contraste, Claro suave, Nórdico, Papel y Menta.

Personalizable: 10 colores (fondo, tarjetas, elementos, texto, texto suave, acento, texto sobre acento, peligro, éxito y aviso), redondeo de esquinas, tipografía (moderna, clásica, monoespaciada o redondeada) y densidad (compacta, normal o amplia). Las páginas de enlaces compartidos usan el tema de quien comparte.

### Imágenes, GIF y vídeos en el tema

En **Apariencia → Fondo y botones**:

- **Fondo de la página:** imagen, GIF animado o vídeo (PNG, JPG, GIF, WebP, AVIF, MP4 o WebM). Se puede ajustar (cubrir, contener o estirar), oscurecer (0–80 %) y desenfocar (0–20 px). Los vídeos van en bucle y sin sonido, y no se reproducen si el sistema pide «reducir movimiento».
- **Botones:** solo imagen o GIF, con ajuste y oscurecido para que el texto se lea bien. Se aplica a los botones principales.
- **Dónde se guardan:** en la carpeta **Temas** del propio usuario (la verás en *Mis archivos*). Ocupan su espacio como cualquier archivo, con un máximo de 20 MB por imagen y 150 MB por vídeo. El tema solo guarda el nombre del archivo y de ahí lo toma para dibujarlo. Puedes **subir** un archivo nuevo o **elegir** uno que ya esté en *Temas* (y borrarlo desde ahí).
- **Dispositivo:** cada tema puede marcarse como pensado para **celular**, **PC** o **ambos** (en *Fondo y botones* y al publicarlo). En la comunidad se muestra en cada tema, se puede filtrar por dispositivo y, si el tema usa fondo o botones con imagen y no coincide con tu dispositivo, aparece un aviso de que el fondo puede verse mal.
- **Al compartir un tema** en la comunidad, quien lo guarda o usa recibe una **copia** de los medios en su propia carpeta *Temas* (ocupa su espacio, y necesita tener sitio). Los medios de un tema publicado se pueden ver por otros usuarios; los de temas privados, no.
- Al **exportar** un tema a `.json` no se incluyen los medios.

### Crear, exportar e importar temas

Cualquier usuario puede crear sus propios temas:

1. En **Apariencia → Personalizar**, ajusta los colores con el selector o escribiendo el código hex (`#RRGGBB`; también acepta `#RGB`), además del redondeo, la tipografía y la densidad.
2. En **Mis temas**, pulsa **Guardar el tema actual** para guardarlo en **Mis temas** (hasta 50 por usuario).
3. **Exportar actual** descarga el tema actual como archivo; **Exportar todos** descarga un paquete con todos tus temas.
4. **Importar (.json)** añade a Mis temas uno o varios archivos. Así puedes compartir temas por cualquier medio (GitHub, Discord, correo…).

Formato del archivo (también se acepta un objeto con solo los valores del tema):

```json
{
  "synapsebox": "theme",
  "version": 1,
  "name": "Mi tema",
  "theme": {
    "bg": "#0b1020", "card": "#121a2e", "card2": "#18223a",
    "text": "#e8eefc", "muted": "#8d9ab3",
    "accent": "#6ea8fe", "on": "#04213f",
    "danger": "#ff6b7a", "ok": "#34d399", "warn": "#fbbf24",
    "r": 14, "font": "system", "sp": "1"
  }
}
```

- `r`: redondeo de 0 a 28. `font`: `system`, `serif`, `mono` o `rounded`. `sp` (densidad): `0.8`, `1` o `1.25`.
- Los paquetes usan `{"synapsebox": "theme-pack", "themes": [ {…}, {…} ]}`.
- Los valores se validan al importar: solo se aceptan colores hex y los valores anteriores, así que un archivo ajeno no puede introducir código.

### Comunidad de temas

Cada servidor tiene su propia comunidad de temas, accesible desde el menú de usuario → **Comunidad de temas** (`/themes.html`).

- **Publicar:** en **Mis temas**, pulsa el icono del globo de un tema. Se mostrará con tu nombre de usuario; vuelve a pulsarlo para dejar de compartirlo. Es opcional: tus temas son privados por defecto.
- **Explorar:** busca por nombre o autor, filtra entre **Todos** y **Míos** y ordena por recientes, nombre o autor. Cada tema muestra una vista previa con sus colores.
- **Probar, usar o guardar:** **Probar** lo aplica temporalmente en la página, **Usar** lo guarda en tus temas y lo activa, y **Guardar en Mis temas** solo lo añade a **Mis temas**.
- Si cambias o borras un tema publicado, la comunidad se actualiza al instante. Los temas de usuarios suspendidos no se muestran.
- **Moderación:** los administradores pueden retirar cualquier tema de la comunidad (el autor lo conserva en su cuenta, pero deja de ser público).

## Visor de documentos

Al abrir un archivo en el panel se muestra una vista previa integrada:

- **Código, JSON y texto (2.16.1)**: **Ver** abre un **lector de solo lectura** con resaltado de sintaxis, numeración de líneas, copiar, ajuste de línea y, en JSON, validación y vista formateada. No tiene ningún campo de texto, así que en el móvil **no sale el teclado**; si tienes permiso de escritura, el botón **Editar** pasa al editor. El resaltador es **propio y local** (`public/js/codeview.js`, sin librerías ni CDN) y entiende JavaScript/TypeScript, JSON, HTML/XML, CSS/SCSS, Python, Java/C#/Kotlin, C/C++, PHP, Go, Rust, Shell, SQL, YAML, INI/TOML/.env, Markdown, CSV y registros (`.log`). Los archivos de más de 300 KB se muestran sin colores y el lector enseña las primeras 5000 líneas.
- **Editor de archivos (2.16.1)**: **Editar** abre un editor con resaltado mientras escribes, numeración, línea actual marcada, barra de estado (línea, columna, selección y validez del JSON), punto de «cambios sin guardar» y aviso al cerrar con cambios. Atajos: **Ctrl+S** guardar, **Ctrl+/** comentar, **Tab / Mayús+Tab** sangrar varias líneas; sangría automática, cierre automático de `() [] {} "" ''` y borrado de pares. Conserva el historial de deshacer del navegador.
- Los **enlaces compartidos** (`/s/<token>`) usan estos mismos visores en su vista previa, también para visitantes sin cuenta.
- **PDF**: visor propio con pdf.js (incluido en `public/vendor/`, no necesita Internet). Funciona en escritorio y móvil, con zoom y carga perezosa de páginas. Sustituye al visor del navegador, que fallaba en muchos dispositivos.
- **Word, Excel y PowerPoint** (`.doc .docx .xls .xlsx .ppt .pptx`, y también `.odt .ods .odp .rtf`):
  - Si el servidor tiene **LibreOffice** instalado (`soffice` en el PATH, o la variable `SOFFICE` con su ruta), el documento se convierte a PDF y se ve con total fidelidad. Las conversiones se guardan en caché (6 h), se hacen de una en una y el límite es de 40 MB.
  - Sin LibreOffice, **docx, xlsx y pptx** se dibujan directamente en el navegador (texto con formato, tablas, imágenes, hojas con pestañas y diapositivas). Es una vista aproximada. Los formatos antiguos (`.doc`, `.xls`, `.ppt`) y OpenDocument necesitan LibreOffice.
  - Instalar LibreOffice en Debian/Ubuntu: `sudo apt install libreoffice-core libreoffice-writer libreoffice-calc libreoffice-impress`.

## Acceso WebDAV

Cada usuario puede montar su carpeta como unidad de red (Windows, macOS, Linux y apps móviles con WebDAV).

1. **Menú de usuario → Acceso WebDAV → Activar** (pide la contraseña de la cuenta).
2. Se muestra **una sola vez** la clave generada al azar. El usuario es el mismo de la cuenta y la dirección es `https://tu-servidor/dav/`.
3. **Generar clave nueva** invalida la anterior; **Desactivar** cierra el acceso al instante.

Detalles:
- La clave **no sirve para entrar en la web** ni da acceso a nada fuera de tu carpeta de archivos; las cuentas suspendidas quedan bloqueadas.
- Se admiten `GET`, `PUT`, `DELETE`, `MKCOL`, `COPY`, `MOVE`, `PROPFIND`, `PROPPATCH`, `LOCK` y `UNLOCK` (los bloqueos son de cortesía, sin exclusión real). Se respeta la cuota (`507` si no hay espacio).
- Windows solo admite la autenticación Basic por **HTTPS** salvo que se cambie una opción del sistema; usa HTTPS siempre que sea posible. Detrás de Nginx no hace falta ninguna configuración extra (conviene `client_max_body_size 0`).

## Panel de administración

Disponible en `/admin/` solo para administradores. Usa el mismo menú de usuario que el panel (avatar arriba a la derecha) y cada sección explica qué hace: formularios con ayudas, opciones agrupadas y acciones principales destacadas.

- **Resumen:** usuarios, almacenamiento total, enlaces activos, sesiones activas y estado del servidor (se actualiza cada 5 s).
- **Usuarios:** alta, edición de cuota y rol, suspensión, cambio de contraseña, cierre de sesiones, explorador de archivos y eliminación.
- **Enlaces:** todos los enlaces compartidos, con opción de revocarlos.
- **IA:** activar o desactivar el agente de IA, elegir Grok, OpenAI (ChatGPT), Gemini u Ollama, API key, modelo y límite de usos (ver [Agente de IA](#agente-de-ia-opcional)).
- **Plugins:** ver [Plugins](#plugins).
- **Ajustes:** registro público, cuota por defecto y anuncio global.

### Actualizaciones

- La versión instalada está en `data/version.json`:

  ```json
  { "version": "2.16.1" }
  ```

- Cada 2 minutos el servidor lee ese archivo local y lo compara con el `data/version.json` publicado en GitHub. Si el de GitHub es más nuevo (se comparan los números: `2.10` es mayor que `2.9`), los **administradores** ven un aviso de nueva versión con instrucciones para actualizar.
- El aviso se puede cerrar, pero vuelve a aparecer cada vez que se abre el panel, el de administración o la comunidad de temas, hasta que actualices.
- Para actualizar: `git pull`, `npm install` y reiniciar el servidor. `data/version.json` es el único archivo de `data/` que se versiona.
- **Para publicar una versión nueva** (mantenedores): sube el número en `data/version.json` y haz _push_.
- Variables opcionales: `SYNAPSEBOX_VERSION_URL` (otra URL de comprobación, útil en _forks_) y `SYNAPSEBOX_REPO_URL` (enlace que muestra el aviso).

## Agente de IA (opcional)

Al terminar `npm install`, los instaladores (`scripts/unix/install.sh`, `scripts/windows/install.ps1`, `scripts/windows/install.bat` y los de una línea) ejecutan `tools/setup-ai.js`, que pregunta:

1. **¿Quieres configurar un agente de IA?**
   - **No** → se guarda en la base de datos que no hay IA. Al arrancar, el servidor lo lee y **oculta todo lo relacionado con la IA** (botón, chat, campos de límites y la propia API `/api/ai/*`, que responde 404).
   - **Sí** → eliges proveedor:
     - **Grok (xAI):** te muestra el enlace para conseguir la API key (<https://console.x.ai/>) y te pide que la pegues. También puedes indicar el modelo (por defecto `grok-4.7`).
     - **OpenAI (ChatGPT):** API key en <https://platform.openai.com/api-keys> (es la API de pago de OpenAI, distinta de una suscripción a ChatGPT). Modelo por defecto: `gpt-5-mini`.
     - **Google Gemini:** API key gratuita o de pago en <https://aistudio.google.com/apikey>. Modelo por defecto: `gemini-2.5-flash`.
     - **Ollama:** indicas la URL (por defecto `http://localhost:11434`) y el modelo (por defecto `llama3.1`; instálalo con `ollama pull llama3.1`).

Puedes repetir el asistente con `npm run setup-ai`. Para instalaciones sin teclado: `SYNAPSEBOX_AI=none|grok|openai|gemini|ollama` junto con `SYNAPSEBOX_AI_KEY`, `SYNAPSEBOX_AI_MODEL` y `SYNAPSEBOX_OLLAMA_URL`. Si no hay terminal interactiva, no se cambia nada y la IA queda desactivada.

### Activar, cambiar o desactivar desde el panel

En **Admin → IA** el administrador puede, en cualquier momento y sin reiniciar el servidor, activar la IA (aunque en la instalación dijera que no), pegar o cambiar la API key (con el enlace para conseguirla), cambiar entre Grok, OpenAI, Gemini y Ollama, elegir el modelo, probar la conexión o desactivarla. Cada proveedor en la nube conserva su propia API key y su modelo, así que puedes cambiar de uno a otro sin volver a pegarlos.

### Límites de uso

- **General:** número de usos **por hora o por día** para cada usuario (`-1` = ilimitado, `0` = nadie). Por defecto, 20 por hora.
- **Por usuario:** en **Admin → Usuarios → Editar** se puede dar a un usuario otro límite y otro periodo (vacío = usar el general; `0` = bloquearle la IA).
- Cada mensaje enviado al agente cuenta como **un uso** (aunque haga varias operaciones). Si el proveedor falla, el uso no se descuenta. Solo se procesa una petición a la vez por usuario.

### Qué puede hacer el agente (y qué no)

El agente trabaja **únicamente dentro de la carpeta del usuario que lo usa** (para él es la raíz `/`) y dispone solo de estas herramientas: listar, leer archivos de texto, crear carpetas, crear archivos de texto, mover, copiar y borrar. **No existe ninguna herramienta para ejecutar nada**: los archivos que crea son datos (permisos `0644`, nunca ejecutables) y las copias pierden el bit de ejecución.

- Las rutas se validan en el servidor (no se confía en el modelo): se rechazan `..`, rutas absolutas hacia fuera, caracteres de control y enlaces simbólicos, y no se puede operar sobre la carpeta raíz.
- Se respeta la cuota de almacenamiento del usuario.
- La API key se guarda en la base de datos (`data/synapsebox.db`) y nunca se devuelve al navegador. Protege esa carpeta y sus copias de seguridad.
- Con Grok, OpenAI o Gemini, lo que el usuario escriba y el contenido de los archivos que el agente lea se envían a xAI, OpenAI o Google respectivamente; con Ollama todo queda en tu servidor. Tenlo en cuenta al elegir proveedor.

## Bot de Discord (opcional)

Un bot que se conecta a tu servidor de Discord con el token que pongas en el `.env`. **Sin `DISCORD_TOKEN` no se carga nada** y SynapseBox funciona exactamente igual que siempre. Con él obtienes:

- **Vinculación de cuentas** con un formulario que solo ve el usuario (nombre de usuario, contraseña y, si tiene 2FA, el código). La vinculación se guarda en la base de datos y aparece en **Mi perfil → Discord** en la web, donde también se puede desvincular.
- **Registro de actividad** en un canal de Discord: qué hizo cada usuario (subidas, borrados, enlaces, cambios de cuenta, acciones de admin…). **No se guarda nada en el servidor**: los eventos esperan unos segundos en memoria (máximo 100) y se envían agrupados a Discord. Nunca se envían contraseñas, códigos, claves ni enlaces completos.
- **Avisos de actualización** en otro canal: cuando se detecta una versión nueva en GitHub (cada 2 minutos) se anuncia una vez, con las notas de `RELEASE.md`.
- **Comandos** de barra, unos para todos y otros solo para administradores. Por defecto las respuestas son privadas, pero algunos comandos son **públicos** (los ve todo el canal) y otros te dejan elegir con la opción `publico` / `privado`.
- **Bienvenidas** a los miembros nuevos, por servidor: canal, mensaje y título propios, con códigos como `{username}`, `{nickname}`, `{members}`. Se configuran en Discord (`/bienvenida`) y en la web (**Admin → Discord**); es el mismo ajuste.

### Puesta en marcha

1. Crea una aplicación en <https://discord.com/developers/applications>, entra en **Bot**, pulsa **Reset Token** y copia el token. Para las **bienvenidas** activa también **Server Members Intent** (en la misma página, _Privileged Gateway Intents_); sin él el bot funciona igual, pero no puede ver quién entra.
2. Pégalo en el `.env`: `DISCORD_TOKEN=tu_token`. Opcional: `DISCORD_GUILD_ID` (comandos al instante en tu servidor), `PUBLIC_URL` y `DISCORD_UPDATE_ROLE_ID`.
3. Reinicia SynapseBox. En la consola aparece el enlace de invitación (también en **Admin → Discord**); invita al bot a tu servidor. Necesita ver los canales, enviar mensajes e insertar enlaces.
4. En Discord, un administrador de SynapseBox se vincula con `/vincular` y configura los canales: `/config registros #canal` y `/config actualizaciones #canal`. El bot comprueba que puede escribir en el canal antes de guardarlo.

> `npm install` instala `discord.js` como dependencia opcional. Si falta, el servidor arranca igualmente y **Admin → Discord** lo indica.

### Comandos

| Comando | Quién | Qué hace |
| --- | --- | --- |
| `/vincular` | Todos | Formulario privado: usuario, contraseña y código 2FA (solo si la cuenta lo tiene; también vale un código de recuperación). |
| `/desvincular` | Vinculados | Quita el enlace con tu cuenta. |
| `/cuenta [publico]` | Vinculados | Tu espacio, 2FA, enlaces, carpetas compartidas y uso de la IA. En público se ocultan el ID permanente y tu último acceso. |
| `/archivos [ruta]` | Vinculados | Lista tu carpeta personal (solo lectura). |
| `/buscar texto` | Vinculados | Busca archivos y carpetas por nombre. |
| `/enlaces listar · crear · revocar` | Vinculados | Gestiona tus enlaces para compartir (`crear` y `/ia` se pueden desactivar en Admin → Discord). |
| `/papelera ver · restaurar · vaciar` | Vinculados | Mira y restaura lo que borraste, o vacía la papelera |
| `/ia pregunta` | Vinculados | Habla con el asistente de IA (respeta tus límites de uso). |
| `/version [privado]` | Todos | **Público.** Versión instalada y si hay una nueva. |
| `/ping [privado]` | Todos | **Público.** Comprueba que el bot responde y su latencia. |
| `/servidorinfo [privado]` | Todos | **Público.** Dueño, miembros, canales, roles y fecha de creación del servidor de Discord. |
| `/usuarioinfo [usuario] [privado]` | Todos | **Público.** Cuenta creada, fecha de entrada y roles de un miembro. |
| `/avatar [usuario] [privado]` | Todos | **Público.** La foto de perfil en grande. |
| `/dado [caras] [cantidad] [privado]` · `/moneda` · `/elegir opciones` | Todos | **Público.** Dados, moneda y elección al azar. |
| `/encuesta pregunta opcion1…4` | Todos (en servidores) | Encuesta con reacciones numeradas. |
| `/recientes` · `/favoritos` | Vinculados | Tus archivos modificados más recientemente y tus favoritos. |
| `/comandos [publico]` | Todos | Lista los comandos propios del servidor (los creados en el editor web). |
| `/limpiar cantidad` | Quien tenga «Gestionar mensajes» | Borra de 1 a 100 mensajes recientes del canal. |
| `/ayuda [publico]` | Todos | Lista los comandos. |
| `/bienvenida ver · canal · mensaje · formato · activar · desactivar · probar · variables · restablecer` | Admins de SynapseBox o quien pueda gestionar el servidor | Configura el mensaje de bienvenida de ese servidor (ver abajo). |
| `/config ver · registros · actualizaciones · prefijo · quitar` | Admins | Canales del bot y prefijo de los comandos propios. |
| `/servidor [publico]` | Admins | CPU, memoria, disco y totales. |
| `/usuarios [buscar]` · `/usuario nombre` | Admins | Lista de cuentas y detalle de una. |
| `/suspender` · `/reactivar` | Admins | Bloquea o devuelve el acceso (al suspender se cierran sus sesiones). |
| `/anuncio [texto]` · `/registro activo` | Admins | Anuncio global y registro público. |
| `/actualizar` | Admins | Comprueba ahora si hay una versión nueva y la anuncia. |

Ser «admin» en el bot significa tener una cuenta vinculada que sea administradora en SynapseBox: se comprueba en cada uso, así que quitar el rol o suspender la cuenta surte efecto al instante.

### Comandos propios (SBScript)

Desde **Admin → Discord → Abrir el editor de comandos** (`/admin/discord.html`, solo administradores) puedes crear tus propios comandos con **SBScript**, un lenguaje sencillo inspirado en BDScript de BDFD.

- **Tipos:** *slash* (`/comando`, con opciones de texto, número, usuario, canal, rol…), *prefijo* (`!comando`, con alias; el prefijo se cambia en el editor o con `/config prefijo`) y *mensaje* (responde cuando alguien escribe un texto: exacto, que lo contenga o que empiece así).
- **Acceso por comando:** todos, solo cuentas vinculadas, solo admins de SynapseBox, o admins y gestores del servidor.
- **Carpetas:** organiza los comandos en carpetas (hasta 3 niveles), arrastra un comando a una carpeta para moverlo, renómbralas o bórralas.
- **Archivos:** al guardar, cada comando se escribe como un archivo `.sbs` (los `.fcs` antiguos se siguen leyendo) en `data/discord-commands/<carpeta>/`. Se compilan una sola vez y se ejecutan desde la memoria; puedes hacer copia de seguridad de esa carpeta o editar los archivos a mano (se leen al reiniciar).
- **Wiki:** `/admin/discord-wiki.html` (también desde el editor) con guías, recetas y la referencia de las 301 funciones con ejemplos, filtros por categoría, marca de «nuevo» y buscador (tecla `/`).
- **Editor (rediseñado en la 2.15.3):** explorador con carpetas (editar, duplicar, borrar y arrastrar), propiedades, panel de problemas, panel de pruebas y barra de estado; resaltado de sintaxis (funciones, bloques, corchetes por niveles, errores en rojo), autocompletado al escribir `$`, números de línea con errores marcados, panel de funciones con buscador y **prueba en vivo** que no envía nada a Discord (las acciones como dar roles o expulsar solo se describen). Desde la 2.15.3 añade línea actual resaltada, sangría automática dentro de `$if`/`$for`/`$while`, **Tab / Mayús+Tab** para sangrar varias líneas, **Ctrl+/** para comentar, **Ctrl+Enter** para probar, `\[` sin cierre automático (para JSON), autocompletado que se abre hacia arriba si no cabe y, en móvil, una barra con `$ [ ] ; \ { }` y texto a 16 px (sin zoom al escribir).
- **Comandos de prefijo y de mensaje** necesitan el permiso especial «Message Content Intent» (Developer Portal → Bot → Privileged Gateway Intents). Sin él, el bot arranca igual y los comandos slash funcionan.

```text
//@ tipo: slash            (estas líneas //@ las rellena el editor; no hace falta escribirlas)
$title[¡Hola $nickname!]
$color[#4f8cff]
$setUserVar[usos;$calc[$getUserVar[usos;0]+1]]
$if[$option[texto]==]
  No escribiste nada. Llevas $getUserVar[usos] usos.
$else
  Dijiste: $option[texto]
$endif
$footer[Tu espacio: $sbSpace de $sbQuota]
```

**Sintaxis:** `$funcion` o `$funcion[arg1;arg2]` (se pueden anidar). Escapes: `\$ \; \[ \]`. Comentarios: líneas que empiezan por `//` o `$c[texto]`. Bloques: `$if / $elseif / $else / $endif`, `$for[var;desde;hasta] … $endfor` y `$while[cond] … $endwhile` (máx. 200 vueltas). Operadores: `== != > < >= <= ~=` (contiene), `&&`, `||`.

**Funciones (301):** contexto (`$username`, `$message[1]`, `$option[x]`, `$mentioned`, `$serverName`, `$hasRole`…), respuesta (`$title`, `$description`, `$color`, `$addField`, `$ephemeral`, `$sendMessage`, `$sendDM` (también a otro usuario por ID), `$addReaction`…), lógica (`$onlyIf`, `$onlyAdmin`, `$onlyPerms`, `$onlyRoles`, `$onlyLinked`, `$cooldown`, `$stop`, `$set/$get`), variables guardadas por usuario, servidor o globales (`$setUserVar`, `$getServerVar`, `$topUserVar`…), matemáticas (`$calc`, `$random`, `$round`…), texto (`$upper`, `$replace`, `$split`, `$contains`, `$choose`…), tiempo (`$date`, `$discordTime`, `$duration`), SynapseBox (`$sbUser`, `$sbSpace`, `$sbQuota`, `$sbUsers`, `$sbVersion`) y moderación (`$giveRole`, `$takeRole`, `$kick`, `$ban`, `$timeout`, `$deleteMessages`). La lista completa, con descripción de cada una, está en el panel *Funciones* del editor.

**Novedades de SBScript en la 2.10.11:** tarjetas completas (`$footerIcon`, `$authorIcon`, `$authorUrl`, `$titleUrl`), captcha con imagen (`$genCaptcha` genera un PNG sin dependencias, lo incluye en la tarjeta y guarda el código en la variable de usuario `captcha`; `$checkCaptcha` y `$clearCaptcha` lo verifican y lo borran), contadores (`$incUserVar`, `$incServerVar`, `$incGlobalVar`, `$rankUserVar`), utilidades de texto, números y fechas (`$progressBar`, `$percent`, `$randomString`, `$truncate`, `$parseDate`, `$timeAgo`…), más moderación (`$setNickname`, `$unban`, `$slowmode`) y **funciones de IA** (`$ai`, `$aiSummarize`, `$aiTranslate`, `$aiClassify`, `$aiSentiment`, `$aiModerate`…) que usan la IA configurada en el panel. Las funciones de IA solo envían y reciben texto, tratan lo que escribe el usuario como datos, limitan a 3 llamadas por ejecución y cuentan en el límite de IA de la cuenta vinculada (o 10 por hora si no la hay); en comandos slash el bot responde «pensando…» mientras espera.

**Roles de autoservicio (2.10.11):** `$grantRole[idRol]` y `$revokeRole[idRol]` los ejecuta el **bot**, así que quien usa el comando no necesita permisos (ideal para el captcha). El bot necesita «Gestionar roles», su rol debe estar por encima del rol a dar, y por seguridad se rechazan roles con permisos de gestión, de integraciones y @everyone. `$canGrantRole` y `$botHasPerm` permiten comprobarlo antes.

**Novedades de SBScript en la 2.16.0:** Discord: `$bold`, `$italic`, `$underline`, `$strike`, `$spoiler`, `$quote`, `$inlineCode`, `$codeBlock`, `$hyperlink`, `$stripMarkdown`; texto: `$swapCase`, `$kebabCase`, `$pascalCase`, `$extractNumbers`, `$longestWord`, `$vowelCount`, `$isUrl`, `$isEmail`, `$domain`; matemáticas: `$cbrt`, `$hypot`, `$sin`, `$cos`, `$tan`, `$mode`, `$variance`, `$distance`, `$percentChange`, `$celsiusToFahrenheit`, `$fahrenheitToCelsius`; tiempo: `$timestampCode` (código de hora de Discord de ahora, sin tocar el embed), `$addDays`, `$isWeekend`, `$quarter`; JSON: `$jsonArrayRandom`, `$jsonArrayShuffle`, `$jsonArrayFlat`.

**Novedades de SBScript en la 2.15.x:** `$jsonArrayCount` sin claves devuelve cuántas listas hay en todo el JSON cargado con `$jsonParse` (con clave sigue dando los elementos de esa lista); JSON: `$jsonObjectCount`, `$jsonLength`, `$jsonKeys`, `$jsonType`, `$jsonArrayUnique`, `$jsonArrayRemove`, `$jsonArraySum`; texto: `$removeAccents`, `$between`, `$charAt`, `$wordAt`, `$isEmpty`, `$replaceFirst`, `$base64Encode`, `$base64Decode`, `$urlDecode`; matemáticas: `$sqrt`, `$power`, `$mod`, `$isNumber`, `$range`, `$lerp`, `$gcd`, `$lcm`, `$factorial`, `$isPrime`, `$fibonacci`, `$log`, `$sign`, `$trunc`, `$randomFloat`, `$stdDev`, `$toBase`, `$fromBase`, `$roman`, `$ordinal`, `$bytes`; más texto: `$left`, `$right`, `$lastIndexOf`, `$containsAny`, `$containsAll`, `$equalsIgnoreCase`, `$camelCase`, `$snakeCase`, `$reverseWords`, `$escapeMarkdown`, `$rot13`, `$countLetters`, `$uuid`; tiempo: `$isLeapYear`, `$daysInMonth`; más JSON: `$jsonArrayMax`, `$jsonArrayMin`, `$jsonArrayAverage`, `$jsonArrayInsert`, `$jsonArraySlice`, `$jsonValues`, `$jsonMerge`. `$isFcAdmin` pasa a llamarse `$isSbAdmin`; los comandos guardados con el nombre antiguo, los botones ya enviados (`fcs:`) y los archivos `.fcs` siguen funcionando (al guardar, un comando pasa a `.sbs`).

**Hablar de otra persona (2.10.11):** `$isLinked`, `$isSbAdmin` (antes `$isFcAdmin`, que sigue funcionando), `$sbUser`, `$sbSpace`, `$sbQuota` y `$sbPercent` aceptan un ID o mención de Discord (`$sbSpace[$mentioned[1]]`), igual que `$username`, `$avatar`, `$hasRole`, `$getUserVar`… Así `!perfil @juan` muestra el perfil de Juan. Ver la guía «Hablar de otra persona» de la wiki.

**Novedades de SBScript en la 2.12.1:** `$average`, `$median`, `$dice`, `$coinFlip` (matemáticas), `$isPalindrome`, `$initials` (texto), `$weekday` y `$daysUntil` (tiempo). Ya están en la wiki y en el editor.

**Novedades de SBScript en la 2.14.0:** el lenguaje se llama ahora **SBScript** (antes FCScript) y las funciones de SynapseBox pasan de `$fcUser`, `$fcSpace`, `$fcQuota`, `$fcPercent`, `$fcUsers`, `$fcVersion` a `$sbUser`, `$sbSpace`, `$sbQuota`, `$sbPercent`, `$sbUsers`, `$sbVersion` (los comandos guardados con los nombres antiguos siguen funcionando). Además llegan las funciones **HTTP** y **JSON** de BDFD:
- **HTTP:** `$httpGet`, `$httpPost`, `$httpPut`, `$httpPatch`, `$httpDelete` (el 2.º/3.er argumento opcional es un mensaje de error propio), `$httpAddHeader[nombre;valor]`, `$httpStatus` y `$httpResult[clave;…]` (sin claves devuelve el texto; con claves entra en el JSON de la respuesta). Por seguridad solo se permiten direcciones `http://` y `https://` públicas (nunca `localhost`, redes privadas ni `169.254.x.x`), con un máximo de 5 peticiones, 8 s y 1 MB por comando.
- **JSON:** `$jsonParse`, `$json[clave;…]`, `$jsonSet`, `$jsonSetString`, `$jsonUnset`, `$jsonClear`, `$jsonExists`, `$jsonStringify`, `$jsonPretty`, `$jsonArray`, `$jsonArrayAppend`, `$jsonArrayUnshift`, `$jsonArrayPop`, `$jsonArrayShift`, `$jsonArrayCount`, `$jsonArrayIndex`, `$jsonArrayReverse`, `$jsonArraySort` y `$jsonJoinArray`. Las listas empiezan en la posición 0 y los corchetes de un JSON escrito a mano se escapan como `\[` y `\]`.
- Ejemplo: `$httpGet[https://api.example.com/usuario/1;No pude consultar la API.]` + `$jsonParse[$httpResult]` + `$title[$json[name]]`.

**Programar con IA (2.10.11):** en el editor, el botón **✨ IA** recibe una descripción («un comando que…»), la IA lee **toda la wiki** (guías, recetas y las 178 funciones con ejemplo), escribe el comando, lo pasa por el analizador y se corrige sola si hay errores (hasta 2 reintentos). Nunca guarda nada: el resultado aparece en el editor para revisarlo, probarlo y guardarlo. También puede modificar el comando abierto. Cuenta un uso del límite de IA del administrador y envía unos 10 000 tokens de contexto por petición. API: `POST /api/admin/discord/cmds/ai` (solo administradores).

**Botones (2.10.11):** `$addButton[etiqueta;id;estilo;emoji]` y `$addLinkButton[etiqueta;url]` añaden botones al mensaje (hasta 25). Lo que pasa al pulsarlos se programa en un comando de nuevo tipo **Botón** cuyo activador es el id del botón (exacto o «empieza así», para mandar datos en el id: `rol:123`). Dentro puedes usar `$buttonId`, `$buttonArg[n]`, `$updateMessage` (edita el mensaje del botón), `$clearButtons`, `$ephemeral`, etc. Los ids de SBScript llevan el prefijo interno `fcs:`, así que no chocan con los del sistema de tickets.

**Seguridad:** lo que escribe un usuario nunca se interpreta como código; los operadores de las condiciones solo cuentan si los escribió el autor; hay límites de pasos (4000), de tiempo (4 s), de bucles, de tamaño (20 000 caracteres por comando, 200 comandos, 60 slash) y de variables guardadas (20 000). Las funciones de moderación comprueban que **quien usa el comando** tenga el permiso de Discord correspondiente. Las menciones masivas (`@everyone` y roles) están desactivadas en las respuestas.

### Tickets de soporte

Sistema ya hecho, con botón para abrir tickets. Se configura **desde la web (Admin → Discord → Panel de Discord → Tickets)**: rol de soporte, categoría, canal de transcripciones, máximo por persona, envío del panel con el botón (canal, título y texto) y lista de tickets abiertos con quién los atiende. También con estos comandos, para quien tenga «Gestionar servidor» (o sea admin de SynapseBox):

| Comando | Qué hace |
|---|---|
| `/tickets configurar rol:@Soporte [categoria] [registro] [maximo]` | Rol que ve, reclama y cierra los tickets; categoría donde se crean; canal de transcripciones; tickets abiertos por persona (1-5). |
| `/tickets panel [canal] [titulo] [descripcion]` | Envía el mensaje con el botón **🎫 Abrir ticket**. |
| `/tickets estado` | Configuración, tickets abiertos y permisos que falten. |

- **Quien abre el ticket** rellena un formulario con su problema y solo puede **ver y escribir** en su canal privado (sin comandos, hilos, menciones masivas ni botones de gestión).
- **El rol de soporte** ve el canal y pulsa **🙋 Reclamar** o **🔒 Cerrar**. Al reclamar, el resto del rol sigue viendo el ticket pero **no puede escribir**: solo atiende quien lo reclamó. Solo él (o alguien con «Gestionar servidor») puede **↩️ Soltarlo** o cerrarlo.
- Al cerrar (con confirmación) se guarda una transcripción `.txt` en el canal de registro y se borra el canal. El texto de los mensajes de las personas en la transcripción requiere «Message Content Intent».
- Permisos del bot: Gestionar canales, Gestionar roles, Ver canales, Enviar mensajes, Insertar enlaces, Adjuntar archivos y Leer el historial (el enlace de invitación del panel ya los incluye; si invitaste al bot antes, vuelve a invitarlo). Su rol debe estar por encima del rol de soporte.
- Tablas nuevas: `discord_ticket_cfg` y `discord_tickets` (se crean solas).

### Bienvenidas

Cuando alguien entra al servidor, el bot envía un mensaje al canal que elijas. Configuración, por servidor:

- En Discord: `/bienvenida canal #canal`, `/bienvenida mensaje` (abre un formulario con título y mensaje), `/bienvenida rol @rol` (rol que se da automáticamente a quien entra; sin rol = ninguno), `/bienvenida formato` (tarjeta o texto), `/bienvenida activar`, `/bienvenida probar` (te saluda a ti como prueba) y `/bienvenida variables`.
- En la web: **Admin → Discord → Bienvenidas**, con vista previa en vivo, botones para insertar códigos y envío de prueba.

**Rol automático:** el bot necesita el permiso «Gestionar roles» (el enlace de invitación nuevo ya lo incluye; si ya lo tenías invitado, dáselo en Ajustes del servidor) y su rol debe estar **por encima** del rol que va a dar. Funciona aunque no haya canal de bienvenidas.

Códigos disponibles (en el mensaje y en el título): `{username}`, `{nickname}`, `{mention}`, `{tag}`, `{id}`, `{members}`, `{humans}`, `{server}`, `{created}` y `{date}`. Los nombres se escapan para que nadie cuele menciones masivas ni formato con su apodo; solo se menciona a la persona que entra.

### Aviso de actualización a mano (2.11.1)

En **Admin → Discord → Actividad → Avisar de una actualización ahora** el botón **Enviar aviso** consulta GitHub en ese momento (versión, notas de `RELEASE.md` y la sección «Archivos modificados» si existe) y publica el aviso en el canal de actualizaciones. Sirve aunque esa versión ya se hubiera anunciado; necesita el bot conectado y el canal configurado.

### Ajustes en la web (Admin → Discord → Panel de Discord)

Desde la 2.10.11 el panel tiene **página propia** (`/admin/discord-panel.html`) con menú lateral: **Estado** (conexión, avisos de permisos, accesos rápidos), **Actividad** (canales y eventos del registro, acciones de los usuarios), **Tickets**, **Bienvenidas** y **Comandos propios** (editor y wiki). Si el bot está en varios servidores, un selector elige el servidor para Tickets y Bienvenidas. En Admin → Discord solo queda un resumen con accesos.

Estado del bot, enlace de invitación, canales de registros y de actualizaciones (se **eligen desde la web** o con `/config`, y se pueden quitar), qué categorías de eventos se registran (cuentas, inicios de sesión, archivos, borrados, enlaces, carpetas colaborativas, acciones de admin), si se permiten acciones sobre archivos desde Discord y un botón de mensaje de prueba.

### Privacidad y seguridad del bot

- El token **solo vive en el `.env`**: no se guarda en la base de datos ni se envía al navegador.
- Discord no permite ocultar los campos de un formulario: la contraseña que escribes en `/vincular` **pasa por los servidores de Discord** (la ve el bot, que la comprueba y la descarta; nunca se guarda ni se registra). Si te preocupa, no uses la vinculación o hazla solo desde una cuenta de Discord segura.
- La vinculación limita los intentos como el inicio de sesión (5 fallos = 15 minutos, por persona de Discord y por cuenta) y no revela si un usuario existe. Una cuenta solo puede vincularse a un Discord y viceversa.
- Quien controle una cuenta de Discord vinculada puede usar sus comandos. Por eso `/archivos` y `/buscar` son de solo lectura y las acciones sobre archivos (`/enlaces crear`, `/ia`) se pueden desactivar.
- El canal de registros muestra nombres de archivos y de usuarios: dale acceso solo a quien deba verlos.

## Plugins

Desde la 2.15 SynapseBox admite plugins escritos en Node.js. Un plugin es una carpeta con un `plugin.json` y, según lo que haga, `server.js` (servidor), `client.js` (se carga en todas las páginas) y `style.css`. Pueden sustituir iconos e imágenes (`api.serveFile`), añadir o reemplazar rutas (se montan antes que las de SynapseBox), leer la base de datos, guardar sus propios datos y modificar el HTML de cualquier página.

> ⚠️ **Los plugins tienen acceso total al servidor.** Instala solo los que vengan de fuentes de confianza.

**Admin → Plugins** tiene tres vistas:

- **Instalados:** interruptor para activar o desactivar cada plugin (al instante, sin reiniciar) y botón para desinstalar.
- **Repositorio:** catálogo de [SynapseBox-Puglins](https://github.com/OctavioproYT452/SynapseBox-Puglins/) agrupado por categoría, con sus imágenes. Botón **Descargar** (o **Actualizar**).
- **Subir plugin:** formulario con **título, descripción, categoría, de 1 a 5 imágenes (mínimo una) y archivo(s)**, todo obligatorio (la versión es opcional, por defecto 1.0.0). SynapseBox lo sube con `git` con esta estructura:

```
Categoría/
└── nombre-del-plugin/
    ├── plugin.json      # versión, título, descripción, autor, imágenes, archivos
    ├── images/          # imagen-1.png … imagen-5.png
    └── server.js, client.js, style.css…   # los archivos del plugin
```

**Cómo se sube (sin forks, directo al repositorio principal):** el panel crea una rama en `SynapseBox-Puglins` y abre un **pull request** hacia la rama principal. Hace falta una identidad de GitHub con **permiso de escritura en ese repositorio** (GitHub no permite crear ramas ni PR sin autenticarse):

1. **Vincular cuenta (sin claves en archivos):** en *Subir plugin* pulsa «Vincular GitHub», abre el enlace y escribe el código. Es el flujo por código de dispositivo de una OAuth App; hay que poner su `client_id` (público) en `PLUGINS_GITHUB_CLIENT_ID`. La cuenta vinculada debe ser colaboradora del repositorio; si no, el panel lo indica.
2. **Token en `.env`:** `PLUGINS_GITHUB_TOKEN` con un token *fine-grained* limitado a ese único repositorio (*Contents* y *Pull requests*: Read and write). Con token en `.env` se hace push directo a la rama principal.

`PLUGINS_REPO` cambia el repositorio (por defecto `OctavioproYT452/SynapseBox-Puglins`). Requiere `git` instalado.

Los plugins instalados viven en `data/plugins/` y su estado en `data/plugins-state.json`. La guía completa para crearlos está en la web de documentación de plugins.

## Seguridad

- **Sandbox de archivos (2.16.0)**: toda ruta se comprueba en texto **y en disco** (se resuelven los enlaces simbólicos y se rechaza cualquier ruta cuyo destino real quede fuera de la carpeta del usuario), también en la IA, los enlaces compartidos y las carpetas colaborativas; se rechazan rutas con caracteres de control o de más de 4096 caracteres.
- **Descomprimir** rechaza ZIP con rutas peligrosas (`..`, absolutas, `//`, letras de unidad, caracteres de control, más de 64 niveles o nombres de más de 255 caracteres), vuelve a comprobar en disco cada carpeta que crea, omite enlaces simbólicos, no admite ZIP con contraseña ni ZIP64, comprueba el CRC y limita lo extraído al espacio libre del usuario (protección contra bombas de compresión).
- **Medios de temas**: se valida la extensión y el contenido real del archivo, se sirven aislados (`sandbox`) y solo desde la carpeta *Temas*.

- Contraseñas cifradas con `scrypt` y sal individual.
- Sesiones aleatorias de 256 bits guardadas con hash en la base de datos; cookie `HttpOnly` y `SameSite=Lax` (y `Secure` bajo HTTPS).
- Bloqueo temporal tras 5 intentos fallidos de acceso, también en el segundo factor y en la recuperación de cuenta.
- 2FA con TOTP (RFC 6238): cada código solo se acepta una vez y el paso intermedio del inicio de sesión caduca a los 5 minutos.
- Los códigos de recuperación se guardan solo como hash y se gastan al usarse.
- Protección CSRF mediante comprobación del origen.
- Rutas validadas contra _path traversal_; los archivos de los usuarios nunca se sirven de forma pública sin un enlace.
- Los archivos HTML o de script subidos se sirven aislados (`sandbox`) para que no puedan actuar con la sesión de nadie.
- **WebDAV**: la clave se genera al azar (≈100 bits), solo se guarda su hash, cada usuario solo ve su carpeta (también se comprueban los enlaces simbólicos), hay bloqueo tras 5 intentos fallidos y la cuota se respeta.
- **Bot de Discord** (opcional): token solo en `.env`, vinculación con bloqueo por intentos, comandos de admin comprobados en cada uso, respuestas privadas y registro de actividad sin escribir en disco. Detalles en [Bot de Discord](#bot-de-discord-opcional).
- Cabeceras `Content-Security-Policy`, `X-Content-Type-Options` y `X-Frame-Options`.
- Los enlaces compartidos usan tokens aleatorios, pueden caducar y se pueden proteger con contraseña.

> Recomendación: publícalo siempre detrás de HTTPS.

## Estructura del proyecto

```
.
├── server.js              # Punto de entrada (para npm start, pm2 y systemd): carga src/
├── src/                   # Código del servidor
│   ├── index.js           # Arranque: Express, middleware, rutas y tareas periódicas
│   ├── config.js          # Rutas (data, hosting, public), puerto y duración de sesión
│   ├── version.js         # Comprobación de nuevas versiones
│   ├── services/plugins.js # Plugins: carga, hooks, inyección HTML, catálogo y subida con git
│   ├── routes/plugins.js  # API de administración de plugins
│   ├── discord/script/    # SBScript: analizador (parser.js), intérprete (runtime.js) y funciones (functions.js), HTTP y JSON (httpjson.js), HTTP y JSON (httpjson.js), captcha (captcha.js) y contenido de la wiki (wiki.js)
│   ├── db/                # Base de datos SQLite
│   │   ├── index.js       #   Ayudantes get / all / run / now
│   │   ├── connection.js  #   Apertura (node:sqlite o better-sqlite3)
│   │   ├── schema.js      #   Tablas, columnas y UUID de usuario
│   │   ├── passwords.js   #   Contraseñas con scrypt
│   │   └── migrations.js  #   Migración desde users.json y carpetas antiguas
│   ├── middleware/
│   │   ├── security.js    #   Cabeceras, cuerpo de las peticiones y CSRF
│   │   └── auth.js        #   Sesión y guardas need / needAdmin
│   ├── services/
│   │   ├── auth.js        #   Sesiones, intentos fallidos y validaciones de cuenta
│   │   ├── collab.js      #   Roles, permisos y espacio de cada petición
│   │   ├── twofa.js       #   2FA (TOTP) y códigos de recuperación
│   │   ├── themes.js      #   Validación de temas y generación del CSS
│   │   └── webdav.js      #   Servidor WebDAV (/dav)
│   ├── lib/unzip.js       #   Lector ZIP seguro (descomprimir)
│   ├── lib/env.js         #   Lectura del archivo .env (sin dependencias)
│   ├── routes/
│   │   ├── auth.js        #   Registro, login, sesión, usuario y contraseña
│   │   ├── security.js    #   2FA, códigos de recuperación y recuperación de cuenta
│   │   ├── files.js       #   Archivos: listar, subir, editar, mover, copiar, ZIP…
│   │   ├── shares.js      #   API de enlaces para compartir
│   │   ├── collab.js      #   Carpetas colaborativas: colaboradores y roles
│   │   ├── webdav.js      #   Ajustes de WebDAV de cada usuario
│   │   ├── office.js      #   Conversión de documentos a PDF (LibreOffice) para la vista previa
│   │   ├── share-page.js  #   Páginas públicas /s/<token>
│   │   ├── explore.js     #   Búsqueda, estadísticas, favoritos y recientes
│   │   ├── themes.js      #   Apariencia y comunidad de temas
│   │   ├── admin.js       #   Panel de administración
│   │   ├── ai.js          #   API del agente de IA
│   │   └── discord.js     #   Cuenta vinculada y ajustes del bot de Discord
│   ├── views/
│   │   └── share-helpers.js # HTML y formato de la página compartida
│   ├── lib/
│   │   ├── utils.js       #   sha, esc, cookies, wrap…
│   │   ├── settings.js    #   Ajustes globales (tabla settings)
│   │   ├── paths.js       #   Rutas seguras dentro de la carpeta del usuario
│   │   ├── storage.js     #   Tamaños, cuota, nombres únicos y mover archivos
│   │   ├── serve.js       #   Envío y vista previa aislada de archivos
│   │   └── zip.js         #   Generador ZIP en streaming (sin dependencias)
│   ├── discord/           # Bot de Discord (opcional, solo con DISCORD_TOKEN)
│   │   ├── index.js       #   Conexión, registro de comandos y estado
│   │   ├── commands.js    #   Comandos de barra y formulario de vinculación
│   │   ├── activity.js    #   Middleware: qué hizo cada usuario (sin guardar nada)
│   │   ├── logger.js      #   Cola en memoria y envío agrupado al canal de registros
│   │   ├── updates.js     #   Aviso de versiones nuevas
│   │   └── store.js       #   Vínculos y ajustes en la base de datos
│   └── ai/                # Agente de IA (Grok/OpenAI/Gemini/Ollama) y consultas de un turno para SBScript (ask.js)
│       ├── index.js       #   API pública del módulo
│       ├── config.js      #   Configuración guardada en la base de datos
│       ├── validate.js    #   Validación de URL, modelo, clave y límites
│       ├── limits.js      #   Límites de uso por usuario
│       ├── llm.js         #   Cliente del proveedor y prueba de conexión
│       ├── tools.js       #   Herramientas con sandbox (confinadas a la carpeta del usuario)
│       ├── chat.js        #   Bucle de conversación
│       └── constants.js   #   Constantes
├── tools/                 # Utilidades de terminal
│   ├── setup-ai.js        #   Asistente de configuración de la IA (lo ejecuta el instalador)
│   └── reset-password.js  #   Recuperación de cuentas
├── scripts/               # Instaladores
│   ├── unix/              #   Linux y macOS
│   │   ├── install.sh
│   │   └── lib/           #     common.sh, node.sh
│   └── windows/           #   Windows
│       ├── install.ps1
│       ├── install.bat    #     Doble clic
│       └── lib/           #     common.ps1, node.ps1
├── get.sh / get.ps1       # Instalación en una línea (git + clonar + instalar)
├── .env.example           # Plantilla de configuración (se copia a .env, que no se sube a GitHub)
├── public/
│   ├── index.html         # Inicio de sesión, registro y recuperación
│   ├── panel.html         # Panel del usuario
│   ├── js/bgmedia.js      # Capa de fondo con imagen/GIF/vídeo y botones con imagen
│   ├── vendor/            # pdf.js y JSZip (incluidos, sin depender de Internet)
│   ├── themes.html        # Comunidad de temas
│   ├── admin/             # Panel de administración
│   ├── js/                # common.js, auth.js, bg.js, menu.js, nav.js, viewer.js, codeview.js (resaltador, lector y editor de código), webdav.js, security.js, panel.js, admin.js, ai.js
│   ├── auth.css           # Animaciones del inicio de sesión
│   ├── style.css          # Sistema de diseño compartido
│   └── icons.svg          # Iconos SVG
├── hosting/               # Archivos de los usuarios (una carpeta por usuario, nombrada con su UUID)
└── data/                  # Base de datos SQLite (se crea sola) y version.json
```

## API

Todas las rutas `/api/*` devuelven JSON y requieren sesión, salvo `login`, `register` y `session`.

| Método | Ruta | Descripción |
| --- | --- | --- |
| `POST` | `/api/register`, `/api/login`, `/api/login/2fa`, `/api/logout` | Cuenta y sesión (el registro pide la contraseña dos veces y devuelve los códigos de recuperación; `login/2fa` completa el inicio de sesión con el código TOTP). |
| `GET`/`POST` | `/api/security`, `/api/2fa/setup`, `/api/2fa/enable`, `/api/2fa/disable`, `/api/recovery/regenerate` | 2FA (TOTP) y códigos de recuperación de la cuenta propia. |
| `GET`/`POST`/`DELETE` | `/api/admin/plugins`, `/api/admin/plugins/:id/toggle`, `/api/admin/plugins/market`, `/api/admin/plugins/market/install`, `/api/admin/plugins/publish` | Plugins (solo admin): instalados, activar/desactivar, catálogo, descargar y subir al repositorio. |
| `POST` | `/api/recover/check`, `/api/recover` | Recuperar usuario y contraseña con un código de recuperación (sin sesión). |
| `GET` | `/api/session` | Estado de la sesión. |
| `POST` | `/api/password`, `/api/username` | Cambiar contraseña y nombre de usuario. |
| `GET` | `/api/list?path=` | Listar una carpeta. Con `collab=<id>` (también en las demás rutas de archivos) actúa dentro de una carpeta compartida contigo, según tu rol. |
| `GET` | `/api/search?q=`, `/api/recent`, `/api/favs` | Búsqueda, recientes y favoritos. |
| `POST` | `/api/mkdir`, `/api/create-file`, `/api/upload` | Crear y subir. |
| `POST` | `/api/rename`, `/api/move`, `/api/copy`, `/api/delete`, `/api/edit`, `/api/fav` | Operaciones sobre elementos. |
| `GET` | `/api/download`, `/api/preview`, `/api/zip`, `/api/file-content` | Lectura y descarga. |
| `POST` / `GET` | `/api/share`, `/api/shares`, `/api/share/revoke` | Enlaces compartidos. |
| `GET` / `POST` | `/api/trash`, `/api/trash/restore`, `/api/trash/delete`, `/api/trash/empty` | Papelera de reciclaje. |
| `GET` | `/api/stats` | Espacio por tipo, carpetas más pesadas y archivos antiguos. |
| `GET` | `/api/cleanup` | Archivos más grandes y duplicados. |
| `GET` | `/api/collab/shared` | Carpetas que otros han compartido conmigo (dueño y rol). |
| `GET` / `POST` | `/api/collab/folder`, `/api/collab/add`, `/api/collab/role`, `/api/collab/remove`, `/api/collab/mine`, `/api/collab/roles` | Gestión de colaboradores (dueño); `remove` también permite abandonar una carpeta compartida. |
| `GET` / `POST` | `/api/theme` | Tema activo del usuario. |
| `GET` / `POST` / `DELETE` | `/api/themes` | Temas propios guardados (Mis temas). |
| `POST` / `GET` | `/api/themes/publish`, `/api/community`, `/api/community/save`, `/api/community/unpublish` | Comunidad de temas. |
| `POST` | `/api/compress`, `/api/extract` | Comprimir elementos en un ZIP dentro de la propia carpeta y descomprimir un ZIP en una carpeta nueva. |
| `GET` / `POST` / `DELETE` | `/api/theme-media`, `/tm/<uuid>/<archivo>` | Medios del tema (carpeta *Temas*): listar, subir, borrar y servir. |
| `GET` | `/api/convert` | Convierte un documento de Office a PDF con LibreOffice para la vista previa (501 si no está instalado). |
| `GET` / `POST` | `/api/webdav`, `/api/webdav/enable`, `/api/webdav/disable` | Estado, activación (pide la contraseña y devuelve la clave una sola vez) y desactivación del acceso WebDAV. |
| `*` | `/dav/*` | Servidor WebDAV (Basic: tu usuario y la clave WebDAV). |
| `GET` | `/api/stats` | Uso de espacio por tipo. |
| `GET` / `POST` | `/api/ai/status`, `/api/ai/chat` | Agente de IA (404 si está desactivada). |
| `GET` / `POST` | `/api/discord`, `/api/discord/unlink` | Estado de tu cuenta de Discord vinculada y desvinculación. |
| `*` | `/api/admin/*` | Administración (solo admins), incluidas `/api/admin/ai` y `/api/admin/discord` (ajustes, quitar canal, mensaje de prueba). |

## Despliegue en producción

### Con PM2

```bash
npm install -g pm2
TRUST_PROXY=1 pm2 start server.js --name synapsebox
pm2 save && pm2 startup
```

### Con systemd

```ini
# /etc/systemd/system/synapsebox.service
[Unit]
Description=SynapseBox
After=network.target

[Service]
WorkingDirectory=/opt/synapsebox
ExecStart=/usr/bin/node server.js
Environment=PORT=3001 TRUST_PROXY=1
Restart=always
User=synapsebox

[Install]
WantedBy=multi-user.target
```

### Proxy inverso con Nginx

```nginx
server {
    server_name nube.ejemplo.com;
    client_max_body_size 0;          # sin límite de subida (la cuota la controla la app)

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_request_buffering off;
    }
}
```

Añade HTTPS con Certbot o usa Caddy, que lo configura solo.

## Copias de seguridad

Todo el estado de la aplicación está en dos carpetas:

- `data/` → base de datos (usuarios, sesiones, enlaces, favoritos y ajustes).
- `hosting/` → archivos de los usuarios (una carpeta por UUID; la relación UUID ↔ nombre está en la base de datos, así que guarda ambas carpetas juntas).

Con el servidor parado, copia ambas carpetas. Para restaurar, devuélvelas a su sitio.

## Migrar desde la versión 1

Si tienes un `data/users.json` de la versión anterior, se importa solo al primer arranque: los usuarios, sus cuotas y roles se conservan, y las contraseñas en texto plano se cifran. El archivo original se renombra a `users.json.migrado`.

Las carpetas de usuario pasan a nombrarse con su UUID (se renombran solas al arrancar).

Los enlaces antiguos (`/share/usuario/ruta` y `/files/...`) dejan de funcionar por seguridad: vuelve a compartir los elementos para generar enlaces nuevos.

## Solución de problemas

| Problema | Solución |
| --- | --- |
| `Cannot find module 'better-sqlite3'` | Usa Node 22.13+ o ejecuta `npm install` con herramientas de compilación disponibles. |
| Las subidas grandes fallan tras un proxy | Aumenta `client_max_body_size` en Nginx o su equivalente. |
| Todos los usuarios aparecen con la misma IP | Arranca con `TRUST_PROXY=1` si usas proxy inverso. |
| «Credenciales inválidas» con cuentas de la versión 1 | Comprueba que `data/users.json` estaba en la carpeta al primer arranque (la consola indica cuántos usuarios se importaron). Si no, crea o recupera la cuenta con `node tools/reset-password.js <usuario> <contraseña> --admin`. |
| Olvidé la contraseña o el usuario | En el login pulsa «¿Olvidaste tu usuario o contraseña?» e introduce uno de tus códigos de recuperación (Menú de usuario → Seguridad). Si no los tienes: Otro administrador puede restablecerla desde el panel, o ejecuta `node tools/reset-password.js <usuario> <nueva-contraseña>` en el servidor. Sin argumentos, el comando lista los usuarios existentes. |
| El ZIP de una carpeta falla | El límite es 4 GB por ZIP y 65 000 archivos. |

## Créditos

- **Autor:** Jesús Octavio Olivera Silva
- **Co-Owner:** [TwisSpark](https://github.com/TwisSpark)

¿Encontraste un fallo o tienes una idea? Abre un _issue_ o un _pull request_.

## Licencia

Distribuido bajo la licencia [MIT](LICENSE).

