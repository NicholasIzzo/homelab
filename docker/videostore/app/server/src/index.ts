import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { Readable } from "node:stream";
import { loadConfig } from "./config.js";
import { JellyfinClient } from "./jellyfin.js";
import { buildShelves } from "./store.js";
import { mockCoverSvg, mockDevices, mockLibrary } from "./mock.js";
import type { StoreItem, StorePayload } from "./types.js";

const cfg = loadConfig();
const jellyfin = new JellyfinClient(cfg);
const app = Fastify({ logger: true });

// Cache della libreria: il catalogo cambia di rado, niente martellate a Jellyfin.
const LIBRARY_TTL_MS = 5 * 60 * 1000;
let libraryCache: { items: StoreItem[]; at: number } | null = null;

async function getLibrary(): Promise<StoreItem[]> {
  if (cfg.mockMode) return mockLibrary();
  if (libraryCache && Date.now() - libraryCache.at < LIBRARY_TTL_MS) {
    return libraryCache.items;
  }
  const items = await jellyfin.fetchLibrary();
  libraryCache = { items, at: Date.now() };
  return items;
}

app.get("/api/health", async () => ({ ok: true, mock: cfg.mockMode }));

app.get("/api/store", async (): Promise<StorePayload> => {
  const items = await getLibrary();
  return { shelves: buildShelves(items), mock: cfg.mockMode };
});

app.get<{ Params: { id: string }; Querystring: { h?: string; tipo?: string } }>(
  "/api/image/:id",
  async (req, reply) => {
    const { id } = req.params;
    const height = Math.min(Number(req.query.h ?? 450) || 450, 900);

    if (cfg.mockMode) {
      const item = mockLibrary().find((it) => it.id === id);
      if (!item) return reply.code(404).send();
      return reply
        .header("content-type", "image/svg+xml")
        .header("cache-control", "public, max-age=86400")
        .send(mockCoverSvg(item.id, item.title));
    }

    const upstream =
      req.query.tipo === "backdrop"
        ? await jellyfin.fetchBackdropImage(id, height)
        : await jellyfin.fetchPrimaryImage(id, height);
    reply
      .header("content-type", upstream.headers.get("content-type") ?? "image/jpeg")
      .header("cache-control", "public, max-age=86400");
    return reply.send(upstream.body ? Readable.fromWeb(upstream.body) : Buffer.alloc(0));
  },
);

// Tabellone "in arrivo": uscite reali del mese da TMDb (se c'è la key),
// altrimenti gli ultimi arrivi in libreria.
interface Uscita {
  titolo: string;
  data: string;
}
let usciteCache: { payload: { fonte: string; titoli: Uscita[] }; at: number } | null = null;
const USCITE_TTL_MS = 12 * 3600 * 1000;

app.get("/api/uscite", async () => {
  if (usciteCache && Date.now() - usciteCache.at < USCITE_TTL_MS) {
    return usciteCache.payload;
  }

  let payload: { fonte: string; titoli: Uscita[] } | null = null;

  if (cfg.tmdbApiKey) {
    try {
      const params = new URLSearchParams({
        api_key: cfg.tmdbApiKey,
        language: "it-IT",
        region: "IT",
      });
      const res = await fetch(`https://api.themoviedb.org/3/movie/upcoming?${params}`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        const body = (await res.json()) as {
          results?: { title?: string; release_date?: string }[];
        };
        const titoli = (body.results ?? [])
          .filter((r) => r.title && r.release_date)
          .sort((a, b) => (a.release_date ?? "").localeCompare(b.release_date ?? ""))
          .slice(0, 8)
          .map((r) => {
            const d = new Date(r.release_date!);
            return {
              titolo: r.title!,
              data: d.toLocaleDateString("it-IT", { day: "numeric", month: "short" }),
            };
          });
        if (titoli.length > 0) payload = { fonte: "tmdb", titoli };
      }
    } catch (err) {
      app.log.warn({ err }, "TMDb non raggiungibile, ripiego sulla libreria");
    }
  }

  if (!payload && cfg.jellyseerrUrl && cfg.jellyseerrApiKey) {
    try {
      const res = await fetch(
        `${cfg.jellyseerrUrl}/api/v1/discover/movies/upcoming?page=1&language=it`,
        {
          headers: { "X-Api-Key": cfg.jellyseerrApiKey },
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (res.ok) {
        const body = (await res.json()) as {
          results?: { title?: string; originalTitle?: string; releaseDate?: string }[];
        };
        // via i titoli in alfabeti non latini (uscite di altri mercati)
        const latino = (t: string) => {
          const lettere = [...t].filter((c) => /\p{L}/u.test(c));
          if (lettere.length === 0) return false;
          return lettere.filter((c) => /[\p{Script=Latin}]/u.test(c)).length / lettere.length > 0.7;
        };
        const titoli = (body.results ?? [])
          .filter((r) => (r.title || r.originalTitle) && r.releaseDate)
          .filter((r) => latino(r.title || r.originalTitle || ""))
          .sort((a, b) => (a.releaseDate ?? "").localeCompare(b.releaseDate ?? ""))
          .slice(0, 8)
          .map((r) => ({
            titolo: (r.title || r.originalTitle)!,
            data: new Date(r.releaseDate!).toLocaleDateString("it-IT", {
              day: "numeric",
              month: "short",
            }),
          }));
        if (titoli.length > 0) payload = { fonte: "tmdb", titoli };
      }
    } catch (err) {
      app.log.warn({ err }, "Jellyseerr non raggiungibile, ripiego sulla libreria");
    }
  }

  if (!payload) {
    const items = await getLibrary();
    const titoli = [...items]
      .filter((it) => it.dateCreated !== null && it.genres.length > 0)
      .sort((a, b) => (b.dateCreated ?? "").localeCompare(a.dateCreated ?? ""))
      .slice(0, 8)
      .map((it) => ({ titolo: it.title, data: it.year ? String(it.year) : "" }));
    payload = { fonte: "libreria", titoli };
  }

  usciteCache = { payload, at: Date.now() };
  return payload;
});

app.get("/api/devices", async () => {
  if (cfg.mockMode) return { devices: mockDevices(), mock: true };
  return { devices: await jellyfin.fetchControllableSessions(), mock: false };
});

app.post<{ Body: { sessionId?: string; itemId?: string } }>("/api/play", async (req, reply) => {
  const { sessionId, itemId } = req.body ?? {};
  if (!sessionId || !itemId) {
    return reply.code(400).send({ error: "sessionId e itemId obbligatori" });
  }
  if (cfg.mockMode) {
    return { ok: true, avviato: true, mock: true };
  }
  const avviato = await jellyfin.playOnSession(sessionId, itemId);
  return { ok: true, avviato, mock: false };
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
  app.log.info(`Videostore avviato (mock: ${cfg.mockMode})`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
