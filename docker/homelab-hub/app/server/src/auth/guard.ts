import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { config } from '../config.js';
import { COOKIE, opzioniCookie, verificaSessione } from './session.js';

/**
 * Rotte raggiungibili senza sessione. Tutto il resto sotto /api richiede il
 * cookie: elenco esplicito, cosi' una rotta nuova nasce protetta per default.
 */
const PUBBLICHE = new Set(['/api/health', '/api/auth/login', '/api/auth/logout', '/api/auth/me']);

export function registraGuard(app: FastifyInstance): void {
  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    // Gli asset statici restano pubblici: senza lo shell non c'e' schermata di login.
    if (!req.url.startsWith('/api/')) return;

    const percorso = req.url.split('?')[0] ?? req.url;
    if (PUBBLICHE.has(percorso)) return;

    if (!config.auth.passwordHash) {
      return reply.code(503).send({
        error: 'autenticazione_non_configurata',
        messaggio: 'ADMIN_PASSWORD_HASH non impostata: nessun dato viene servito.',
      });
    }

    const esito = verificaSessione(app.db, req.cookies[COOKIE]);
    if (!esito.valida) {
      return reply.code(401).send({ error: 'non_autenticato' });
    }

    if (esito.rinnovata) {
      reply.setCookie(COOKIE, esito.rinnovata.token, opzioniCookie(esito.rinnovata.scadenza));
    }
  });
}
