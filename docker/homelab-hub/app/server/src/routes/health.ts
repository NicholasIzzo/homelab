import type { FastifyInstance } from 'fastify';

import { pkgVersion } from '../version.js';

/**
 * Liveness: nessuna autenticazione, usato anche dall'HEALTHCHECK del container.
 * Tocca il DB con una query banale: se SQLite non risponde, il servizio non e' sano.
 */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/health', async (_req, reply) => {
    try {
      app.db.prepare('SELECT 1').get();
    } catch (err) {
      app.log.error({ err }, 'healthcheck: DB non raggiungibile');
      return reply.code(503).send({ status: 'degraded', db: false });
    }

    return reply.send({
      status: 'ok',
      version: pkgVersion,
      db: true,
      uptime_s: Math.round(process.uptime()),
      now: new Date().toISOString(),
    });
  });
}
