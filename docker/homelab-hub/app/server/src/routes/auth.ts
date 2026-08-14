import type { FastifyInstance } from 'fastify';

import { verificaPassword } from '../auth/password.js';
import {
  COOKIE,
  creaSessione,
  distruggiSessione,
  opzioniCookie,
  verificaSessione,
} from '../auth/session.js';
import { config } from '../config.js';

const FINESTRA_MS = 15 * 60_000;
const MAX_TENTATIVI = 5;

type Tentativi = { conteggio: number; primo: number };
const falliti = new Map<string, Tentativi>();

/** Rate limit per IP a finestra scorrevole: 5 tentativi ogni 15 minuti. */
function bloccato(ip: string): number | null {
  const t = falliti.get(ip);
  if (!t) return null;

  if (Date.now() - t.primo > FINESTRA_MS) {
    falliti.delete(ip);
    return null;
  }
  if (t.conteggio < MAX_TENTATIVI) return null;

  return Math.ceil((FINESTRA_MS - (Date.now() - t.primo)) / 1000);
}

function registraFallimento(ip: string): void {
  const t = falliti.get(ip);
  if (!t || Date.now() - t.primo > FINESTRA_MS) {
    falliti.set(ip, { conteggio: 1, primo: Date.now() });
  } else {
    t.conteggio += 1;
  }
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/auth/me', async (req) => ({
    // configured = false significa hash assente oppure illeggibile: la UI mostra
    // il motivo invece di un form che non potrebbe funzionare.
    configured: Boolean(config.auth.passwordHash),
    problema: config.auth.problemaHash ?? null,
    authenticated: verificaSessione(app.db, req.cookies[COOKIE]).valida,
  }));

  app.post<{ Body: { password: string } }>(
    '/api/auth/login',
    {
      schema: {
        body: {
          type: 'object',
          required: ['password'],
          additionalProperties: false,
          properties: { password: { type: 'string', minLength: 1, maxLength: 200 } },
        },
      },
    },
    async (req, reply) => {
      if (!config.auth.passwordHash) {
        return reply.code(503).send({ error: 'autenticazione_non_configurata' });
      }

      const ip = req.ip;
      const attesa = bloccato(ip);
      if (attesa !== null) {
        return reply
          .code(429)
          .send({ error: 'troppi_tentativi', retry_after_s: attesa });
      }

      const ok = await verificaPassword(config.auth.passwordHash, req.body.password);
      if (!ok) {
        registraFallimento(ip);
        app.log.warn(`login fallito da ${ip}`);
        return reply.code(401).send({ error: 'credenziali_non_valide' });
      }

      falliti.delete(ip);
      const sessione = creaSessione(app.db, req.headers['user-agent']);
      reply.setCookie(COOKIE, sessione.token, opzioniCookie(sessione.scadenza));
      app.log.info(`login riuscito da ${ip}`);
      return { ok: true, expires_at: sessione.scadenza.toISOString() };
    },
  );

  app.post('/api/auth/logout', async (req, reply) => {
    distruggiSessione(app.db, req.cookies[COOKIE]);
    reply.clearCookie(COOKIE, { path: '/' });
    return { ok: true };
  });
}
