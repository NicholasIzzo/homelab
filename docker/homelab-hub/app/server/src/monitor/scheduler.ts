import { EventEmitter } from 'node:events';

import { dockerCollector } from '../collectors/docker.js';
import { resticCollector } from '../collectors/restic.js';
import { scrutinyCollector } from '../collectors/scrutiny.js';
import { tlsCollector } from '../collectors/tls.js';
import type { Collector, Source } from '../collectors/types.js';
import { uptimeKumaCollector } from '../collectors/uptimeKuma.js';
import type { DB } from '../db/index.js';
import { purgaStorico, salvaErrore, salvaSuccesso } from './store.js';

export const COLLECTORS: Collector<unknown>[] = [
  resticCollector as Collector<unknown>,
  tlsCollector as Collector<unknown>,
  scrutinyCollector as Collector<unknown>,
  uptimeKumaCollector as Collector<unknown>,
  dockerCollector as Collector<unknown>,
];

/**
 * Un dato e' "stantio" dopo tre cicli mancati: un singolo errore transitorio
 * non deve far lampeggiare la dashboard.
 */
export const STALE_AFTER: Record<Source, number> = COLLECTORS.reduce(
  (acc, c) => ({ ...acc, [c.source]: Math.round((c.intervalMs / 1000) * 3) }),
  {} as Record<Source, number>,
);

type Log = { info: (msg: string) => void; warn: (msg: string) => void };

export class Scheduler extends EventEmitter {
  private timers: NodeJS.Timeout[] = [];
  private inCorso = new Set<Source>();
  private ultimoRefreshManuale = 0;

  constructor(
    private readonly db: DB,
    private readonly log: Log,
    /** Hook usato dalle scadenze per allinearsi ai dati raccolti (es. cert TLS). */
    private readonly afterCollect?: (source: Source, payload: unknown) => void,
  ) {
    super();
  }

  async raccogli(c: Collector<unknown>): Promise<void> {
    if (this.inCorso.has(c.source)) return; // niente esecuzioni sovrapposte
    this.inCorso.add(c.source);
    try {
      const res = await c.run();
      salvaSuccesso(this.db, c.source, res.status, res.payload, res.metric);
      this.afterCollect?.(c.source, res.payload);
      this.emit('collected', c.source);
    } catch (err) {
      const messaggio = err instanceof Error ? err.message : String(err);
      this.log.warn(`collector ${c.source} fallito: ${messaggio}`);
      salvaErrore(this.db, c.source, messaggio);
      this.emit('collected', c.source);
    } finally {
      this.inCorso.delete(c.source);
    }
  }

  /** Rilancia tutti i collector. Limitato a uno ogni 30s per non martellare il NAS. */
  async refreshManuale(): Promise<boolean> {
    if (Date.now() - this.ultimoRefreshManuale < 30_000) return false;
    this.ultimoRefreshManuale = Date.now();
    await Promise.allSettled(COLLECTORS.map((c) => this.raccogli(c)));
    return true;
  }

  start(): void {
    COLLECTORS.forEach((c, i) => {
      // Sfasati di 400ms: al boot non apriamo cinque connessioni insieme.
      setTimeout(() => void this.raccogli(c), i * 400);
      this.timers.push(setInterval(() => void this.raccogli(c), c.intervalMs));
    });

    this.timers.push(
      setInterval(
        () => {
          const n = purgaStorico(this.db);
          if (n > 0) this.log.info(`storico monitoraggio: ${n} righe purgate`);
        },
        24 * 60 * 60_000,
      ),
    );

    this.log.info(`scheduler avviato con ${COLLECTORS.length} collector`);
  }

  stop(): void {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
  }
}
