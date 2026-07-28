#!/usr/bin/env bash
#
# Instalador local de la plataforma Uppercap — macOS y Linux.
#
#   ./instalar.sh
#
# Deja la aplicación lista para usar: verifica requisitos, levanta PostgreSQL,
# genera la configuración, crea el esquema y carga datos de prueba.
# Es seguro volver a ejecutarlo: no pisa el .env ni los datos existentes.

set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

# ---------------------------------------------------------------- presentación
rojo()  { printf '\033[0;31m%s\033[0m\n' "$*"; }
verde() { printf '\033[0;32m%s\033[0m\n' "$*"; }
azul()  { printf '\033[0;34m%s\033[0m\n' "$*"; }
gris()  { printf '\033[0;90m%s\033[0m\n' "$*"; }
titulo(){ printf '\n\033[1m%s\033[0m\n' "$*"; }

ok()    { verde "  ✓ $*"; }
info()  { gris  "    $*"; }
error() { rojo  "  ✗ $*"; }

abortar() {
  echo
  rojo "No se pudo completar la instalación."
  echo
  [ $# -gt 0 ] && printf '%s\n' "$@"
  exit 1
}

cat <<'BANNER'

  ┌──────────────────────────────────────────────┐
  │  Uppercap — Registro digital de cursos       │
  │  Instalación local                           │
  └──────────────────────────────────────────────┘
BANNER

SO="$(uname -s)"
case "$SO" in
  Darwin) SISTEMA="macOS" ;;
  Linux)  SISTEMA="Linux" ;;
  *)      abortar "Sistema no soportado: $SO. El instalador funciona en macOS y Linux." ;;
esac

# ------------------------------------------------------------------ requisitos
titulo "1. Requisitos"

if ! command -v node >/dev/null 2>&1; then
  if [ "$SISTEMA" = "macOS" ]; then
    abortar \
      "Falta Node.js. Instálelo con una de estas dos opciones:" \
      "" \
      "  brew install node          (si tiene Homebrew)" \
      "  https://nodejs.org         (descarga directa, versión LTS)" \
      "" \
      "Después vuelva a ejecutar ./instalar.sh"
  else
    abortar "Falta Node.js 20 o superior. Instálelo desde https://nodejs.org"
  fi
fi

VERSION_NODE="$(node -v | sed 's/v//')"
MAYOR_NODE="${VERSION_NODE%%.*}"
if [ "$MAYOR_NODE" -lt 20 ]; then
  abortar "Node.js $VERSION_NODE es muy antiguo. Se necesita la versión 20 o superior."
fi
ok "Node.js $VERSION_NODE"

# --- Navegador para generar el PDF del expediente ---
NAVEGADOR=""
for ruta in \
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  "/Applications/Chromium.app/Contents/MacOS/Chromium" \
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" \
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" \
  "$HOME/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  "/usr/bin/google-chrome" \
  "/usr/bin/chromium" \
  "/usr/bin/chromium-browser" \
  "/snap/bin/chromium" \
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
do
  if [ -x "$ruta" ]; then NAVEGADOR="$ruta"; break; fi
done

if [ -n "$NAVEGADOR" ]; then
  case "$NAVEGADOR" in
    *.app/*) NOMBRE_NAV="$(printf '%s' "$NAVEGADOR" | sed 's|.*/\([^/]*\)\.app/.*|\1|')" ;;
    *)       NOMBRE_NAV="$(basename "$NAVEGADOR")" ;;
  esac
  ok "Navegador para el PDF: $NOMBRE_NAV"
else
  echo "  ! No se encontró Chrome ni Chromium."
  info "Todo funcionará salvo la generación del PDF del expediente."
  info "Instale Google Chrome desde https://google.com/chrome y vuelva a ejecutar este script."
fi

# ------------------------------------------------------------------ PostgreSQL
titulo "2. Base de datos"

MOTOR=""   # docker | local
USUARIO_DB="uppercap"
CLAVE_DB="uppercap"
NOMBRE_DB="uppercap"
PUERTO_DB="5432"

docker_activo() {
  command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1
}

postgres_local_activo() {
  command -v pg_isready >/dev/null 2>&1 && pg_isready -q -h localhost -p 5432 2>/dev/null
}

postgres_instalado() {
  command -v postgres >/dev/null 2>&1 || command -v pg_ctl >/dev/null 2>&1 \
    || command -v psql >/dev/null 2>&1 \
    || [ -d /Applications/Postgres.app ]
}

# Intenta arrancar un PostgreSQL ya instalado pero detenido. Devuelve 0 si
# quedó respondiendo. Es lo más común al reabrir el equipo días después.
intentar_arrancar_postgres() {
  if [ "$SISTEMA" = "macOS" ]; then
    if [ -d /Applications/Postgres.app ]; then
      open -a Postgres 2>/dev/null || true
    fi
    if command -v brew >/dev/null 2>&1; then
      for v in postgresql@16 postgresql@15 postgresql@14 postgresql; do
        if brew list --formula 2>/dev/null | grep -qx "$v"; then
          brew services start "$v" >/dev/null 2>&1 || true
          break
        fi
      done
    fi
  else
    if command -v service >/dev/null 2>&1; then
      service postgresql start >/dev/null 2>&1 || true
    fi
    if command -v pg_ctlcluster >/dev/null 2>&1; then
      pg_ctlcluster 16 main start >/dev/null 2>&1 || true
    fi
  fi

  for _ in $(seq 1 20); do
    postgres_local_activo && return 0
    sleep 1
  done
  return 1
}

if postgres_local_activo; then
  MOTOR="local"
  ok "PostgreSQL ya está corriendo en este equipo"
elif postgres_instalado; then
  echo "  PostgreSQL está instalado pero detenido. Intentando arrancarlo..."
  if intentar_arrancar_postgres; then
    MOTOR="local"
    ok "PostgreSQL arrancado"
  elif docker_activo; then
    MOTOR="docker"
    echo "  ! No se pudo arrancar el PostgreSQL instalado."
    ok "Se usará Docker en su lugar"
  else
    abortar \
      "PostgreSQL está instalado pero no responde y no se pudo arrancar." \
      "" \
      "Arránquelo a mano y vuelva a ejecutar ./instalar.sh:" \
      "" \
      "  brew services start postgresql@16      (Homebrew)" \
      "  open -a Postgres                       (Postgres.app)"
  fi
elif docker_activo; then
  MOTOR="docker"
  ok "Docker disponible — se usará un contenedor para PostgreSQL"
elif [ "$SISTEMA" = "macOS" ] && command -v brew >/dev/null 2>&1; then
  echo "  ! PostgreSQL no está instalado."
  info "Homebrew está disponible. Se puede instalar y arrancar automáticamente."
  printf '\n    ¿Instalar PostgreSQL con Homebrew? [S/n] '
  read -r respuesta </dev/tty || respuesta="s"
  case "${respuesta:-s}" in
    [nN]*) abortar "Instale PostgreSQL o Docker Desktop y vuelva a ejecutar ./instalar.sh" ;;
  esac
  echo
  brew install postgresql@16
  brew services start postgresql@16
  # Homebrew no siempre deja psql en el PATH
  for d in /opt/homebrew/opt/postgresql@16/bin /usr/local/opt/postgresql@16/bin; do
    [ -d "$d" ] && export PATH="$d:$PATH"
  done
  echo "  Esperando a que PostgreSQL acepte conexiones..."
  for _ in $(seq 1 30); do
    postgres_local_activo && break
    sleep 1
  done
  postgres_local_activo || abortar "PostgreSQL se instaló pero no responde. Revise: brew services list"
  MOTOR="local"
  ok "PostgreSQL instalado y corriendo"
else
  if [ "$SISTEMA" = "macOS" ]; then
    abortar \
      "No hay PostgreSQL ni Docker disponibles." \
      "" \
      "Elija una de estas opciones y vuelva a ejecutar ./instalar.sh:" \
      "" \
      "  A) Docker Desktop — la más simple, no instala nada más en el sistema" \
      "     https://docker.com/products/docker-desktop" \
      "" \
      "  B) Postgres.app — PostgreSQL nativo para macOS, con interfaz" \
      "     https://postgresapp.com" \
      "" \
      "  C) Homebrew" \
      "     brew install postgresql@16 && brew services start postgresql@16"
  else
    abortar \
      "No hay PostgreSQL ni Docker disponibles." \
      "" \
      "Instale uno de los dos y vuelva a ejecutar ./instalar.sh:" \
      "" \
      "  sudo apt install postgresql        (Debian / Ubuntu)" \
      "  https://docker.com                 (Docker)"
  fi
fi

# --- Crear el contenedor o la base, según el motor ---
if [ "$MOTOR" = "docker" ]; then
  if docker ps -a --format '{{.Names}}' | grep -qx 'uppercap-db'; then
    if ! docker ps --format '{{.Names}}' | grep -qx 'uppercap-db'; then
      docker start uppercap-db >/dev/null
      ok "Contenedor uppercap-db reiniciado"
    else
      ok "Contenedor uppercap-db ya estaba corriendo"
    fi
  else
    # Puerto alternativo si el 5432 está ocupado por otro PostgreSQL
    if command -v nc >/dev/null 2>&1 && nc -z localhost 5432 2>/dev/null; then
      PUERTO_DB="5433"
      info "El puerto 5432 está ocupado; se usará el $PUERTO_DB"
    fi
    docker run -d --name uppercap-db \
      -e POSTGRES_USER="$USUARIO_DB" \
      -e POSTGRES_PASSWORD="$CLAVE_DB" \
      -e POSTGRES_DB="$NOMBRE_DB" \
      -p "${PUERTO_DB}:5432" \
      -v uppercap-datos:/var/lib/postgresql/data \
      postgres:16-alpine >/dev/null
    ok "Contenedor uppercap-db creado en el puerto $PUERTO_DB"
  fi

  PUERTO_DB="$(docker port uppercap-db 5432 2>/dev/null | head -1 | sed 's/.*://')"
  PUERTO_DB="${PUERTO_DB:-5432}"

  echo "  Esperando a que la base acepte conexiones..."
  for _ in $(seq 1 40); do
    docker exec uppercap-db pg_isready -q -U "$USUARIO_DB" 2>/dev/null && break
    sleep 1
  done
  docker exec uppercap-db pg_isready -q -U "$USUARIO_DB" 2>/dev/null \
    || abortar "El contenedor de PostgreSQL no responde. Revise: docker logs uppercap-db"
  ok "Base de datos lista"

else
  # PostgreSQL nativo: crear rol y base si no existen.
  # -w: nunca pedir contraseña por pantalla. Sin esto, un PostgreSQL
  # configurado con md5 deja el instalador colgado esperando entrada.
  export PGCONNECT_TIMEOUT=5
  YO="${USER:-$(whoami 2>/dev/null || echo postgres)}"
  PSQL_ADMIN=""
  for u in "$YO" postgres; do
    if psql -w -h localhost -U "$u" -d postgres -c 'select 1' >/dev/null 2>&1; then
      PSQL_ADMIN="$u"; break
    fi
  done
  # Último recurso: por socket local como el usuario del sistema postgres.
  if [ -z "$PSQL_ADMIN" ] && command -v sudo >/dev/null 2>&1; then
    if sudo -n -u postgres psql -w -d postgres -c 'select 1' >/dev/null 2>&1; then
      PSQL_ADMIN="postgres"
      USAR_SUDO="si"
    fi
  fi
  [ -z "${PSQL_ADMIN:-}" ] && abortar \
    "No se pudo conectar a PostgreSQL como administrador." \
    "Pruebe:  psql -h localhost -U postgres -d postgres" \
    "Si pide contraseña, cree la base a mano y luego edite DATABASE_URL en el archivo .env"

  admin_psql() {
    if [ "${USAR_SUDO:-no}" = "si" ]; then
      sudo -n -u postgres psql -w -d postgres "$@"
    else
      psql -w -h localhost -U "$PSQL_ADMIN" -d postgres "$@"
    fi
  }

  if ! admin_psql -tAc "select 1 from pg_roles where rolname='$USUARIO_DB'" | grep -q 1; then
    admin_psql -c "create role $USUARIO_DB with login password '$CLAVE_DB' createdb" >/dev/null
    ok "Usuario de base de datos creado"
  else
    ok "Usuario de base de datos ya existía"
  fi

  if ! admin_psql -tAc "select 1 from pg_database where datname='$NOMBRE_DB'" | grep -q 1; then
    admin_psql -c "create database $NOMBRE_DB owner $USUARIO_DB" >/dev/null
    ok "Base de datos '$NOMBRE_DB' creada"
  else
    ok "Base de datos '$NOMBRE_DB' ya existía"
  fi
fi

# --------------------------------------------------------------- configuración
titulo "3. Configuración"

if [ -f .env ]; then
  ok "El archivo .env ya existe — se conserva tal cual"
  info "Si necesita regenerarlo: mv .env .env.respaldo && ./instalar.sh"
else
  if command -v openssl >/dev/null 2>&1; then
    SECRETO="$(openssl rand -base64 48 | tr -d '\n/+=' | cut -c1-48)"
  else
    SECRETO="$(node -e "console.log(require('crypto').randomBytes(36).toString('hex'))")"
  fi

  {
    echo "# Generado por ./instalar.sh el $(date '+%Y-%m-%d %H:%M')"
    echo ""
    echo "DATABASE_URL=\"postgresql://${USUARIO_DB}:${CLAVE_DB}@localhost:${PUERTO_DB}/${NOMBRE_DB}\""
    echo ""
    echo "# Secreto de las cookies de sesión. No lo comparta."
    echo "SESSION_SECRET=\"${SECRETO}\""
    echo ""
    echo "# Uso interno del servidor (generación del PDF). Déjelo en localhost:"
    echo "# la dirección de los códigos QR se detecta sola desde el navegador."
    echo "APP_URL=\"http://localhost:3000\""
    echo ""
    echo "# Correo: \"consola\" registra el envío sin salir a la red."
    echo "CORREO_PROVEEDOR=\"consola\""
    echo "# CORREO_PROVEEDOR=\"resend\""
    echo "# RESEND_API_KEY=\"\""
    echo "# CORREO_REMITENTE=\"Uppercap <no-reply@uppercap.cl>\""
    if [ -n "$NAVEGADOR" ]; then
      echo ""
      echo "PUPPETEER_EXECUTABLE_PATH=\"${NAVEGADOR}\""
    fi
  } > .env

  ok "Archivo .env generado con un secreto aleatorio"
fi

# ---------------------------------------------------------------- dependencias
titulo "4. Dependencias"

if [ -d node_modules ] && [ package-lock.json -ot node_modules ]; then
  ok "Ya estaban instaladas"
else
  echo "  Instalando (puede tardar un par de minutos)..."
  npm install --no-audit --no-fund 2>&1 | tail -3
  ok "Dependencias instaladas"
fi

# ------------------------------------------------------------- esquema y datos
titulo "5. Esquema y datos"

npm run db:migrate >/dev/null 2>&1 || abortar \
  "Falló la creación del esquema." \
  "Revise DATABASE_URL en el archivo .env y que PostgreSQL esté corriendo." \
  "Para ver el error completo:  npm run db:migrate"
ok "Esquema creado"

TIENE_DATOS="$(node -e "
require('dotenv').config({quiet:true});
const {Pool}=require('pg');
new Pool({connectionString:process.env.DATABASE_URL}).query('select count(*)::int n from usuarios')
  .then(r=>{console.log(r.rows[0].n);process.exit(0)})
  .catch(()=>{console.log(0);process.exit(0)});
" 2>/dev/null || echo 0)"

if [ "${TIENE_DATOS:-0}" -gt 0 ]; then
  ok "Ya hay datos cargados — no se tocan"
  info "Para empezar de cero:  npm run db:reset && npm run db:seed"
else
  npm run db:seed >/dev/null 2>&1 || abortar "Falló la carga de datos de prueba. Ejecute: npm run db:seed"
  ok "Datos de prueba cargados (caso Anglo American)"
fi

# ------------------------------------------------------------------ compilación
titulo "6. Compilación"
echo "  Compilando la aplicación..."
npm run build >/dev/null 2>&1 || abortar "Falló la compilación. Ejecute: npm run build"
ok "Aplicación compilada"

# ------------------------------------------------------------------------ listo
titulo "Instalación completa"

echo
azul "  Para iniciar la aplicación:"
echo
echo "      ./iniciar.sh"
echo
azul "  Usuarios de prueba (contraseña: uppercap2026):"
echo
echo "      operaciones@uppercap.cl      Operaciones"
echo "      admin@uppercap.cl           Administración"
echo "      carlos.fuentes@ejemplo.cl   Relator del curso de hoy"
echo
gris "  La guía completa está en INSTALACION.md"
echo
