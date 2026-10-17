#!/bin/bash
# Script para ejecutar Minecraft Local Server Manager (AppImage) en Linux
# Uso: ./run-minecraft-manager.sh

set -e

# Ruta donde se espera encontrar el AppImage
APP_NAME="Minecraft-Local-Server-Manager.AppImage"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_PATH="$APP_DIR/$APP_NAME"

# Si no está junto al script, buscar en ~/Applications
if [ ! -f "$APP_PATH" ]; then
  APP_PATH="$HOME/Escritorio/$APP_NAME"
fi

if [ ! -f "$APP_PATH" ]; then
  echo "❌ No se encontró '$APP_NAME' ni en la carpeta del script ni en ~/Escritorio/"
  echo "   Coloca el AppImage junto a este script o en ~/Escritorio/"
  exit 1
fi

# Dar permisos de ejecución si no los tiene
if [ ! -x "$APP_PATH" ]; then
  echo "🔧 Asignando permisos de ejecución al AppImage..."
  chmod +x "$APP_PATH"
fi

echo "🚀 Iniciando Minecraft Local Server Manager..."
exec "$APP_PATH"
