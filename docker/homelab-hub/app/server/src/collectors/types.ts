/** Sorgenti di monitoring. Una riga in monitor_state per ciascuna. */
export const SOURCES = ['backup', 'tls', 'disks', 'uptime', 'docker'] as const;
export type Source = (typeof SOURCES)[number];

/** unknown = non ancora raccolto, oppure raccolta fallita senza dati precedenti. */
export type Status = 'ok' | 'warn' | 'crit' | 'unknown';

export type CollectResult<T> = {
  status: Status;
  payload: T;
  /** Metrica sintetica opzionale da conservare nello storico (es. giorni al cert). */
  metric?: number;
};

export type Collector<T = unknown> = {
  source: Source;
  /** Intervallo di polling in millisecondi. */
  intervalMs: number;
  label: string;
  run: () => Promise<CollectResult<T>>;
};

/** Il peggiore fra piu' stati: serve per aggregare N container o N dischi in uno. */
export function worst(statuses: Status[]): Status {
  if (statuses.includes('crit')) return 'crit';
  if (statuses.includes('warn')) return 'warn';
  if (statuses.includes('ok')) return 'ok';
  return 'unknown';
}
