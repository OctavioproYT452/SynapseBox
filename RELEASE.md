# Versión 2.22.0

## Compatible con Docker
- Nuevos `Dockerfile`, `docker-compose.yml` y `.dockerignore`: `docker compose up -d --build` y listo.
- Imagen basada en Node 22 (usa `node:sqlite`), usuario no root (uid 1000), `HEALTHCHECK` sobre `/api/health`, cierre ordenado con `tini` y `git` incluido para los plugins. LibreOffice opcional con `--build-arg INSTALL_LIBREOFFICE=1`.
- Volúmenes `/app/data`, `/app/hosting` y `/disks`: los discos extra del panel de Almacenamiento se montan en `/disks/<nombre>` y se añaden con esa ruta.
- Guía en el README (sección «Con Docker»).
