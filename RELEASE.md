# Versión 2.26.0

- **Por tipo (nuevo):** botón en el panel que lista tus archivos de un tipo (imágenes, vídeo, audio, documentos, comprimidos). API `GET /api/by-type?type=`.
- **Carpetas vacías (nuevo):** botón que lista las carpetas sin contenido. API `GET /api/empty-folders`. No borra nada.
- **`/api/health`:** devuelve también `uptime` y `time`, útil para monitorizar el servidor.
- **API para apps:** `api` sube a 4 y `/api/client/info` anuncia `by-type` y `empty-folders`.
- **README:** instalación y ubicación de las apps de escritorio (Windows: binarios en `APPS/Windows/dist`, código en `APPS/Windows`) y las APIs nuevas documentadas.
