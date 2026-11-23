#!/usr/bin/env bash
# Crea el paquete de código fuente que se sube a APPS/Linux/dist/ del repositorio: dist/SynapseBox-vX.Y.Z.tar.gz
# (la versión sale de Cargo.toml; cada PC lo compila con install.sh, y las apps ya instaladas lo detectan como actualización).
set -euo pipefail
cd "$(dirname "$0")"
VER="$(sed -n 's/^version *= *"\(.*\)"/\1/p' Cargo.toml | head -1)"
[ -n "$VER" ] || { echo "No se pudo leer la versión de Cargo.toml"; exit 1; }
mkdir -p dist
OUT="dist/SynapseBox-v$VER.tar.gz"
tar -czf "$OUT" --exclude=./target --exclude=./dist --exclude=./.git --transform "s|^\.|synapsebox-linux-$VER|" .
echo "Creado $OUT"
echo "Súbelo a APPS/Linux/dist/ de la rama main (el nombre debe ser SynapseBox-v$VER.tar.gz)."
