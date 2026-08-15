# Videoteca — immagine unica: SPA React + proxy Fastify verso Jellyfin.
# Nessun modulo nativo → Alpine va benissimo.

# ---------------------------------------------------------------------------
# Stage 1 — build (dipendenze complete: TypeScript, Vite)
# ---------------------------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app

COPY app/package.json ./
COPY app/server/package.json ./server/
COPY app/web/package.json ./web/
RUN npm install --no-audit --no-fund

COPY app/ ./
RUN npm run build

# ---------------------------------------------------------------------------
# Stage 2 — dipendenze di sola produzione
# ---------------------------------------------------------------------------
FROM node:22-alpine AS deps-prod
WORKDIR /app

COPY app/package.json ./
COPY app/server/package.json ./server/
COPY app/web/package.json ./web/
RUN npm install --omit=dev --workspace=@videostore/server --no-audit --no-fund

# ---------------------------------------------------------------------------
# Stage 3 — runtime: niente toolchain, niente sorgenti, niente devDependencies
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    TZ=Europe/Rome \
    HTTP_HOST=0.0.0.0 \
    HTTP_PORT=8091 \
    PUBLIC_DIR=/app/public

COPY --from=deps-prod /app/node_modules ./node_modules
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/web/dist ./public
COPY app/package.json ./
COPY app/server/package.json ./server/

USER node
EXPOSE 8091

CMD ["node", "server/dist/index.js"]
