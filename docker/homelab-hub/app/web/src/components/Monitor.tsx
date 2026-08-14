import type { ReactNode } from 'react';

import { tempoRelativo } from '../lib/format.ts';
import type { MonitorState, Status } from '../lib/types.ts';

const COLORI: Record<Status, { punto: string; testo: string; bordo: string; sfondo: string }> = {
  ok: { punto: 'bg-ok', testo: 'text-ok', bordo: 'border-ok/40', sfondo: 'bg-ok/10' },
  warn: { punto: 'bg-warn', testo: 'text-warn', bordo: 'border-warn/40', sfondo: 'bg-warn/10' },
  crit: { punto: 'bg-crit', testo: 'text-crit', bordo: 'border-crit/50', sfondo: 'bg-crit/10' },
  unknown: { punto: 'bg-muted', testo: 'text-muted', bordo: 'border-line', sfondo: 'bg-surface-2' },
};

export function Punto({ status }: { status: Status }) {
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${COLORI[status].punto}`} />;
}

export function Pill({ status, children }: { status: Status; children: ReactNode }) {
  const c = COLORI[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${c.bordo} ${c.sfondo} ${c.testo}`}
    >
      {children}
    </span>
  );
}

/**
 * Intestazione comune delle sezioni di monitoraggio.
 * Mostra sempre l'eta' del dato: un numero senza data non dice nulla.
 */
export function SezioneMonitor({
  stato,
  titolo,
  riepilogo,
  children,
}: {
  stato: MonitorState | undefined;
  titolo: string;
  riepilogo?: ReactNode;
  children?: ReactNode;
}) {
  const status = stato?.status ?? 'unknown';

  return (
    <section className="mb-3 overflow-hidden rounded-2xl border border-line bg-surface">
      <header className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Punto status={status} />
          <h2 className="truncate text-sm font-semibold">{titolo}</h2>
        </div>
        <div className="shrink-0 text-xs text-muted">{riepilogo}</div>
      </header>

      {stato?.error ? (
        <p className="mx-4 mb-3 rounded-lg border border-crit/40 bg-crit/10 px-3 py-2 text-xs text-crit">
          Raccolta fallita: {stato.error}
          {stato.collected_at ? (
            <span className="mt-1 block text-muted">
              In tabella l&apos;ultimo dato buono, di {tempoRelativo(stato.collected_at)}.
            </span>
          ) : null}
        </p>
      ) : null}

      {!stato?.error && stato?.stale && stato.collected_at ? (
        <p className="mx-4 mb-3 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
          Dato non aggiornato: ultima raccolta {tempoRelativo(stato.collected_at)}.
        </p>
      ) : null}

      {children}

      <footer className="border-t border-line px-4 py-2 text-[11px] text-muted">
        Aggiornato {tempoRelativo(stato?.collected_at ?? null)}
      </footer>
    </section>
  );
}

export function Riga({
  status,
  nome,
  dettaglio,
  destra,
}: {
  status: Status;
  nome: string;
  dettaglio?: ReactNode;
  destra?: ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 border-t border-line/60 px-4 py-2.5 first:border-t-0">
      <Punto status={status} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{nome}</p>
        {dettaglio ? <p className="truncate text-xs text-muted">{dettaglio}</p> : null}
      </div>
      {destra ? <div className="shrink-0 text-xs text-muted">{destra}</div> : null}
    </li>
  );
}
