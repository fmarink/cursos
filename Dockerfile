# Imagen de la plataforma Uppercap.
#
# Incluye Chromium porque la aplicación genera el PDF del expediente
# imprimiendo una página HTML: sin navegador esa función no existe.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
# Playwright solo se usa en la prueba de aceptación, nunca en producción.
# Sin esto, npm ci intentaría descargar navegadores y alargaría el build
# varios minutos, o lo haría fallar sin acceso a internet.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PUPPETEER_SKIP_DOWNLOAD=1
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---------------------------------------------------------------- compilación
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# El build no toca la base de datos; basta una URL de relleno.
ENV DATABASE_URL="postgresql://uppercap:uppercap@localhost:5432/uppercap"
ENV SESSION_SECRET="valor-de-relleno-solo-para-la-compilacion-no-se-usa-en-ejecucion"
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ----------------------------------------------------------------- ejecución
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

# chromium arrastra sus propias dependencias: listarlas a mano rompe el build
# cada vez que Debian renombra una librería.
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium \
      fonts-liberation \
      fonts-dejavu-core \
      ca-certificates \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

COPY --from=deps  /app/node_modules ./node_modules
COPY --from=build /app/.next        ./.next
COPY --from=build /app/public       ./public
# tsconfig.json es necesario en ejecución: los scripts de mantenimiento
# (migraciones, seed, crear-admin, importador) corren con tsx.
COPY package.json tsconfig.json drizzle.config.ts next.config.ts ./
COPY drizzle ./drizzle
COPY scripts ./scripts
COPY src     ./src

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/salud').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Aplica migraciones pendientes y arranca. Es idempotente: si el esquema ya
# está al día, no hace nada. Si las migraciones fallan, el contenedor no
# arranca — es preferible a servir una aplicación contra un esquema viejo.
CMD ["sh", "-c", "npx tsx scripts/migrate.ts && npx next start --hostname 0.0.0.0 --port 3000"]
