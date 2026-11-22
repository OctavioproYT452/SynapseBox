# SynapseBox para Linux

Cliente de escritorio (GTK 4, escrito en Rust) para tu servidor SynapseBox 2.23 o superior: inicio de sesión y registro, espacio usado, **sincronización de una carpeta** y actualizaciones propias. Se distribuye como **código fuente** (`.tar.gz`): cada PC lo compila para sí mismo con las optimizaciones de su procesador (`-C target-cpu=native`, LTO), así que arranca rápido y consume poco.

## Instalar

1. Dependencias de compilación (una sola vez):
   - Debian / Ubuntu / Mint: `sudo apt install build-essential pkg-config libgtk-4-dev cargo`
   - Fedora: `sudo dnf install gcc pkgconf-pkg-config gtk4-devel cargo`
   - Arch: `sudo pacman -S base-devel gtk4 rust`
   - openSUSE: `sudo zypper install gcc pkg-config gtk4-devel cargo`
   - Si tu `cargo` es anterior a 1.80, instala Rust desde <https://rustup.rs>.
2. Descomprime y ejecuta el instalador:
   ```bash
   tar -xzf SynapseBox-v1.0.0.tar.gz
   cd synapsebox-linux-1.0.0
   ./install.sh              # para tu usuario (~/.local), sin sudo
   ```
   La primera compilación descarga las librerías de Rust y tarda unos minutos. Para todos los usuarios: `sudo ./install.sh --prefix /usr/local`.
3. Abre **SynapseBox** desde el menú de aplicaciones (o `synapsebox-linux`). Si no ves el comando, añade `~/.local/bin` a tu `PATH`.

## Usar

- **Iniciar sesión:** escribe la dirección del servidor (`https://nube.ejemplo.com`, `192.168.1.20:3001` o un enlace de ngrok), usuario y contraseña. Si el servidor tiene el registro abierto aparece **Crear una**; al registrarte se muestran los códigos de recuperación (solo una vez). La sesión se guarda como token en `~/.config/synapsebox/config.json` (permisos 0600).
- **Sincronización:** elige la carpeta del PC y (opcional) la carpeta de SynapseBox. Opciones: dirección (bidireccional, solo subir, solo bajar); estrategia (copiar todo lo actual y luego los cambios · solo copiar lo actual una vez y detenerse · solo los cambios desde ahora); y por separado archivos nuevos, modificados, borrados y carpetas. La copia inicial nunca borra; lo borrado en el PC por la sincronización va a `.sync-trash` (30 días) y lo borrado en el servidor, a su papelera. Los conflictos se guardan como `nombre (conflicto fecha).ext`.
- **Con servidor 2.25 o superior** usa además subida reanudable con comprobación SHA-256 (archivos de más de 8 MB), renombrados sin volver a copiar, borrado por lotes y descargas reanudables. Con uno anterior sigue funcionando sin esas ventajas.
- **Segundo plano:** con la ventana abierta sincroniza cada X minutos. Para que siga con la ventana cerrada, pulsa **Activar servicio** (Sincronización) o instala con `./install.sh --service`; es un servicio de usuario de systemd (`systemctl --user status synapsebox-sync`).
- Sin interfaz: `synapsebox-linux --sync-once`, `--daemon`, `--check-update`, `--update`, `--version`.

## Actualizar

La app mira la carpeta **`APPS/Linux`** de la rama `main` de `OctavioproYT452/SynapseBox`, elige el `SynapseBox-vX.Y.Z.tar.gz` de versión más alta y, si es mayor que la instalada, avisa con una notificación (una vez al día; se puede desactivar). En **Actualizaciones** → *Descargar, compilar e instalar* la app descarga el paquete, lo compila en tu PC y se reinstala donde estaba (si es una instalación del sistema en `/usr/local`, te da el comando con `sudo`). También: `synapsebox-linux --update`. Después, cierra y vuelve a abrir la app.

## Publicar una versión nueva (para ti)

1. Sube la versión en `Cargo.toml`.
2. `./make-release.sh` crea `dist/SynapseBox-vX.Y.Z.tar.gz`.
3. Súbelo a `APPS/Linux/` en GitHub (rama `main`). Con eso las apps instaladas lo detectan.

## Desinstalar

`./uninstall.sh` (añade `--purge` para borrar también ajustes y estado; tus archivos no se tocan).

## Notas

- La interfaz es de escritorio con barra lateral; no incluye icono en la bandeja del sistema (GTK 4 no lo ofrece): para seguir sincronizando con la ventana cerrada usa el servicio.
- No se ha podido compilar en el entorno donde se escribió: si `./install.sh` muestra errores, cópialos tal cual para corregirlos.
