#!/usr/bin/env bash
# Desinstala SynapseBox. Uso: ./uninstall.sh [--prefix DIR] [--purge]   (--purge borra también los ajustes y el estado de sincronización; NO toca tus archivos)
set -euo pipefail
PREFIX="$HOME/.local"; PURGE=0
while [ $# -gt 0 ]; do case "$1" in --prefix) PREFIX="${2:?}"; shift 2 ;; --purge) PURGE=1; shift ;; *) echo "Opción desconocida: $1"; exit 1 ;; esac; done
if command -v systemctl >/dev/null 2>&1 && [ "$(id -u)" -ne 0 ]; then systemctl --user disable --now synapsebox-sync.service >/dev/null 2>&1 || true; fi
rm -f "$PREFIX/bin/synapsebox-linux" "$PREFIX/share/applications/app.synapsebox.linux.desktop" "$PREFIX/share/icons/hicolor/256x256/apps/synapsebox.png" \
      "$HOME/.config/systemd/user/synapsebox-sync.service" /etc/systemd/user/synapsebox-sync.service 2>/dev/null || true
command -v systemctl >/dev/null 2>&1 && systemctl --user daemon-reload >/dev/null 2>&1 || true
if [ "$PURGE" -eq 1 ]; then rm -rf "$HOME/.config/synapsebox" "$HOME/.local/share/synapsebox" "$HOME/.cache/synapsebox"; fi
echo "SynapseBox desinstalado."
