#!/usr/bin/env bash
# Compila SynapseBox para Windows (x86_64) desde Debian 13 (o Ubuntu/Debian recientes), solo con terminal.
# Resultado: dist/SynapseBox-Windows-vX.Y.Z.zip  (synapsebox.exe + sbox.exe + instalador de PowerShell)
#
#   ./build-windows.sh               instala lo necesario (pide sudo), compila y empaqueta
#   ./build-windows.sh --skip-deps   salta la instalación de paquetes y de Rust (si ya los tienes)
#   ./build-windows.sh --debug       compilación rápida sin optimizar (para probar)
set -euo pipefail
cd "$(dirname "$0")"
SKIP=0; PROFILE=release
for a in "$@"; do case "$a" in --skip-deps) SKIP=1 ;; --debug) PROFILE=debug ;; -h|--help) sed -n '2,8p' "$0"; exit 0 ;; *) echo "Opción desconocida: $a"; exit 1 ;; esac; done
SUDO=""; [ "$(id -u)" -ne 0 ] && SUDO="sudo"

if [ "$SKIP" -eq 0 ]; then
  echo "==> 1/4  Paquetes del sistema (compilador cruzado mingw-w64, zip, curl)"
  $SUDO apt-get update
  $SUDO apt-get install -y build-essential pkg-config curl ca-certificates zip unzip mingw-w64
  # Rust para Windows necesita la variante «posix» de mingw (hilos); Debian trae «win32» por defecto
  $SUDO update-alternatives --set x86_64-w64-mingw32-gcc /usr/bin/x86_64-w64-mingw32-gcc-posix
  $SUDO update-alternatives --set x86_64-w64-mingw32-g++ /usr/bin/x86_64-w64-mingw32-g++-posix
  echo "==> 2/4  Rust (rustup) con el destino de Windows"
  if ! command -v rustup >/dev/null 2>&1; then
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
  fi
fi
# shellcheck disable=SC1091
[ -f "$HOME/.cargo/env" ] && . "$HOME/.cargo/env"
command -v cargo >/dev/null 2>&1 || { echo "No se encuentra cargo. Ejecuta sin --skip-deps o instala Rust desde https://rustup.rs"; exit 1; }
rustup target add x86_64-pc-windows-gnu
command -v x86_64-w64-mingw32-gcc >/dev/null 2>&1 || { echo "Falta mingw-w64: sudo apt install mingw-w64"; exit 1; }

echo "==> 3/4  Compilando ($PROFILE) — la primera vez descarga las librerías y tarda unos minutos"
if [ "$PROFILE" = release ]; then cargo build --release --target x86_64-pc-windows-gnu; else cargo build --target x86_64-pc-windows-gnu; fi
OUT="target/x86_64-pc-windows-gnu/$PROFILE"
for f in synapsebox.exe sbox.exe; do [ -f "$OUT/$f" ] || { echo "No se generó $OUT/$f"; exit 1; }; done

echo "==> 4/4  Empaquetando"
VER="$(sed -n 's/^version *= *"\(.*\)"/\1/p' Cargo.toml | head -1)"
NAME="SynapseBox-Windows-v$VER"
rm -rf "dist/$NAME" "dist/$NAME.zip"; mkdir -p "dist/$NAME"
cp "$OUT/synapsebox.exe" "$OUT/sbox.exe" install.ps1 install.cmd uninstall.ps1 "dist/$NAME/"
cp LEEME-WINDOWS.md "dist/$NAME/LEEME.txt"
( cd dist && zip -qr "$NAME.zip" "$NAME" )
rm -rf "dist/$NAME"
echo
echo "Listo: dist/$NAME.zip ($(du -h "dist/$NAME.zip" | cut -f1))"
echo "  · Pásalo a un Windows 10/11, descomprímelo y ejecuta install.cmd (o: powershell -ExecutionPolicy Bypass -File install.ps1)."
echo "  · Para que las apps instaladas se actualicen solas, súbelo a APPS/Windows/dist/ de la rama main del repositorio."
