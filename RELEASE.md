# Versión 2.19.0

Seguridad reforzada y **anuncios para usar la IA** (sin dominio propio y con retirada de dinero en el servicio que elijas). No se ha quitado nada.

## Anuncios para usar la IA (Administración → IA → «Anuncios»)
- **Dos ámbitos independientes:** mensajes al asistente del panel y ejecuciones de comandos de Discord que usan `$ai…`. Cada uno puede ir en modo **Sin anuncios**, **Por uso** (cada anuncio da N mensajes/ejecuciones) o **Por tiempo** (cada anuncio da N minutos de acceso, como el «host por anuncios» de BDFD, acumulable hasta 7 días).
- **Sin dominio:** *Acortador con API* (ShrinkMe, GPLinks, ShrinkEarn, ouo.io… con plantillas editables) o *Enlace directo* (Direct Link/smartlink de Adsterra, Monetag…). Los cobros y retiros los gestiona el servicio; SynapseBox solo muestra el anuncio y valida que se esperó. Comprueba condiciones y mínimos de pago en cada web.
- **Reglas anti-abuso:** tiempo mínimo viendo el anuncio (validado en el servidor), un solo uso por enlace, caducidad, pausa entre anuncios, máximo diario por persona, límite por IP y los administradores pueden quedar exentos. Si la IA falla, el crédito se devuelve.
- **Discord:** el enlace del anuncio llega en el propio mensaje de error del comando. Con cuenta vinculada el crédito es de la cuenta; si no, de la persona de Discord.
- Nueva URL pública del servidor (obligatoria para Discord y acortadores): puede ser `https://IP:puerto` o un túnel. También vale la variable `PUBLIC_URL`.
- Límite conocido: sin postback del servicio, un usuario decidido puede abrir el enlace de retorno tras esperar el mínimo sin completar el acortador; el tiempo mínimo y los topes diarios lo limitan.

## Seguridad
- Cabeceras nuevas: `Permissions-Policy`, `Cross-Origin-Opener/Resource-Policy`, `Strict-Transport-Security` (solo HTTPS), CSP con `frame-ancestors`, `form-action` y `connect-src`; `Cache-Control: no-store` en toda la API.
- CSRF: también se rechazan peticiones sin `Origin` marcadas por el navegador como `cross-site`.
- Inicio de sesión: coste constante para usuarios inexistentes (no se pueden enumerar por tiempos), límite adicional por IP y tope de longitud de credenciales.
- Anuncios: SSRF bloqueado (solo https, sin redes internas, sin redirecciones), tokens aleatorios guardados como hash.
