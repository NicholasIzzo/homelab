# La Biblioteca Incantata 📚✨

Una libreria 3D a tema fantasy per i libri "da leggere" della mia ragazza.
Cammini fra scaffali incantati a lume di candela, apri le copertine, e quando
sei indecisa la **Ruota del Destino** sceglie un libro a caso con un'animazione
stile roulette. Va da telefono e da PC.

Gemella della [Videoteca](../videostore) (stessa architettura: SPA React +
Three.js e server Fastify in un'unica immagine Docker).

## Sorgenti dati

- **Da leggere** → feed RSS pubblico dello scaffale Goodreads `to-read`
  (`goodreads.com/review/list_rss/<id>?shelf=to-read`). Il server lo scarica,
  lo normalizza e lo tiene in cache 30 min. Quando lei aggiunge un libro su
  Goodreads, ricompare da solo. Niente generi nell'RSS → gli scaffali tematici
  sono dedotti da titolo/serie/autore con parole chiave (`server/src/scaffali.ts`).
- **Desideri** (wishlist Amazon, "da comprare") → statici in
  [`data/desideri.json`](data/desideri.json). Amazon blocca il fetch automatico,
  quindi la lista è una fotografia da aggiornare a mano (vedi sotto).

Le copertine passano **sempre** dal proxy `/api/cover/:id` (stesso-origine):
un'immagine cross-origin senza header CORS non è usabile come texture WebGL.

## Scaffali tematici

`✦ Appena Sussurrati` · `🐉 L'Antro dei Draghi` · `🧚 Le Corti dei Fae` ·
`🖤 I Patti Oscuri` · `🔮 Gli Enigmi Sussurrati` · `⚔️ Saghe & Imperi` ·
`❤️‍🔥 I Cuori in Fiamme` · `✨ Lo Scaffale dei Sospiri` (catch-all).

La classificazione è euristica e volutamente leggera: si regola in `scaffali.ts`.

## Sviluppo

```bash
cd app
npm install
# server (Fastify :8092) + web (Vite con proxy su /api)
npm run dev:server   # in un terminale
npm run dev:web      # in un altro → http://localhost:5173
```

`MOCK=1 npm run dev:server` per titoli finti senza Internet.

## Deploy (NAS, via Dockge)

GitOps: si costruisce sul NAS. L'immagine è multi-arch (base `node:22-slim`,
ok su ARM64). Nessun segreto, nessun `.env` da creare.

```bash
git pull
docker compose up -d --build
```

La biblioteca risponde su `http://<nas>:8092`. Configurabile dal blocco
`environment:` del compose (`GOODREADS_USER_ID`, `GOODREADS_SHELF`, `LETTRICE`).

## Aggiornare la wishlist Amazon

Amazon serve un anti-bot (503) alle richieste automatiche: la
[`data/desideri.json`](data/desideri.json) va rigenerata a mano leggendo la
wishlist con un browser reale (titolo, autore, prezzo, copertina, link ASIN) e
rifacendo il build. Lista attuale: `MPM4BFSYOHU7` (fotografia del 2026-08-15).

## Struttura

```
app/
  server/  Fastify: RSS Goodreads → JSON, proxy copertine, desideri
  web/     React + Three.js: scena 3D, Ruota del Destino, schede, desideri
data/
  desideri.json   wishlist Amazon (statica)
```
