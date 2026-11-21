# Versión 2.25.0

Más API para las apps nativas (Android, y próximamente Windows y Linux).

- **`GET /api/client/info`** (con o sin sesión): nombre, versión, nivel de API (`api`), lista de funciones (`features`), si el registro está abierto y si hay mantenimiento. Con token añade usuario, cuota y límites. Las apps lo usan para saber qué soporta el servidor.
- **Subida reanudable** (`POST /api/sync/upload`, `PATCH|GET|DELETE /api/sync/upload/:id`, `POST …/commit`): archivos grandes por trozos que se pueden continuar tras un corte; `commit` admite `sha256` para comprobar la integridad. Las subidas sin terminar caducan a las 24 h.
- **`POST /api/sync/move`** (`{from,to}`): mover o renombrar sin volver a subir (para detectar renombrados en el cliente).
- **`POST /api/sync/delete-batch`** (`{paths:[…]}`, hasta 500): borrado por lotes a la papelera, con resultado por ruta.
- **`GET /api/sync/hash?path=`**: SHA-256 de un archivo del servidor.
- **`GET /api/sync/tree`** admite `since=<ms>` (solo archivos modificados después) y `dirs=0` (sin carpetas), y devuelve `serverTime`.
- **Actualizaciones de las apps:** el administrador publica por plataforma (`android`, `windows`, `linux`, `macos`) versión, URL https, SHA-256, notas y versión mínima con `PUT /api/admin/client-updates`; las apps preguntan en `GET /api/client/update?platform=&version=` (sin sesión) y reciben `update_available` y `mandatory`.
- CORS para apps con WebView: se permiten `PATCH` y la cabecera `Upload-Offset`.
- Los errores de la API pueden devolver 404/409 (antes todo era 400).
