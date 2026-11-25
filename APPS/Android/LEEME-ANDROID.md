# SynapseBox para Android

App oficial para Android 7.0 (API 24) y posteriores, **incluido Android 16** (compileSdk/targetSdk 36).
Necesita un servidor SynapseBox **2.24.1 o superior** (trae la API de sincronización y el token Bearer).

## Qué hace
- **Configuración inicial del servidor:** la primera vez eliges cómo encontrarlo: escribiendo su **URL** (dominio, o IP:puerto), **buscándolo en la red local** (la app prueba todas las IP de tu Wi-Fi en los puertos que indiques, por defecto 3001, 3000 y 8080, y reconoce a SynapseBox) o con **IP y puerto a mano**. Se comprueba la conexión antes de seguir y se puede cambiar desde el inicio de sesión. Sin «http://»/«https://», las IP y nombres de red local usan http y los dominios de Internet https.
- **Pantalla de inicio** con tu espacio usado, el estado de la sincronización y accesos rápidos; diseño renovado (Material 3, cabeceras con degradado, tarjetas).
- **Crear cuenta desde la app** si el servidor tiene el registro abierto (se muestran una sola vez los códigos de recuperación).
- **Compatible con ngrok:** si la dirección es de ngrok, todas las llamadas a la API llevan la cabecera `ngrok-skip-browser-warning: true`, el panel (WebView) la envía en cada navegación y usa un User-Agent propio, y las descargas también la llevan, así que no aparece la página de aviso. «Abrir en el navegador» la pasa como cabecera extra; si tu navegador la ignora, pulsa «Visit Site» una vez.
- **Subir archivos:** botón «Subir archivos del teléfono» en el inicio y la app aparece en **Compartir** de cualquier otra app; los archivos van a la carpeta «Subidas del móvil» (si existe uno con el mismo nombre, se sobrescribe).
- **Actualizaciones desde GitHub:** la app mira (una vez al día y a mano, en Inicio → «Buscar actualizaciones») la carpeta `APPS/Android` de la rama `main` de `OctavioproYT452/SynapseBox`, elige el `SynapseBox-vX.Y.Z.apk` de versión más alta y, si es mayor que la instalada, manda una notificación (una vez por versión; se puede desactivar). Desde esa pantalla descarga el APK y abre el instalador de Android (la primera vez pide permitir «Instalar apps desconocidas»). Para publicar una actualización basta subir el nuevo APK a esa carpeta con el nombre `SynapseBox-vX.Y.Z.apk`. **Importante:** Android solo actualiza si el APK nuevo está firmado con la misma clave que el instalado; firma siempre con el mismo keystore. La versión que se compara es `versionName`.
- **Panel completo dentro de la app:** inicias sesión una vez y se abre el panel web de SynapseBox con tu sesión (archivos, compartir, papelera, temas, IA, administración…). Todo lo que haces en el navegador lo haces en la app.
- **Carpeta sincronizada** (Inicio → «Configurar»): eliges (o creas) una carpeta del teléfono —interna o en la tarjeta SD— y una carpeta de tu SynapseBox, y se mantienen iguales.
  - Modos: bidireccional, solo subir (copia de seguridad) y solo bajar (espejo).
  - **Qué sincronizar:** «copiar todo lo actual y después los cambios», «solo copiar lo actual una vez y detenerse» o «solo los cambios a partir de ahora» (ignora lo que ya existía). Además puedes activar o desactivar por separado: archivos **nuevos**, **modificados**, **borrados** y **carpetas** (crear/borrar, también vacías). La copia inicial nunca borra. «Reiniciar sincronización» repite la copia inicial.
  - Conflictos (cambió en los dos lados): se conserva tu copia como «nombre (conflicto fecha)» y se baja la del servidor.
  - Borrados: se propagan (opcional). En el servidor van a su papelera; en el teléfono a la carpeta oculta `.sync-trash` (30 días).
  - Seguridad: si la carpeta local o la remota aparecen de repente vacías, la sincronización se cancela en vez de borrar.
- **Funciones avanzadas según el servidor (SynapseBox 2.25+):** la app pregunta al servidor qué soporta (`/api/client/info`) y las usa solo si existen; con un servidor antiguo sigue funcionando como antes. Subida **reanudable** por trozos con comprobación SHA-256 para archivos de más de 8 MB, **renombrados y movimientos** sin volver a subir ni bajar, **borrado por lotes** a la papelera y descargas que continúan con `Range`. En Inicio se ve la versión del servidor.
- **Segundo plano:** WorkManager con intervalo a elegir (15 min – 1 día), solo Wi-Fi / solo cargando, reintentos, y se reprograma tras reiniciar. Mientras busca cambios o sube/baja archivos muestra una notificación con barra de progreso animada (indeterminada al buscar, con porcentaje y el archivo actual después) que desaparece sola al terminar. Botón para excluir la app del ahorro de batería.
- **Acceso a todos los archivos:** Android 11+ → permiso «Acceso a todos los archivos»; Android 7–10 → permiso de almacenamiento. Sin él no se puede sincronizar una carpeta elegida libremente.
- **Seguridad:** el token se guarda cifrado con el Android Keystore (AES-GCM); admite 2FA; avisa si usas `http://`.

## Novedades 1.7.0

- **Archivos de usuarios (solo administradores):** nueva sección en Inicio → *Administración*. Lista los usuarios (espacio usado, admin, suspendido); al pulsar uno se navega por sus carpetas y archivos, con filtro por nombre. Pulsar (o mantener pulsado) un elemento permite **Ver** (se abre con otra app), **Descargar** (eliminar y descargar guardan donde elijas) y **Eliminar** (va a la papelera de ese usuario). **No** crea, modifica ni renombra nada. Usa `/api/admin/files`, `/api/admin/file` y `/api/admin/delete-file`, que el servidor solo permite a administradores; la opción se oculta a cuentas normales. Las carpetas no se pueden descargar enteras.
- **Nuevo diseño de Inicio:** mosaicos con iconos (Subir, Mis archivos, Sincronizar, Configurar, Más funciones, Apariencia, Seguridad, Actualizaciones), secciones con título y espacio usado destacado. Iconos SVG nuevos (`ic_users`, `ic_file`, `ic_sync`, `ic_upload`, `ic_palette`, `ic_shield`, `ic_grid`, `ic_update`, `ic_eye`, `ic_admin`).

## Novedades 1.6.1

- Los emojis de la interfaz (estado, sincronización, registro, diagnóstico, «Volver») se han sustituido por iconos vectoriales SVG que toman el color del texto (`res/drawable/ic_*.xml`, clase `Ic`).

## Novedades 1.6.0

- **Más funciones**: registro de actividad (ver/copiar/borrar), exclusiones de sincronización (`*.tmp`, `node_modules`…), tamaño máximo de archivo, avisos al terminar/por errores, pausa de 1/8/24 h, carpeta de subidas configurable (sin pisar archivos), vaciar la papelera local y diagnóstico (conexión, versión, sesión, permisos).
- **Apariencia** (solo en la app): modo claro/oscuro/sistema, negro AMOLED, color de acento (Material You en Android 12+), cabecera degradada/lisa/compacta y redondeo de esquinas.
- **Seguridad**: bloqueo con el PIN/patrón/huella del teléfono (con tiempo de gracia), ocultar contenido en recientes y capturas, solo HTTPS (permite red local), lista y cierre de sesiones, cambio de contraseña, borrar datos locales.
- **Arreglos**: el panel web ya solo abre enlaces http/https/mailto/tel; la cookie de sesión no se envía a otros sitios en las descargas; se limpia la caché al cerrar sesión; la carpeta remota ya no se comprueba en cada pasada; las subidas no sobrescriben archivos con el mismo nombre.
- **Actualizaciones**: si junto a `SynapseBox-vX.Y.Z.apk` hay un `SynapseBox-vX.Y.Z.apk.sha256`, se verifica antes de instalar.

## Compilar
- **En el propio móvil (Termux, sin root):** ver `COMPILAR-EN-TERMUX.md`.
- **Sin PC ni móvil potente:** sube la carpeta a GitHub y ejecuta el flujo `.github/workflows/android.yml`.
Requisitos: Android Studio (Narwhal o posterior) o JDK 17 + Android SDK con la plataforma **36**.

1. Abre esta carpeta en Android Studio (genera solo el _wrapper_ de Gradle) y pulsa ▶ para instalar en un móvil.
2. Por terminal (con Gradle 8.11 o superior instalado): `gradle wrapper` y después `./gradlew assembleDebug` → `app/build/outputs/apk/debug/app-debug.apk`.
3. APK de release firmado: crea un keystore (`keytool -genkeypair -v -keystore synapsebox.jks -alias synapsebox -keyalg RSA -keysize 2048 -validity 10000`), copia `keystore.properties.example` a `keystore.properties`, rellénalo y ejecuta `gradle assembleRelease`.

## Uso rápido
1. Abre la app → dirección del servidor (`https://…`), usuario y contraseña (o «Crear una» cuenta si el servidor lo permite; código 2FA si lo tienes).
2. Inicio → Sincronización → **Configurar** → «Dar acceso a todos los archivos» → elige la carpeta del teléfono y la remota → activa «Sincronizar en segundo plano».
3. Recomendado: «Evitar que el ahorro de batería la detenga» y permitir notificaciones.

## Limitaciones conocidas
- La búsqueda en red local solo recorre la subred del teléfono (como mucho 1022 equipos) y no funciona con servidores en otra red, con VPN o si el router aísla los dispositivos Wi-Fi («aislamiento de clientes»). En Android 16+ el sistema puede pedir el permiso de red local.
- No se admiten certificados HTTPS autofirmados (usa uno válido, p. ej. Let's Encrypt o un túnel).
- Las descargas `blob:` del panel web y la subida de carpetas enteras desde el panel no funcionan en el WebView (para subir carpetas usa la sincronización).
- En Android 15+ los servicios de tipo «sincronización de datos» tienen un límite de tiempo por día: la app lo respeta y reanuda en la siguiente pasada.
- Proyecto entregado sin compilar ni probar en dispositivos: al abrirlo por primera vez Android Studio puede pedir actualizar versiones de Gradle/AGP.
