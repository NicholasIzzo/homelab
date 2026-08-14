import type { ReactNode } from 'react';

import type { Status } from '../lib/types.ts';

export const COLORE: Record<Status, { testo: string; sfondo: string; bordo: string; riempi: string }> =
  {
    ok: { testo: 'text-ok', sfondo: 'bg-ok/12', bordo: 'border-ok/45', riempi: 'bg-ok' },
    warn: { testo: 'text-warn', sfondo: 'bg-warn/12', bordo: 'border-warn/45', riempi: 'bg-warn' },
    crit: { testo: 'text-crit', sfondo: 'bg-crit/12', bordo: 'border-crit/50', riempi: 'bg-crit' },
    unknown: {
      testo: 'text-muted',
      sfondo: 'bg-surface-2',
      bordo: 'border-line',
      riempi: 'bg-muted',
    },
  };

export const PAROLA: Record<Status, string> = {
  ok: 'ok',
  warn: 'attenzione',
  crit: 'critico',
  unknown: 'ignoto',
};

/**
 * Forma diversa per ogni stato, non solo colore diverso.
 * Verde e ambra restano distinguibili in protanopia solo grazie a questo:
 * cerchio = ok, triangolo = attenzione, rombo = critico, barra = ignoto.
 */
export function Glifo({ status, size = 10 }: { status: Status; size?: number }) {
  const c = { ok: 'fill-ok', warn: 'fill-warn', crit: 'fill-crit', unknown: 'fill-muted' }[status];

  return (
    <svg
      viewBox="0 0 10 10"
      width={size}
      height={size}
      className={`${c} shrink-0`}
      role="img"
      aria-label={PAROLA[status]}
    >
      {status === 'ok' ? <circle cx="5" cy="5" r="4" /> : null}
      {status === 'warn' ? <path d="M5 0.6 L9.6 9 H0.4 Z" /> : null}
      {status === 'crit' ? <path d="M5 0.3 L9.7 5 L5 9.7 L0.3 5 Z" /> : null}
      {status === 'unknown' ? <rect x="0.5" y="4" width="9" height="2" rx="1" /> : null}
    </svg>
  );
}

export function Pill({ status, children }: { status: Status; children: ReactNode }) {
  const c = COLORE[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${c.bordo} ${c.sfondo} ${c.testo}`}
    >
      <Glifo status={status} size={8} />
      {children}
    </span>
  );
}

/**
 * Barra di misura. Estremita' arrotondate ancorate alla base, traccia
 * recessiva, nessuna griglia: il valore si legge dall'etichetta accanto,
 * la barra da' solo la proporzione.
 */
export function Barra({
  percento,
  status,
  altezza = 8,
}: {
  percento: number;
  status: Status;
  altezza?: number;
}) {
  const larghezza = Math.max(0, Math.min(100, percento));
  return (
    <div
      className="w-full overflow-hidden rounded-full bg-surface-2"
      style={{ height: altezza }}
      role="progressbar"
      aria-valuenow={Math.round(larghezza)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={`h-full rounded-full ${COLORE[status].riempi} transition-[width] duration-500`}
        style={{ width: `${larghezza}%` }}
      />
    </div>
  );
}

/** Riquadro sintetico: etichetta piccola, numero grande, stato con forma. */
export function Tessera({
  etichetta,
  valore,
  nota,
  status,
}: {
  etichetta: string;
  valore: ReactNode;
  nota?: string;
  status: Status;
}) {
  const c = COLORE[status];
  return (
    <div className={`card relative overflow-hidden p-3 ${status === 'ok' ? '' : c.bordo}`}>
      {/* Filetto laterale: ripete lo stato senza rubare spazio al numero. */}
      <span className={`absolute inset-y-0 left-0 w-[3px] ${c.riempi}`} aria-hidden="true" />
      <div className="pl-2">
        <div className="flex items-center justify-between gap-2">
          <span className="etichetta">{etichetta}</span>
          <Glifo status={status} size={9} />
        </div>
        <p className={`valore mt-1.5 ${status === 'crit' ? c.testo : 'text-ink'}`}>{valore}</p>
        {nota ? <p className="nota mt-0.5 truncate">{nota}</p> : null}
      </div>
    </div>
  );
}
