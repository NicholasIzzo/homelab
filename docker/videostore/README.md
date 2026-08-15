# Videoteca 📼

Un noleggio anni '90 virtuale per Jellyfin: entri dalla porta a vetri, giri tra
le corsie a tema (horror, fantascienza, animazione…), prendi la custodia dallo
scaffale, leggi la trama sul retro, la porti alla cassa — e il film parte sulla
TV via API Jellyfin (riproduzione remota sulle sessioni attive).

## Architettura

- **`app/server`** — Fastify. Proxy verso Jellyfin: la API key resta qui, il
  browser non la vede mai. Endpoints: `/api/store` (scaffali per genere),
  `/api/image/:id` (copertine), `/api/devices` (sessioni controllabili),
  `POST /api/play` (PlayNow su una sessione).
- **`app/web`** — React + Vite. Il negozio 2.5D a schermate: facciata → corsie
  → scaffale → scatola → cassa → buona visione.
- Senza `JELLYFIN_API_KEY` il server parte in **modalità DEMO** con titoli
  finti e copertine SVG: utile per sviluppare la UI.

## Sviluppo locale

```bash
cd app
npm install
npm run dev:server   # Fastify su :8091
npm run dev:web      # Vite su :5173 (proxa /api → :8091)
```

## Deploy (hpserver, accanto a Jellyfin)

```bash
cp .env.example .env   # e compila la API key
docker compose up -d --build
```

Porta `8091`, solo LAN. La API key si crea in Jellyfin → Dashboard → API Keys.

## Note

- Il client TV deve supportare il controllo remoto Jellyfin
  (`SupportsRemoteControl`): il client ufficiale Android TV lo fa; Wholphin è
  da verificare — in caso, tenere il client ufficiale come "ricevitore".
- Copertine con cache 24h lato browser; catalogo con cache 5 min lato server.
