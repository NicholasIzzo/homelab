# Biblioteca Incantata — immagine unica: SPA React (Three.js) + server Fastify
# che fa da proxy a Goodreads e serve i desideri Amazon.
#
# Base Debian-slim (non Alpine): sul NAS ARM64 i binari nativi di Vite/rolldown
# ed esbuild per linux-arm64-gnu sono più affidabili di quelli musl.

# ---------------------------------------------------------------------------
# Stage 1 — build (dipendenze complete: TypeScript, Vite)
# ---------------------------------------------------------------------------
FROM node:22-slim AS builder
WORKDIR /app

COPY app/package.json app/package-lock.json ./
COPY app/server/package.json ./server/
COPY app/web/package.json ./web/
RUN npm install --no-audit --no-fund

COPY app/ ./
RUN npm run build

# ---------------------------------------------------------------------------
# Stage 2 — dipendenze di sola produzione (solo il server)
# ---------------------------------------------------------------------------
FROM node:22-slim AS deps-prod
WORKDIR /app

COPY app/package.json app/package-lock.json ./
COPY app/server/package.json ./server/
COPY app/web/package.json ./web/
RUN npm install --omit=dev --workspace=@libreria/server --no-audit --no-fund

# ---------------------------------------------------------------------------
# Stage 3 — runtime: niente toolchain, niente sorgenti, niente devDependencies
# ---------------------------------------------------------------------------
FROM node:22-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    TZ=Europe/Rome \
    HTTP_HOST=0.0.0.0 \
    HTTP_PORT=8092 \
    PUBLIC_DIR=/app/public \
    DESIDERI_PATH=/app/data/desideri.json

COPY --from=deps-prod /app/node_modules ./node_modules
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/web/dist ./public
COPY app/package.json ./
COPY app/server/package.json ./server/
COPY data/desideri.json ./data/desideri.json

USER node
EXPOSE 8092

CMD ["node", "server/dist/index.js"]
