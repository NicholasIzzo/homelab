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

`🐉 L'Antro dei Draghi` · `🧚 Le Corti dei Fae` · `🧛 Creature della Notte` ·
`🖤 I Patti Oscuri` · `⚡ Magia & Accademie` · `🏛️ Miti & Leggende` ·
`⚔️ Saghe & Imperi` · `🌆 Mondi Spezzati` · `🔮 Gli Enigmi Sussurrati` ·
`❤️‍🔥 I Cuori in Fiamme` · `✨ Lo Scaffale dei Sospiri` (fuori genere) ·
`⭐ Il Sentiero dei Desideri` (wishlist Amazon).

I generi sono assegnati in `server/src/scaffali.ts` in tre passaggi, dal più
preciso al più generico: **mappa curata** titolo→scaffale (verificata a mano,
libro per libro), poi **regole per autore/serie**, infine **euristica a parole
chiave** per i titoli aggiunti in futuro. Le sole parole chiave sbagliavano
spesso (*Il principe crudele* fra i romanzetti rosa, *Wings* fra i fae).

"Appena Sussurrati" resta una vista dei dati (ripete libri già presenti
altrove) e non diventa un mobile: in 3D i titoli comparirebbero due volte.

## Come è costruita la scena 3D

- `web/src/biblioteca3d/layout.ts` — **motore di layout**, matematica pura senza
  Three.js (quindi verificabile a parte). Dalle dimensioni del mobile ricava i
  ripiani reali, poi distribuisce i libri: file centrate, ripartite su tutti i
  ripiani, con passaggio automatico al ripiano e poi al **modulo successivo**
  quando lo spazio finisce. `verificaPosti()` controlla che ogni libro stia
  dentro il proprio vano e non tocchi il vicino.
- `web/src/biblioteca3d/materiali.ts` — texture procedurali su canvas: legno con
  venatura, **normal map** e mappa di rugosità, parquet, intonaco, insegne.
  Generate una volta e condivise da tutti i mobili.
- `web/src/biblioteca3d/scena.ts` — stanza, mobili, luci e navigazione.

Scelte di resa: `ACESFilmicToneMapping` + environment PMREM per riflessi
credibili, ombre morbide `PCFSoft`, ombre di contatto sotto ogni libro. Le
**strisce LED** sono visibili su ogni ripiano, ma le `RectAreaLight` vere sono
un gruppetto (10, o 4 sui telefoni) che segue chi cammina: una per ripiano
sarebbero decine di luci e il framerate crollerebbe.

Le copertine mantengono **sempre** la proporzione reale dell'immagine: se una
copertina è quadrata il libro si abbassa, non si deforma.

Aprendo con `?diag=1` la console stampa conteggi e violazioni dei bounds.

## Sviluppo

```bash
cd app
npm install
# server (Fastify :8092) + web (Vite con proxy su /api)
npm run dev:server   # in un terminale
npm run dev:web      # in un altro → http://localhost:5173
```

`MOCK=1 npm run dev:server` per titoli finti senza Internet.

## Deploy (hpserver, accanto alla Videoteca)

Gira su **hpserver** (`192.168.0.33`, x86), non sul NAS: carico a runtime
minimo (il 3D sta nel browser) e stesso pattern della Videoteca. Nessun
segreto, nessun `.env` da creare. GitOps dal clone in `~/homelab`:

```bash
cd ~/homelab && git pull
cd docker/libreria-incantata
docker compose up -d --build
```

La biblioteca risponde su `http://192.168.0.33:8092`. Configurabile dal blocco
`environment:` del compose (`GOODREADS_USER_ID`, `GOODREADS_SHELF`, `LETTRICE`).
L'immagine è multi-arch (base `node:22-slim`), quindi funziona anche sul NAS
ARM64 se un domani la sposti.

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
