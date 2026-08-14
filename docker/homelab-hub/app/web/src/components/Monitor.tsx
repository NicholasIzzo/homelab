import { useState, type ReactNode } from 'react';

import { tempoRelativo } from '../lib/format.ts';
import type { MonitorState, Status } from '../lib/types.ts';
import { Glifo } from './Stati.tsx';

/**
 * Sezione di monitoraggio. L'intestazione porta stato, titolo e un riepilogo
 * numerico; il pie' di pagina dichiara sempre l'eta' del dato, perche' un
 * numero senza data non dice nulla.
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
    <section className="card mb-2.5 overflow-hidden">
      <header className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Glifo status={status} />
          <h2 className="titolo-card truncate">{titolo}</h2>
        </div>
        {riepilogo ? <span className="nota tabular shrink-0">{riepilogo}</span> : null}
      </header>

      {stato?.error ? (
        <p className="mx-4 mb-3 rounded-lg border border-crit/45 bg-crit/12 px-3 py-2 text-[12px] text-crit">
          Raccolta fallita: {stato.error}
          {stato.collected_at ? (
            <span className="nota mt-1 block">
              Sotto resta l&apos;ultimo dato buono, di {tempoRelativo(stato.collected_at)}.
            </span>
          ) : null}
        </p>
      ) : null}

      {!stato?.error && stato?.stale && stato.collected_at ? (
        <p className="mx-4 mb-3 rounded-lg border border-warn/45 bg-warn/12 px-3 py-2 text-[12px] text-warn">
          Dato non aggiornato: ultima raccolta {tempoRelativo(stato.collected_at)}.
        </p>
      ) : null}

      {children}

      <footer className="nota border-t border-line px-4 py-2">
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
    <li className="flex items-center gap-3 border-t border-line/70 px-4 py-2.5 first:border-t-0">
      <Glifo status={status} size={9} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] text-ink">{nome}</p>
        {dettaglio ? <p className="nota truncate">{dettaglio}</p> : null}
      </div>
      {destra ? <div className="nota tabular shrink-0 text-right">{destra}</div> : null}
    </li>
  );
}

/**
 * Elenco che mostra di default solo le voci problematiche.
 * Trentatre container tutti verdi sono rumore: il colpo d'occhio si perde
 * proprio nella lista piu' lunga.
 */
export function ElencoParziale<T>({
  voci,
  problemi,
  render,
  etichettaTutti,
}: {
  voci: T[];
  problemi: T[];
  render: (v: T) => ReactNode;
  etichettaTutti: string;
}) {
  const [tutti, setTutti] = useState(false);
  const visibili = tutti ? voci : problemi;
  const nascosti = voci.length - problemi.length;

  return (
    <>
      {visibili.length > 0 ? <ul>{visibili.map(render)}</ul> : null}

      {!tutti && problemi.length === 0 ? (
        <p className="border-t border-line/70 px-4 py-3 text-[13px] text-ink-2">
          Nessun problema rilevato.
        </p>
      ) : null}

      {nascosti > 0 ? (
        <button
          type="button"
          onClick={() => setTutti((v) => !v)}
          className="nota w-full border-t border-line/70 py-2.5 text-center active:bg-surface-2"
        >
          {tutti ? 'Mostra solo i problemi' : etichettaTutti}
        </button>
      ) : null}
    </>
  );
}
