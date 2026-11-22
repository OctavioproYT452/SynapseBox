#!/usr/bin/env bash
# Compila SynapseBox para ESTE equipo (optimizado para su procesador) e instala la app.
#   ./install.sh                 instala para tu usuario en ~/.local
#   ./install.sh --service       además activa la sincronización en segundo plano al iniciar sesión
#   sudo ./install.sh --prefix /usr/local   instala para todos los usuarios
set -euo pipefail
cd "$(dirname "$0")"
PREFIX="$HOME/.local"; SERVICE=0; UPDATE=0
usage() { sed -n '2,6p' "$0" | sed 's/^# \{0,1\}//'; }
while [ $# -gt 0 ]; do
  case "$1" in
    --prefix) PREFIX="${2:?falta el directorio}"; shift 2 ;;
    --service) SERVICE=1; shift ;;
    --update) UPDATE=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Opción desconocida: $1"; usage; exit 1 ;;
  esac
done

. /etc/os-release 2>/dev/null || true
hint() {
  echo "Faltan dependencias de compilación. Instálalas y vuelve a ejecutar ./install.sh:"
  case "${ID:-}${ID_LIKE:-}" in
    *debian*|*ubuntu*) echo "  sudo apt install build-essential pkg-config libgtk-4-dev cargo   # (o instala Rust desde https://rustup.rs)" ;;
    *fedora*|*rhel*)   echo "  sudo dnf install gcc pkgconf-pkg-config gtk4-devel cargo" ;;
    *arch*)            echo "  sudo pacman -S base-devel gtk4 rust" ;;
    *suse*)            echo "  sudo zypper install gcc pkg-config gtk4-devel cargo" ;;
    *)                 echo "  Necesitas: compilador C, pkg-config, los archivos de desarrollo de GTK 4 y Rust (cargo ≥ 1.80, https://rustup.rs)" ;;
  esac
}
command -v cargo >/dev/null 2>&1 || { echo "No se encontró «cargo» (Rust)."; hint; exit 1; }
command -v cc >/dev/null 2>&1 || command -v gcc >/dev/null 2>&1 || { echo "No se encontró un compilador de C."; hint; exit 1; }
pkg-config --exists gtk4 2>/dev/null || { echo "No se encontraron los archivos de desarrollo de GTK 4."; hint; exit 1; }

echo "==> Compilando para este equipo (la primera vez descarga las librerías y puede tardar varios minutos)…"
export RUSTFLAGS="${RUSTFLAGS:-} -C target-cpu=native"
cargo build --release

BIN="$PREFIX/bin/synapsebox-linux"
echo "==> Instalando en $PREFIX"
install -Dm755 target/release/synapsebox-linux "$BIN.new"
mv -f "$BIN.new" "$BIN"   # reemplazo atómico: funciona aunque la app esté abierta
install -Dm644 data/synapsebox.png "$PREFIX/share/icons/hicolor/256x256/apps/synapsebox.png"
mkdir -p "$PREFIX/share/applications"
sed "s|@BIN@|$BIN|g" data/app.synapsebox.linux.desktop > "$PREFIX/share/applications/app.synapsebox.linux.desktop"
if [ "$(id -u)" -eq 0 ]; then UNITDIR=/etc/systemd/user; else UNITDIR="$HOME/.config/systemd/user"; fi
mkdir -p "$UNITDIR"
sed "s|@BIN@|$BIN|g" data/synapsebox-sync.service > "$UNITDIR/synapsebox-sync.service"
update-desktop-database "$PREFIX/share/applications" >/dev/null 2>&1 || true
gtk-update-icon-cache -q -f -t "$PREFIX/share/icons/hicolor" >/dev/null 2>&1 || true

if [ "$(id -u)" -ne 0 ] && command -v systemctl >/dev/null 2>&1; then
  systemctl --user daemon-reload >/dev/null 2>&1 || true
  if [ "$SERVICE" -eq 1 ]; then systemctl --user enable --now synapsebox-sync.service && echo "==> Servicio en segundo plano activado"; fi
  # en una actualización, si el servicio estaba activo, se reinicia con la versión nueva
  if [ "$UPDATE" -eq 1 ] && systemctl --user is-active --quiet synapsebox-sync.service 2>/dev/null; then systemctl --user restart synapsebox-sync.service || true; fi
fi

echo "==> Listo: $("$BIN" --version)"
case ":$PATH:" in *":$PREFIX/bin:"*) ;; *) echo "Nota: añade $PREFIX/bin a tu PATH para usar «synapsebox-linux» en la terminal (el icono del menú de aplicaciones ya funciona)." ;; esac
