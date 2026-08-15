import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { Readable } from "node:stream";
import { loadConfig } from "./config.js";
import { scaricaCatalogo } from "./goodreads.js";
import { caricaDesideri } from "./desideri.js";
import { costruisciScaffali } from "./scaffali.js";
import { catalogoMock, copertinaMockSvg } from "./mock.js";
import type { BibliotecaPayload, Libro } from "./tipi.js";

const cfg = loadConfig();
const app = Fastify({ logger: true });

// I desideri sono statici: si caricano una volta all'avvio.
const desiderata = await caricaDesideri(cfg.desideriPath);

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

app.get("/api/health", async () => ({ ok: true, mock: cfg.mockMode }));

app.get("/api/biblioteca", async (): Promise<BibliotecaPayload> => {
  const cat = await getCatalogo();
  return {
    lettrice: cfg.lettrice || cat.lettrice || "la tua biblioteca",
    scaffali: costruisciScaffali(cat.libri),
    desideri: desiderata.desideri,
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
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
