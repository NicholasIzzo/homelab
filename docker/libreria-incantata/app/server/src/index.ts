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

    // Un crollo improvviso non è una wishlist svuotata, è una raccolta finita
    // a metà: meglio tenersi l'elenco di ieri che cancellarle mezza lista.
    if (prima > 20 && nuovi.desideri.length < prima * 0.5) {
      app.log.warn(
        `wishlist sospetta: ${nuovi.desideri.length} titoli contro ${prima}, scartata`,
      );
      return;
    }

    desiderata = nuovi;
    desideriAggiornati = new Date().toISOString();
    app.log.info(`wishlist Amazon riletta: ${nuovi.desideri.length} titoli (prima ${prima})`);
  } catch (err) {
    app.log.warn({ err }, "wishlist Amazon non riletta: resta l'elenco precedente");
  }
}

/**
 * Il catalogo Goodreads, con lo stesso trattamento dei desideri: riletto da
 * solo a intervalli invece che alla prima richiesta scaduta. Così un libro
 * aggiunto allo scaffale compare senza che nessuno debba aspettare il
 * caricamento, e se Goodreads non risponde si continua a servire l'ultimo
 * elenco buono.
 */
interface Snapshot {
  lettrice: string;
  libri: Libro[];
  copertine: Map<string, string>;
}
let cache: Snapshot | null = null;
let libriAggiornati: string | null = null;
/** Rilettura in corso: le richieste in arrivo la aspettano invece di duplicarla. */
let letturaInCorso: Promise<void> | null = null;

/** Titolo per una copertina, cercando fra libri e desideri (per il mock SVG). */
function titoloDi(id: string, libri: Libro[]): string {
  return (
    libri.find((l) => l.id === id)?.titolo ??
    desiderata.desideri.find((d) => d.id === id)?.titolo ??
    "Libro"
  );
}

async function aggiornaCatalogo(): Promise<void> {
  if (cfg.mockMode) return;
  if (letturaInCorso) return letturaInCorso;
  letturaInCorso = (async () => {
    try {
      const cat = await scaricaCatalogo(cfg.goodreadsUserId, cfg.goodreadsShelf);
      const prima = cache?.libri.length ?? 0;
      cache = { lettrice: cat.lettrice, libri: cat.libri, copertine: cat.copertine };
      libriAggiornati = new Date().toISOString();
      app.log.info(`scaffale Goodreads riletto: ${cat.libri.length} libri (prima ${prima})`);
    } catch (err) {
      // senza cache non c'è niente da servire: lo segnaliamo come errore, e la
      // prossima richiesta riproverà invece di restare su un buco
      if (cache) app.log.warn({ err }, "Goodreads irraggiungibile: resta l'elenco precedente");
      else app.log.error({ err }, "Goodreads irraggiungibile e nessun elenco in memoria");
    } finally {
      letturaInCorso = null;
    }
  })();
  return letturaInCorso;
}

async function getCatalogo(): Promise<Snapshot> {
  if (cfg.mockMode) {
    const m = catalogoMock();
    return { lettrice: m.lettrice, libri: m.libri, copertine: new Map() };
  }
  if (!cache) await aggiornaCatalogo();
  if (!cache) throw new Error("catalogo Goodreads non disponibile");
  return cache;
}

/** Copertina di un libro o di un desiderio: le due mappe vivono separate. */
function copertinaDi(id: string, cat: Snapshot): string | undefined {
  return cat.copertine.get(id) ?? desiderata.copertine.get(id);
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
    libriAggiornati,
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

  const remota = copertinaDi(id, cat);
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
  // Nessuna delle due letture blocca l'avvio: l'app parte subito (con il file
  // dei desideri incluso) e le due ruote si riempiono appena possibile, poi si
  // rinfrescano da sole. Passi diversi perché le sorgenti lo sono: Goodreads è
  // un feed RSS leggero, la wishlist va raccolta a lotti dalle pagine Amazon.
  void aggiornaCatalogo();
  void aggiornaDesideri();
  const minuti = Math.max(1, cfg.goodreadsMinuti);
  setInterval(() => void aggiornaCatalogo(), minuti * 60_000).unref();
  setInterval(() => void aggiornaDesideri(), Math.max(1, cfg.wishlistOre) * 3600_000).unref();
  app.log.info(`riletture automatiche: Goodreads ogni ${minuti} min, wishlist ogni ${cfg.wishlistOre} h`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
