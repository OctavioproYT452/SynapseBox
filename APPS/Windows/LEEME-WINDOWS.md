# SynapseBox para Windows

Cliente para Windows 10/11 (64 bits) de tu servidor SynapseBox 2.23 o superior, escrito en Rust. Son dos programas que comparten ajustes y sesión:

- **`synapsebox.exe`** — ventana con iconos SVG: inicio de sesión y registro, espacio usado, subir archivos, **sincronización de una carpeta**, sesiones, contraseña y actualizaciones.
- **`sbox.exe`** — línea de órdenes con **todas** las funciones (ver más abajo).

Se compila **desde Debian 13 con solo la terminal** (compilación cruzada con mingw-w64) y se instala en Windows con un script de PowerShell. No hace falta tener Windows para compilarla.

## Compilar desde Debian 13 (solo terminal)

```bash
# código fuente en el repositorio: APPS/Windows
git clone --depth 1 https://github.com/OctavioproYT452/SynapseBox.git
cd SynapseBox/APPS/Windows
./build-windows.sh
# (o, con el zip que recibiste: unzip SynapseBox-Windows_1.3.0.zip && cd windows && ./build-windows.sh)
```

El script hace, por ti, esto (puedes copiarlo a mano si prefieres):

```bash
# 1) paquetes del sistema
sudo apt update
sudo apt install -y build-essential pkg-config curl ca-certificates zip unzip mingw-w64
# 2) mingw con hilos «posix» (obligatorio para Rust; Debian trae «win32» por defecto)
sudo update-alternatives --set x86_64-w64-mingw32-gcc /usr/bin/x86_64-w64-mingw32-gcc-posix
sudo update-alternatives --set x86_64-w64-mingw32-g++ /usr/bin/x86_64-w64-mingw32-g++-posix
# 3) Rust con el destino de Windows (rustup; el «rustc» de apt no trae la librería estándar de Windows)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
. "$HOME/.cargo/env"
rustup target add x86_64-pc-windows-gnu
# 4) compilar (el destino ya está fijado en .cargo/config.toml)
cargo build --release
#    → target/x86_64-pc-windows-gnu/release/synapsebox.exe  y  sbox.exe
```

Al terminar, `dist/SynapseBox-Windows-v1.3.0.zip` contiene los dos `.exe`, `install.ps1`/`install.cmd`, `uninstall.ps1` y este archivo. Opciones: `--skip-deps` (ya tienes todo instalado) y `--debug` (compilación rápida para probar). La primera compilación descarga las librerías y tarda unos minutos.

Si algo falla, copia el error tal cual (las últimas 30 líneas de `cargo build`) para corregirlo.

## Instalar en Windows

1. Copia `dist/SynapseBox-Windows-v1.3.0.zip` a tu PC con Windows (por ejemplo con `scp`), descomprímelo.
2. Doble clic en **`install.cmd`** (o en PowerShell: `powershell -ExecutionPolicy Bypass -File install.ps1`). Se instala para tu usuario en `%LOCALAPPDATA%\Programs\SynapseBox` (sin administrador), crea el acceso directo **SynapseBox** en el menú Inicio y añade `sbox` al PATH. Con `-Service` activa también la sincronización en segundo plano.
3. Abre **SynapseBox** y escribe la dirección de tu servidor (`https://nube.ejemplo.com`, `192.168.1.20:3001` o un enlace de ngrok), usuario y contraseña. En una terminal nueva: `sbox help`.

Windows SmartScreen puede avisar de que el programa no está firmado («Más información → Ejecutar de todos modos»): los `.exe` no llevan firma de código.

Desinstalar: `uninstall.ps1` (con `-Purge` borra también ajustes y estado; tus archivos no se tocan).

## Terminal: `sbox`

```powershell
sbox login -s https://nube.ejemplo.com -u ana      # pide la contraseña sin mostrarla (--password-stdin para scripts; --code para 2FA)
sbox status                                        # sesión, servidor, espacio y sincronización (--json disponible)
sbox ls Documentos -l                              # lista una carpeta del servidor
sbox upload foto.jpg informe.pdf -d Trabajo        # sube (sin destino: «Subidas del PC»; nunca pisa archivos salvo --overwrite)
sbox download Trabajo/informe.pdf -o $HOME\Descargas
sbox mkdir Trabajo/2026 ; sbox mv a.txt Trabajo ; sbox rm viejo.txt -y ; sbox share Trabajo/informe.pdf --days 7
sbox sync folder D:\Nube Documentos ; sbox sync on ; sbox sync now
sbox config list ; sbox config set mode upload ; sbox config set interval 30
sbox service on                                    # sincroniza en segundo plano (tarea programada de tu usuario)
sbox sessions ; sbox passwd ; sbox trash ; sbox search informe ; sbox update install ; sbox gui
```

`sbox help` muestra todas las órdenes. Autocompletado en PowerShell: `sbox completion | Out-String | Invoke-Expression` (añádelo a tu `$PROFILE`).

## Novedades 1.3.0

- **Nuevo diseño, igual que Android y en tema oscuro por defecto:** fondo oscuro, tarjetas redondeadas con título en color de acento, barra lateral renovada, cabeceras con degradado, botones redondeados y **mosaicos de acción** en Inicio (Subir, Sincronizar, Explorar, Panel web).
- **Explorar (nuevo):** página para buscar por nombre y filtrar tus archivos por *Recientes*, *Imágenes*, *Vídeos*, *Audio*, *Documentos*, *Comprimidos* o *Carpetas vacías*; cada resultado se puede ver, descargar o copiar su ruta. Terminal: `sbox recent`, `sbox type <images|video|audio|docs|archives>`, `sbox empty-folders` (con `-l` y `--json`). `type` y `empty-folders` necesitan servidor 2.26 o superior.

## Novedades 1.2.0

- **Instalar el servidor en este equipo:** en la pantalla de inicio de sesión, apartado «¿No tienes un servidor?»: abre una ventana de PowerShell y ejecuta el instalador oficial de SynapseBox (`get.ps1`: instala git y Node.js con winget si faltan, descarga SynapseBox en `%USERPROFILE%\SynapseBox` y arranca el servidor con `npm start`). Déjala abierta: si la cierras, el servidor se detiene. Después, «Usar este equipo como servidor» rellena `http://localhost:3001`. También por terminal: `sbox install-server [-y] [--no-start]`.

## Novedades 1.1.0

- **Archivos de usuarios (solo administradores):** página nueva en la ventana (solo aparece si tu cuenta es admin) y comandos `sbox admin users | ls <usuario> [ruta] [-l] | get <usuario> <ruta> [-o destino] | rm <usuario> <ruta>… [-y]`. Permite ver, descargar y eliminar (a la papelera de ese usuario) los archivos y carpetas de cualquier cuenta; **no crea, modifica ni renombra**. Las carpetas no se descargan enteras.

## Sincronización

Elige la carpeta del PC y (opcional) la de SynapseBox. Opciones: dirección (bidireccional, solo subir, solo bajar); estrategia (copiar todo lo actual y luego los cambios · solo copiar lo actual una vez y detenerse · solo los cambios desde ahora); y por separado archivos nuevos, modificados, borrados y carpetas. La copia inicial nunca borra; lo borrado en el PC por la sincronización va a `.sync-trash` (30 días) y lo borrado en el servidor, a su papelera. Los conflictos se guardan como `nombre (conflicto fecha).ext`. Con servidor 2.25 o superior usa subida reanudable con SHA-256, renombrados sin recopiar y borrado por lotes.

- Con la ventana abierta sincroniza cada X minutos. Para que siga con la ventana cerrada: **Activar servicio** (página Sincronización) o `sbox service on`; es una tarea programada de tu usuario («SynapseBoxSync») que arranca `synapsebox.exe --daemon` al iniciar sesión, sin ventana.
- Windows no admite en nombres de archivo `\ / : * ? " < > |` ni nombres como `CON` o `NUL`: si el servidor tiene archivos así, se muestran como errores de esa sincronización y el resto continúa. Windows tampoco distingue mayúsculas de minúsculas: `Foto.jpg` y `foto.jpg` son el mismo archivo.

## Actualizar

La app mira la carpeta **`APPS/Windows/dist`** de la rama `main` de `OctavioproYT452/SynapseBox`, elige el `SynapseBox-Windows-vX.Y.Z.zip` de versión más alta y, si es mayor que la instalada, avisa con una notificación de Windows (una vez al día; se puede desactivar). En **Actualizaciones** → *Descargar e instalar* (o `sbox update install`) descarga el `.zip`, sustituye `synapsebox.exe` y `sbox.exe` (el antiguo queda como `.old` y se borra al siguiente arranque) y pide reiniciar. Funciona si está instalada en una carpeta de tu usuario (la predeterminada).

## Publicar una versión nueva (para ti)

1. Sube la versión en `Cargo.toml`.
2. `./build-windows.sh` crea `dist/SynapseBox-Windows-vX.Y.Z.zip`.
3. Súbelo a `APPS/Windows/dist/` en GitHub (rama `main`). Las apps instaladas lo detectan.

## Datos y seguridad

- Ajustes y token de sesión: `%APPDATA%\SynapseBox\config.json` (carpeta privada de tu usuario de Windows; el token **no** está cifrado aparte). Estado de sincronización, caché y bloqueo: `%LOCALAPPDATA%\SynapseBox`.
- El HTTPS usa el almacén de certificados de Windows (schannel).

## Notas

- **No se ha podido compilar en el entorno donde se escribió** (sin acceso a crates.io ni a Windows): si `./build-windows.sh` muestra errores, cópialos para corregirlos. La ventana usa `eframe`/`egui` 0.29; el resto del código reutiliza el motor de la versión Linux.
- Sin icono en la bandeja del sistema ni icono incrustado en el `.exe` (la ventana y la barra de tareas sí muestran el logotipo).
- La ventana necesita OpenGL 2.0 o superior (cualquier PC con controlador de vídeo normal; algunas máquinas virtuales sin aceleración pueden fallar: usa entonces `sbox`).
