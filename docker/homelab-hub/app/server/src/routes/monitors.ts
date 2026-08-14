import type { FastifyInstance } from 'fastify';

import { SOURCES, worst, type Source } from '../collectors/types.js';
import { COLLECTORS, STALE_AFTER } from '../monitor/scheduler.js';
import { leggiStati } from '../monitor/store.js';

const ETICHETTE: Record<Source, string> = COLLECTORS.reduce(
  (acc, c) => ({ ...acc, [c.source]: c.label }),
  {} as Record<Source, string>,
);

export async function monitorRoutes(app: FastifyInstance): Promise<void> {
  const stati = () => {
    const presenti = leggiStati(app.db, STALE_AFTER);
    const mappa = new Map(presenti.map((s) => [s.source, s]));

    // Le sorgenti mai raccolte devono comunque comparire, come 'unknown':
    // una sezione che sparisce e' peggio di una che dichiara di non sapere.
    return SOURCES.map(
      (source) =>
        mappa.get(source) ?? {
          source,
          status: 'unknown' as const,
          payload: null,
          collected_at: null,
          error: null,
          stale: true,
          stale_after_s: STALE_AFTER[source] ?? 300,
        },
    ).map((s) => ({ ...s, label: ETICHETTE[s.source] ?? s.source }));
  };

  app.get('/api/monitors', async () => {
    const lista = stati();
    return {
      monitors: lista,
      // Uno stantio non e' un guasto, ma non e' nemmeno un "tutto ok".
      status: worst(lista.map((s) => (s.stale && s.status === 'ok' ? 'warn' : s.status))),
      generated_at: new Date().toISOString(),
    };
  });

  app.get<{ Params: { source: string } }>('/api/monitors/:source', async (req, reply) => {
    const trovato = stati().find((s) => s.source === req.params.source);
    if (!trovato) return reply.code(404).send({ error: 'sorgente_sconosciuta' });
    return trovato;
  });

  app.post('/api/monitors/refresh', async (_req, reply) => {
    const eseguito = await app.scheduler.refreshManuale();
    if (!eseguito) {
      return reply.code(429).send({ error: 'troppo_frequente', retry_after_s: 30 });
    }
    return { ok: true };
  });

  // SSE: il frontend non deve fare polling per accorgersi di un cambiamento.
  app.get('/api/stream', (req, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    reply.raw.write('retry: 5000\n\n');

    const onCollected = (source: Source) => {
      reply.raw.write(`event: collected\ndata: ${JSON.stringify({ source })}\n\n`);
    };
    app.scheduler.on('collected', onCollected);

    // Commento periodico: tiene viva la connessione attraverso i proxy.
    const ping = setInterval(() => reply.raw.write(': ping\n\n'), 25_000);

    req.raw.on('close', () => {
      clearInterval(ping);
      app.scheduler.off('collected', onCollected);
    });
  });
}
