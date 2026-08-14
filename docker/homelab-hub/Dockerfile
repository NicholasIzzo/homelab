# Homelab Hub — immagine unica: frontend React + backend Node nello stesso container.
# Base Debian slim e non Alpine: better-sqlite3 ha prebuild glibc, su musl andrebbe
# ricompilato a ogni build.

# ---------------------------------------------------------------------------
# Stage 1 — dipendenze di sola produzione (con toolchain per il modulo nativo)
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS deps-prod
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY app/package.json ./
COPY app/server/package.json ./server/
COPY app/web/package.json ./web/

RUN npm install --omit=dev --workspace=@homelab-hub/server --no-audit --no-fund

# ---------------------------------------------------------------------------
# Stage 2 — build (dipendenze complete: TypeScript, Vite, Tailwind)
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS builder
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY app/package.json ./
COPY app/server/package.json ./server/
COPY app/web/package.json ./web/
RUN npm install --no-audit --no-fund

COPY app/ ./
RUN npm run build

# ---------------------------------------------------------------------------
# Stage 3 — runtime: niente toolchain, niente sorgenti, niente devDependencies
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    TZ=Europe/Rome \
    HTTP_HOST=0.0.0.0 \
    HTTP_PORT=8090 \
    DB_PATH=/data/hub.db \
    PUBLIC_DIR=/app/public

COPY --from=deps-prod /app/node_modules ./node_modules
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/web/dist ./public
COPY app/package.json ./
COPY app/server/package.json ./server/

# /data e' il mountpoint del volume: deve appartenere all'utente non-root
RUN mkdir -p /data && chown -R node:node /data /app

USER node
EXPOSE 8090

CMD ["node", "server/dist/index.js"]
