import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { existsSync } from 'node:fs';

import { config } from './config.js';
import { closeDb, openDb } from './db/index.js';
import { healthRoutes } from './routes/health.js';
import { pkgVersion } from './version.js';

const app = Fastify({
  logger: {
    level: process.env['LOG_LEVEL'] ?? 'info',
    transport: config.env === 'development' ? { target: 'pino-pretty' } : undefined,
  },
  trustProxy: false,
});

async function main(): Promise<void> {
  const db = openDb((msg) => app.log.info(msg));
  app.decorate('db', db);

  await app.register(healthRoutes);

  // Il frontend e' servito dallo stesso processo: un container, un servizio.
  if (existsSync(config.publicDir)) {
    await app.register(fastifyStatic, { root: config.publicDir, index: ['index.html'] });
  } else {
    app.log.warn(`publicDir assente (${config.publicDir}): il frontend non verra' servito`);
  }

  // Fallback SPA: le rotte client-side non esistono sul filesystem.
  // Le rotte /api mancanti restano un 404 JSON onesto, non index.html.
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/')) {
      return reply.code(404).send({ error: 'not_found', path: req.url });
    }
    if (!existsSync(config.publicDir)) {
      return reply.code(503).send({ error: 'frontend_non_disponibile' });
    }
    return reply.type('text/html').sendFile('index.html');
  });

  await app.listen({ host: config.http.host, port: config.http.port });
  app.log.info(
    `Homelab Hub ${pkgVersion} — TZ ${config.tz} — DB ${config.db.path} — static ${config.publicDir}`,
  );
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    app.log.info(`${signal} ricevuto, chiusura in corso`);
    void app
      .close()
      .then(() => closeDb())
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  });
}

main().catch((err: unknown) => {
  app.log.error({ err }, 'avvio fallito');
  process.exit(1);
});
