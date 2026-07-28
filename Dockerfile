# Imagen de la plataforma Uppercap.
#
# Incluye Chromium porque la aplicación genera el PDF del expediente
# imprimiendo una página HTML: sin navegador esa función no existe.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
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

RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium \
      fonts-liberation \
      fonts-dejavu-core \
      ca-certificates \
      libnss3 libatk-bridge2.0-0 libatk1.0-0 libcups2 libdrm2 \
      libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
      libgbm1 libpango-1.0-0 libcairo2 libasound2 \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

COPY --from=deps  /app/node_modules ./node_modules
COPY --from=build /app/.next        ./.next
COPY --from=build /app/public       ./public
COPY package.json drizzle.config.ts next.config.ts ./
COPY drizzle ./drizzle
COPY scripts ./scripts
COPY src     ./src

EXPOSE 3000

# Aplica migraciones pendientes y arranca. Es idempotente: si el esquema ya
# está al día, no hace nada.
CMD ["sh", "-c", "npx tsx scripts/migrate.ts && npx next start --hostname 0.0.0.0 --port 3000"]
