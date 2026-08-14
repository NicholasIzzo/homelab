import type { DB } from '../db/index.js';
import type { Source, Status } from '../collectors/types.js';

export type StoredState = {
  source: Source;
  status: Status;
  payload: unknown;
  collected_at: string | null;
  error: string | null;
  /** true quando l'ultimo dato buono e' piu' vecchio di quanto dovrebbe. */
  stale: boolean;
  stale_after_s: number;
};

type Row = {
  source: string;
  status: string;
  payload: string | null;
  collected_at: string | null;
  error: string | null;
};

/** Raccolta riuscita: sostituisce payload e stato, azzera l'errore. */
export function salvaSuccesso(
  db: DB,
  source: Source,
  status: Status,
  payload: unknown,
  metric?: number,
): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO monitor_state (source, status, payload, collected_at, error, updated_at)
     VALUES (?, ?, ?, ?, NULL, ?)
     ON CONFLICT(source) DO UPDATE SET
       status = excluded.status, payload = excluded.payload,
       collected_at = excluded.collected_at, error = NULL, updated_at = excluded.updated_at`,
  ).run(source, status, JSON.stringify(payload), now, now);

  db.prepare(
    'INSERT INTO monitor_history (source, status, metric, recorded_at) VALUES (?, ?, ?, ?)',
  ).run(source, status, metric ?? null, now);
}

/**
 * Raccolta fallita: registra l'errore ma CONSERVA l'ultimo payload buono.
 * La UI puo' cosi' mostrare "ultimo dato di N minuti fa" invece del vuoto.
 */
export function salvaErrore(db: DB, source: Source, messaggio: string): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO monitor_state (source, status, payload, collected_at, error, updated_at)
     VALUES (?, 'unknown', NULL, NULL, ?, ?)
     ON CONFLICT(source) DO UPDATE SET error = excluded.error, updated_at = excluded.updated_at`,
  ).run(source, messaggio, now);
}

export function leggiStati(db: DB, staleAfter: Record<Source, number>): StoredState[] {
  const righe = db
    .prepare('SELECT source, status, payload, collected_at, error FROM monitor_state')
    .all() as Row[];

  return righe.map((r) => {
    const source = r.source as Source;
    const soglia = staleAfter[source] ?? 300;
    const eta = r.collected_at ? (Date.now() - new Date(r.collected_at).getTime()) / 1000 : Infinity;

    let payload: unknown = null;
    if (r.payload) {
      try {
        payload = JSON.parse(r.payload);
      } catch {
        payload = null;
      }
    }

    return {
      source,
      status: r.status as Status,
      payload,
      collected_at: r.collected_at,
      error: r.error,
      stale: eta > soglia,
      stale_after_s: soglia,
    };
  });
}

/** Lo storico serve alle sparkline: oltre 30 giorni e' solo peso morto. */
export function purgaStorico(db: DB): number {
  const res = db
    .prepare("DELETE FROM monitor_history WHERE recorded_at < datetime('now', '-30 days')")
    .run();
  return res.changes;
}
