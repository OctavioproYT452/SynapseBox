# Versión 2.21.1

Esta versión reúne los cambios de 2.20.0, 2.21.0 y 2.21.1 (las dos primeras no se publicaron por separado). No se ha quitado nada.

## Almacenamiento con varios discos (Administración → Almacenamiento)
- Añade discos o carpetas **internos o externos** (USB, segundo disco, montaje de red) con nombre, tipo y tope de uso en GB. «Principal» es la carpeta `hosting/` de siempre y no se puede quitar.
- Se detectan los discos montados y un botón «Usar» rellena la ruta. La ruta se valida: absoluta, escribible, fuera de carpetas del sistema y de SynapseBox, y sin solaparse con otro disco.
- **Política para usuarios nuevos:** llenar en orden, el disco con más espacio libre o repartir por número de usuarios, con reserva libre mínima por disco. Un disco puede marcarse «no acepta nuevos».
- **Usuarios:** la tabla muestra en qué disco está cada cuenta. Al crear un usuario se puede elegir disco, y en Editar se puede **mover** a otro (copia, comprueba y borra el original; su carpeta queda bloqueada mientras tanto).
- Un disco no se puede quitar mientras tenga usuarios; quitarlo de la lista no borra archivos. Si un disco externo se desconecta se marca «SIN CONEXIÓN». La papelera sigue en `data/trash`.

## Ajustes avanzados (Administración → Avanzado)
- **Modo mantenimiento** con mensaje: solo los administradores usan la API (no afecta a WebDAV ni a los enlaces compartidos).
- **Máximo de usuarios** (registro público), **duración de la sesión** (1-90 días) y **longitud mínima de contraseña** (8-64).
- **Copia de seguridad:** descarga de una copia consistente de la base de datos (usuarios, ajustes, enlaces, discos, anuncios…). No incluye los archivos de los usuarios y contiene hashes de contraseñas: guárdala en un sitio seguro.
- **Registro de actividad de administración:** anota cada cambio hecho desde el panel de administración (administrador, acción, usuario afectado e IP). Se guarda 90 días con un máximo de 5000 entradas.
  - Se puede **activar o desactivar** para reducir escrituras en disco (SSD, tarjetas SD, USB). Al desactivarlo no se anota nada nuevo y lo ya guardado se conserva. Viene activado por defecto.
  - Botón **Vaciar registro**.

## Cuenta de cada usuario (Seguridad de la cuenta)
- **Mis sesiones abiertas:** lista de dispositivos con la cuenta abierta (IP, navegador y fecha), con botón para cerrar cada una o todas las demás.

## API
- `GET/POST /api/admin/disks`, `POST/DELETE /api/admin/disks/:id`, `POST /api/admin/users/:id/disk`.
- `GET/POST /api/admin/advanced`, `GET /api/admin/backup`, `GET /api/admin/audit`, `POST /api/admin/audit/clear`.
- `GET /api/sessions`, `POST /api/sessions/revoke` (`{ id }` o `{ others: true }`).
