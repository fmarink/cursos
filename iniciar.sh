#!/usr/bin/env bash
#
# Arranca la plataforma Uppercap y muestra la dirección que deben usar los
# celulares de los participantes.
#
#   ./iniciar.sh          modo producción (rápido, el que se usa en sala)
#   ./iniciar.sh --dev    modo desarrollo, con recarga automática
#
# La IP de la red cambia al moverse entre redes Wi-Fi, así que este script la
# vuelve a detectar en cada arranque.

set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

PUERTO="${PORT:-3000}"
MODO="produccion"
[ "${1:-}" = "--dev" ] && MODO="desarrollo"

azul() { printf '\033[0;34m%s\033[0m\n' "$*"; }
gris() { printf '\033[0;90m%s\033[0m\n' "$*"; }
rojo() { printf '\033[0;31m%s\033[0m\n' "$*"; }

if [ ! -f .env ]; then
  rojo "Falta el archivo .env. Ejecute primero:  ./instalar.sh"
  exit 1
fi

# ------------------------------------------------- IP de la red local
ip_local() {
  case "$(uname -s)" in
    Darwin)
      # Interfaz por la que sale el tráfico, luego su IP.
      local iface
      iface="$(route -n get default 2>/dev/null | awk '/interface:/{print $2}')"
      if [ -n "$iface" ]; then
        ipconfig getifaddr "$iface" 2>/dev/null && return
      fi
      for i in en0 en1 en2 en3; do
        ipconfig getifaddr "$i" 2>/dev/null && return
      done
      ;;
    Linux)
      ip route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") {print $(i+1); exit}}' && return
      hostname -I 2>/dev/null | awk '{print $1}' && return
      ;;
  esac
  echo ""
}

IP="$(ip_local || true)"

# ------------------------------------------------- base de datos
if command -v docker >/dev/null 2>&1 \
   && docker ps -a --format '{{.Names}}' 2>/dev/null | grep -qx 'uppercap-db' \
   && ! docker ps --format '{{.Names}}' 2>/dev/null | grep -qx 'uppercap-db'; then
  echo "Iniciando la base de datos..."
  docker start uppercap-db >/dev/null
  for _ in $(seq 1 30); do
    docker exec uppercap-db pg_isready -q -U uppercap 2>/dev/null && break
    sleep 1
  done
fi

# ------------------------------------------------- compilación si hace falta
if [ "$MODO" = "produccion" ] && [ ! -d .next ]; then
  echo "Compilando por primera vez..."
  npm run build
fi

# ------------------------------------------------- aviso
cat <<EOF

  ┌──────────────────────────────────────────────┐
  │  Uppercap — Registro digital de cursos       │
  └──────────────────────────────────────────────┘

EOF

azul "  En este equipo:"
echo "      http://localhost:${PUERTO}"
echo

if [ -n "$IP" ]; then
  azul "  Desde los celulares en la misma red Wi-Fi:"
  echo "      http://${IP}:${PUERTO}"
  echo
  gris "  Importante: abra el panel del relator desde la dirección de red,"
  gris "  no desde localhost. Los códigos QR heredan la dirección que use,"
  gris "  y un QR con localhost no lo puede abrir ningún teléfono."
else
  rojo "  No se detectó una IP de red."
  gris "  Sin conexión a Wi-Fi los celulares no podrán alcanzar la aplicación."
  gris "  Verifique la conexión y vuelva a ejecutar ./iniciar.sh"
fi

echo
gris "  Para detener: Control-C"
echo

# ------------------------------------------------- arranque
export HOSTNAME=0.0.0.0   # escucha en todas las interfaces, no solo localhost
export PORT="$PUERTO"

if [ "$MODO" = "desarrollo" ]; then
  exec npx next dev --hostname 0.0.0.0 --port "$PUERTO"
else
  exec npx next start --hostname 0.0.0.0 --port "$PUERTO"
fi
