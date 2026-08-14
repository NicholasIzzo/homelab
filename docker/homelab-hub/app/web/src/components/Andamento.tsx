import { formattaCentesimi } from '../lib/format.ts';

const MESE_BREVE = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

function etichettaMese(iso: string): string {
  const m = Number.parseInt(iso.slice(5, 7), 10);
  return MESE_BREVE[m - 1] ?? iso;
}

export type PuntoTrend = {
  month: string;
  purchases_cents: number;
  recurring_cents: number;
  total_cents: number;
};

/**
 * Spesa mensile degli ultimi sei mesi. Serie unica: nessuna legenda, il titolo
 * la nomina. Etichette dirette solo sul mese corrente e sul massimo, non su
 * ogni barra. Nessuna griglia: la linea di base basta a dare il riferimento.
 */
export function AndamentoSpese({ dati }: { dati: PuntoTrend[] }) {
  if (dati.length === 0) return null;

  const massimo = Math.max(...dati.map((d) => d.total_cents), 1);
  const indiceMax = dati.findIndex((d) => d.total_cents === massimo);
  const ultimo = dati.length - 1;

  return (
    <div>
      <div className="flex h-24 items-end gap-0.5">
        {dati.map((d, i) => {
          const altezza = Math.max(2, (d.total_cents / massimo) * 100);
          const evidenzia = i === ultimo;
          const mostraValore = i === ultimo || i === indiceMax;

          return (
            <div key={d.month} className="flex flex-1 flex-col items-center justify-end gap-1">
              {mostraValore ? (
                <span className="nota tabular whitespace-nowrap text-ink-2">
                  {Math.round(d.total_cents / 100)}€
                </span>
              ) : null}
              <div
                className={`w-full rounded-t-[4px] ${evidenzia ? 'bg-accent' : 'bg-accent/35'}`}
                style={{ height: `${altezza}%` }}
                title={`${etichettaMese(d.month)}: ${formattaCentesimi(d.total_cents)}`}
              />
            </div>
          );
        })}
      </div>

      {/* Linea di base: unico elemento di griglia, volutamente tenue. */}
      <div className="mt-1 h-px w-full bg-line" />

      <div className="mt-1 flex gap-0.5">
        {dati.map((d, i) => (
          <span
            key={d.month}
            className={`nota flex-1 text-center ${i === ultimo ? 'text-ink-2' : ''}`}
          >
            {etichettaMese(d.month)}
          </span>
        ))}
      </div>
    </div>
  );
}
