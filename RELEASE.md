# Versión 2.16.4

Los plugins ya no flotan sobre la pantalla: ahora tienen su propia sección de configuración en la administración.

## Corrección
- **La pestaña «Extensiones» no aparecía** si entrabas a la administración por `/admin` o `/admin/` (solo funcionaba con `/admin/index.html`). Ahora funciona con cualquiera de las tres direcciones.

## Plugins
- **Nueva pestaña «Extensiones»** en Administración. Cada plugin activo puede registrar allí su sección con `SynapseBox.admin({ id, title, render(el, helpers) })` (en el `client.js`). La pestaña solo aparece si hay plugins que la usen. Los ayudantes (`head`, `fld`, `chk`, `esc`, `toast`, `api`, `dialog`, `yes`, `ic`, `fmt`) se pasan a `render`.
- Al activar un plugin desde «Plugins» hay que recargar la página para ver su sección (el aviso lo indica).
- Se actualizaron los plugins del repositorio: los botones flotantes (Bloqueo por IP, Modo mantenimiento) pasaron a «Extensiones»; el reloj sigue flotando pero con 8 diseños y ajustes; y hay plugins nuevos.
