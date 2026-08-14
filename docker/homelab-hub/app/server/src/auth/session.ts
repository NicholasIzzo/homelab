import { createHash, randomBytes } from 'node:crypto';

import { config } from '../config.js';
import type { DB } from '../db/index.js';

export const COOKIE = 'hub_session';

/** Nel DB finisce solo l'hash: il token in chiaro esiste unicamente nel cookie. */
function impronta(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function fraGiorni(giorni: number): Date {
  return new Date(Date.now() + giorni * 86_400_000);
}

export type Sessione = { token: string; scadenza: Date };

export function creaSessione(db: DB, userAgent: string | undefined): Sessione {
  const token = randomBytes(32).toString('base64url');
  const scadenza = fraGiorni(config.auth.sessionDays);
  const ora = new Date().toISOString();

  db.prepare(
    'INSERT INTO sessions (id, created_at, expires_at, last_seen, user_agent) VALUES (?, ?, ?, ?, ?)',
  ).run(impronta(token), ora, scadenza.toISOString(), ora, userAgent?.slice(0, 200) ?? null);

  return { token, scadenza };
}

export type Verifica = { valida: boolean; rinnovata?: Sessione };

/**
 * Verifica il token e applica il rolling refresh: superata la meta' della vita
 * della sessione, la scadenza viene spostata avanti e il cookie riemesso.
 * Chi apre l'app con regolarita' non rivede mai la schermata di login.
 */
export function verificaSessione(db: DB, token: string | undefined): Verifica {
  if (!token) return { valida: false };

  const id = impronta(token);
  const riga = db
    .prepare('SELECT expires_at, created_at FROM sessions WHERE id = ?')
    .get(id) as { expires_at: string; created_at: string } | undefined;
  if (!riga) return { valida: false };

  const scade = new Date(riga.expires_at).getTime();
  if (Number.isNaN(scade) || scade <= Date.now()) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
    return { valida: false };
  }

  const ora = new Date().toISOString();
  const metaVita = scade - (config.auth.sessionDays * 86_400_000) / 2;

  if (Date.now() > metaVita) {
    const nuova = fraGiorni(config.auth.sessionDays);
    db.prepare('UPDATE sessions SET expires_at = ?, last_seen = ? WHERE id = ?').run(
      nuova.toISOString(),
      ora,
      id,
    );
    return { valida: true, rinnovata: { token, scadenza: nuova } };
  }

  db.prepare('UPDATE sessions SET last_seen = ? WHERE id = ?').run(ora, id);
  return { valida: true };
}

export function distruggiSessione(db: DB, token: string | undefined): void {
  if (!token) return;
  db.prepare('DELETE FROM sessions WHERE id = ?').run(impronta(token));
}

export function purgaSessioni(db: DB): number {
  return db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run().changes;
}

/**
 * `secure` resta disattivabile perche' l'app e' servita in HTTP sull'IP
 * Tailscale: la riservatezza la garantisce WireGuard, non TLS. Con secure
 * attivo il browser non manderebbe mai il cookie e il login sarebbe impossibile.
 */
export function opzioniCookie(scadenza: Date) {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: config.auth.cookieSecure,
    expires: scadenza,
  };
}
