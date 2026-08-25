import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyRateLimit from "@fastify/rate-limit";
import { Readable } from "node:stream";
import { loadConfig } from "./config.js";
import { scaricaCatalogo } from "./goodreads.js";
import { caricaDesideri } from "./desideri.js";
import { articoliALibri, scaricaWishlist } from "./amazon.js";
import { costruisciScaffali, REGOLE } from "./scaffali.js";
import { catalogoMock, copertinaMockSvg } from "./mock.js";
import type { BibliotecaPayload, Libro } from "./tipi.js";

const cfg = loadConfig();
const app = Fastify({ logger: true });

/**
 * I desideri: si parte dal file incluso, così l'app è subito completa, e si
 * rilegge la wishlist dal vivo poco dopo l'avvio e poi a intervalli. Se Amazon
 * non risponde o cambia struttura si continua a servire l'ultimo elenco buono:
 * una lista ferma è meglio di una lista vuota.
 */
let desiderata = await caricaDesideri(cfg.desideriPath);
let desideriAggiornati: string | null = null;

async function aggiornaDesideri(): Promise<void> {
  if (!cfg.wishlistId) return;
  try {
    const articoli = await scaricaWishlist(cfg.wishlistId);
    const nuovi = articoliALibri(articoli);
    // le copertine del file di riserva restano valide per i libri già visti
    for (const [k, v] of desiderata.copertine) if (!nuovi.copertine.has(k)) nuovi.copertine.set(k, v);
    const prima = desiderata.desideri.length;
    desiderata = nuovi;
    desideriAggiornati = new Date().toISOString();
    app.log.info(`wishlist Amazon riletta: ${nuovi.desideri.length} titoli (prima ${prima})`);
  } catch (err) {
    app.log.warn({ err }, "wishlist Amazon non riletta: resta l'elenco precedente");
  }
}

// Cache del catalogo Goodreads: lo scaffale cambia di rado, niente martellate.
const CATALOGO_TTL_MS = 30 * 60 * 1000;
interface Snapshot {
  lettrice: string;
  libri: Libro[];
  copertine: Map<string, string>;
  at: number;
}
let cache: Snapshot | null = null;

/** Titolo per una copertina, cercando fra libri e desideri (per il mock SVG). */
function titoloDi(id: string, libri: Libro[]): string {
  return (
    libri.find((l) => l.id === id)?.titolo ??
    desiderata.desideri.find((d) => d.id === id)?.titolo ??
    "Libro"
  );
}

async function getCatalogo(): Promise<Snapshot> {
  if (cfg.mockMode) {
    const m = catalogoMock();
    return { lettrice: m.lettrice, libri: m.libri, copertine: new Map(), at: Date.now() };
  }
  if (cache && Date.now() - cache.at < CATALOGO_TTL_MS) return cache;
  try {
    const cat = await scaricaCatalogo(cfg.goodreadsUserId, cfg.goodreadsShelf);
    // fondiamo le copertine dei desideri, così /api/cover le trova tutte.
    const copertine = new Map(cat.copertine);
    for (const [k, v] of desiderata.copertine) copertine.set(k, v);
    cache = { lettrice: cat.lettrice, libri: cat.libri, copertine, at: Date.now() };
    return cache;
  } catch (err) {
    if (cache) {
      app.log.warn({ err }, "Goodreads irraggiungibile: servo l'ultima cache");
      return cache;
    }
    throw err;
  }
}

// Esposta a Internet: un tetto alle richieste per IP. Il catalogo Goodreads
// è già in cache per 30 minuti, quindi il limite serve a proteggere la banda di
// casa e il proxy delle copertine, non la sorgente.
if (cfg.pubblica) {
  await app.register(fastifyRateLimit, {
    max: 240,
    timeWindow: "1 minute",
    allowList: ["127.0.0.1"],
  });
  app.log.info("modalità pubblica: limite di 240 richieste al minuto per IP");
}

// Regole di classificazione, per il client che importa EPUB: la logica di
// smistamento è una sola, e sta qui.
app.get("/api/scaffali", async () => REGOLE);

app.get("/api/health", async () => ({ ok: true, mock: cfg.mockMode }));

app.get("/api/biblioteca", async (): Promise<BibliotecaPayload> => {
  const cat = await getCatalogo();
  return {
    lettrice: cfg.lettrice || cat.lettrice || "la tua biblioteca",
    scaffali: costruisciScaffali(cat.libri),
    desideri: desiderata.desideri,
    desideriAggiornati,
    mock: cfg.mockMode,
  };
});

// Proxy delle copertine: stesso-origine → utilizzabili come texture WebGL
// (le immagini cross-origin senza header CORS "sporcano" la canvas e Three.js
// non le può caricare). Qui la key non serve, ma il pattern è quello.
app.get<{ Params: { id: string } }>("/api/cover/:id", async (req, reply) => {
  const { id } = req.params;
  const cat = await getCatalogo();

  const remota = cat.copertine.get(id) ?? desiderata.copertine.get(id);
  if (!remota) {
    return reply
      .header("content-type", "image/svg+xml")
      .header("cache-control", "public, max-age=3600")
      .send(copertinaMockSvg(id, titoloDi(id, cat.libri)));
  }

  try {
    const upstream = await fetch(remota, {
      headers: { "user-agent": "Mozilla/5.0 (LibreriaIncantata/0.1; homelab)" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!upstream.ok || !upstream.body) {
      return reply
        .header("content-type", "image/svg+xml")
        .send(copertinaMockSvg(id, titoloDi(id, cat.libri)));
    }
    reply
      .header("content-type", upstream.headers.get("content-type") ?? "image/jpeg")
      .header("cache-control", "public, max-age=86400");
    return reply.send(Readable.fromWeb(upstream.body));
  } catch (err) {
    app.log.warn({ err, id }, "copertina non scaricabile, ripiego sul segnaposto");
    return reply
      .header("content-type", "image/svg+xml")
      .send(copertinaMockSvg(id, titoloDi(id, cat.libri)));
  }
});

// In produzione il server serve anche la SPA compilata.
if (cfg.publicDir) {
  await app.register(fastifyStatic, { root: cfg.publicDir });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith("/api/")) {
      return reply.code(404).send({ error: "not found" });
    }
    return reply.sendFile("index.html");
  });
}

try {
  await app.listen({ host: cfg.host, port: cfg.port });
  app.log.info(`Libreria Incantata avviata (mock: ${cfg.mockMode}, desideri: ${desiderata.desideri.length})`);
  // Non si blocca l'avvio per Amazon: l'app parte con il file incluso e la
  // lista si aggiorna appena possibile, poi a intervalli regolari.
  void aggiornaDesideri();
  setInterval(() => void aggiornaDesideri(), Math.max(1, cfg.wishlistOre) * 3600_000).unref();
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
