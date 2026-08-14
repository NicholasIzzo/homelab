import { useState } from 'react';

import { formattaCentesimi, formattaData } from '../lib/format.ts';
import {
  centesimiInEuro,
  euroInCentesimi,
  PERIODI,
  useFinance,
  useFinanceMutations,
  type Goal,
  type Periodo,
} from '../lib/useFinance.ts';

const campo = 'w-full rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm text-ink';

export function Finanze() {
  const { data, isLoading } = useFinance();
  const m = useFinanceMutations();
  const [nuovaRicorrente, setNuovaRicorrente] = useState(false);
  const [nuovoAcquisto, setNuovoAcquisto] = useState(false);

  if (isLoading || !data) {
    return <p className="py-8 text-center text-sm text-muted">Caricamento…</p>;
  }

  const b = data.budget;
  const sopraBudget = b.amount_cents > 0 && b.spent_cents > b.amount_cents;

  return (
    <>
      {/* --- Budget del mese --- */}
      <section className="mb-3 rounded-2xl border border-line bg-surface p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">Budget di {data.mese}</h2>
          <BudgetInput
            valore={b.amount_cents}
            onSalva={(cents) => m.salvaBudget.mutate({ amount_cents: cents })}
          />
        </div>

        {b.amount_cents > 0 ? (
          <>
            <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-surface-2">
              <div
                className={`h-full rounded-full ${sopraBudget ? 'bg-crit' : b.percent > 80 ? 'bg-warn' : 'bg-ok'}`}
                style={{ width: `${Math.min(100, b.percent)}%` }}
              />
            </div>
            <div className="mt-2 flex justify-between text-xs">
              <span className="text-muted">
                {formattaCentesimi(b.spent_cents)} di {formattaCentesimi(b.amount_cents)}
              </span>
              <span className={sopraBudget ? 'font-semibold text-crit' : 'text-ok'}>
                {sopraBudget
                  ? `oltre di ${formattaCentesimi(-b.remaining_cents)}`
                  : `${formattaCentesimi(b.remaining_cents)} disponibili`}
              </span>
            </div>
            <p className="mt-2 text-xs text-muted">
              Ricorrenti {formattaCentesimi(b.recurring_monthly_cents)} · acquisti del mese{' '}
              {formattaCentesimi(b.purchases_month_cents)}
            </p>
          </>
        ) : (
          <p className="mt-2 text-xs text-muted">
            Imposta un budget mensile per vedere la disponibilita&apos;.
          </p>
        )}
      </section>

      {/* --- Spese ricorrenti --- */}
      <section className="mb-3 rounded-2xl border border-line bg-surface">
        <header className="flex items-baseline justify-between px-4 py-3">
          <h2 className="text-sm font-semibold">Spese ricorrenti</h2>
          <span className="text-xs text-muted">
            {formattaCentesimi(data.totals.recurring_monthly_cents)}/mese ·{' '}
            {formattaCentesimi(data.totals.recurring_yearly_cents)}/anno
          </span>
        </header>

        <ul>
          {data.recurring.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-3 border-t border-line/60 px-4 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className={`truncate text-sm ${r.active ? '' : 'text-muted line-through'}`}>
                  {r.label}
                </p>
                <p className="text-xs text-muted">
                  {formattaCentesimi(r.amount_cents)}{' '}
                  {PERIODI.find((p) => p.valore === r.period)?.etichetta.toLowerCase()}
                  {r.category ? ` · ${r.category}` : ''}
                </p>
              </div>
              <span className="shrink-0 text-sm">{formattaCentesimi(r.monthly_cents)}/mese</span>
              <button
                type="button"
                onClick={() => m.eliminaRicorrente.mutate(r.id)}
                aria-label={`Elimina ${r.label}`}
                className="shrink-0 px-1 text-xs text-muted active:text-crit"
              >
                ✕
              </button>
            </li>
          ))}
          {data.recurring.length === 0 ? (
            <li className="border-t border-line/60 px-4 py-3 text-xs text-muted">
              Nessuna spesa ricorrente.
            </li>
          ) : null}
        </ul>

        <div className="border-t border-line/60 p-3">
          {nuovaRicorrente ? (
            <FormRicorrente
              onAnnulla={() => setNuovaRicorrente(false)}
              onSalva={(v) => {
                m.creaRicorrente.mutate(v);
                setNuovaRicorrente(false);
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setNuovaRicorrente(true)}
              className="w-full rounded-lg bg-surface-2 py-2.5 text-xs font-medium text-accent"
            >
              + Aggiungi spesa ricorrente
            </button>
          )}
        </div>
      </section>

      {/* --- Acquisti una tantum --- */}
      <section className="mb-3 rounded-2xl border border-line bg-surface">
        <header className="flex items-baseline justify-between px-4 py-3">
          <h2 className="text-sm font-semibold">Acquisti hardware</h2>
          <span className="text-xs text-muted">
            totale {formattaCentesimi(data.totals.purchases_total_cents)}
          </span>
        </header>

        <ul>
          {data.purchases.map((p) => (
            <li key={p.id} className="flex items-center gap-3 border-t border-line/60 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{p.label}</p>
                <p className="text-xs text-muted">
                  {formattaData(p.purchased_on)}
                  {p.category ? ` · ${p.category}` : ''}
                </p>
              </div>
              <span className="shrink-0 text-sm">{formattaCentesimi(p.amount_cents)}</span>
              <button
                type="button"
                onClick={() => m.eliminaAcquisto.mutate(p.id)}
                aria-label={`Elimina ${p.label}`}
                className="shrink-0 px-1 text-xs text-muted active:text-crit"
              >
                ✕
              </button>
            </li>
          ))}
          {data.purchases.length === 0 ? (
            <li className="border-t border-line/60 px-4 py-3 text-xs text-muted">
              Nessun acquisto registrato.
            </li>
          ) : null}
        </ul>

        <div className="border-t border-line/60 p-3">
          {nuovoAcquisto ? (
            <FormAcquisto
              onAnnulla={() => setNuovoAcquisto(false)}
              onSalva={(v) => {
                m.creaAcquisto.mutate(v);
                setNuovoAcquisto(false);
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setNuovoAcquisto(true)}
              className="w-full rounded-lg bg-surface-2 py-2.5 text-xs font-medium text-accent"
            >
              + Aggiungi acquisto
            </button>
          )}
        </div>
      </section>

      {/* --- Obiettivi di risparmio --- */}
      <section className="mb-3 rounded-2xl border border-line bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold">Obiettivi di risparmio</h2>
        <ul className="space-y-4">
          {data.goals.map((g) => (
            <VoceObiettivo
              key={g.id}
              g={g}
              onRisparmio={(cents) => m.aggiornaObiettivo.mutate({ id: g.id, saved_cents: cents })}
              onData={(d) => m.aggiornaObiettivo.mutate({ id: g.id, target_date: d })}
            />
          ))}
        </ul>
      </section>
    </>
  );
}

function VoceObiettivo({
  g,
  onRisparmio,
  onData,
}: {
  g: Goal;
  onRisparmio: (cents: number) => void;
  onData: (data: string | null) => void;
}) {
  const [testo, setTesto] = useState(centesimiInEuro(g.saved_cents));
  const completato = g.saved_cents >= g.target_cents;

  return (
    <li>
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-medium">{g.label}</p>
        <p className="text-xs text-muted">
          {formattaCentesimi(g.saved_cents)} / {formattaCentesimi(g.target_cents)}
        </p>
      </div>

      <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className={`h-full rounded-full ${completato ? 'bg-ok' : 'bg-accent'}`}
          style={{ width: `${g.percent}%` }}
        />
      </div>

      <p className="mt-1.5 text-xs text-muted">
        {completato ? (
          <span className="text-ok">Obiettivo raggiunto.</span>
        ) : g.per_month_cents !== null && g.months_left !== null ? (
          <>
            Mancano {formattaCentesimi(g.missing_cents)} —{' '}
            <span className="text-ink">{formattaCentesimi(g.per_month_cents)}/mese</span> per{' '}
            {g.months_left} {g.months_left === 1 ? 'mese' : 'mesi'}
          </>
        ) : (
          <>Mancano {formattaCentesimi(g.missing_cents)} — imposta una data per il piano mensile</>
        )}
      </p>

      <div className="mt-2 flex gap-2">
        <input
          className={`${campo} py-1.5 text-xs`}
          inputMode="decimal"
          value={testo}
          onChange={(e) => setTesto(e.target.value)}
          onBlur={() => {
            const cents = euroInCentesimi(testo);
            if (cents !== null && cents !== g.saved_cents) onRisparmio(cents);
          }}
          aria-label={`Risparmiato per ${g.label}`}
        />
        <input
          type="date"
          className={`${campo} py-1.5 text-xs`}
          value={g.target_date ?? ''}
          onChange={(e) => onData(e.target.value || null)}
          aria-label={`Data obiettivo per ${g.label}`}
        />
      </div>
    </li>
  );
}

function BudgetInput({ valore, onSalva }: { valore: number; onSalva: (cents: number) => void }) {
  const [testo, setTesto] = useState(centesimiInEuro(valore));
  return (
    <span className="flex items-center gap-1 text-sm">
      <input
        className="w-24 rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-right text-sm"
        inputMode="decimal"
        value={testo}
        onChange={(e) => setTesto(e.target.value)}
        onBlur={() => {
          const cents = euroInCentesimi(testo);
          if (cents !== null && cents !== valore) onSalva(cents);
        }}
        aria-label="Budget mensile"
      />
      <span className="text-muted">€</span>
    </span>
  );
}

function FormRicorrente({
  onSalva,
  onAnnulla,
}: {
  onSalva: (v: Record<string, unknown>) => void;
  onAnnulla: () => void;
}) {
  const [label, setLabel] = useState('');
  const [importo, setImporto] = useState('');
  const [period, setPeriod] = useState<Periodo>('monthly');
  const [category, setCategory] = useState('');

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        const cents = euroInCentesimi(importo);
        if (label.trim() === '' || cents === null) return;
        onSalva({
          label: label.trim(),
          amount_cents: cents,
          period,
          category: category.trim() || null,
        });
      }}
    >
      <input
        className={campo}
        placeholder="Descrizione (es. Elettricita')"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        required
      />
      <div className="grid grid-cols-2 gap-2">
        <input
          className={campo}
          inputMode="decimal"
          placeholder="Importo €"
          value={importo}
          onChange={(e) => setImporto(e.target.value)}
          required
        />
        <select
          className={campo}
          value={period}
          onChange={(e) => setPeriod(e.target.value as Periodo)}
        >
          {PERIODI.map((p) => (
            <option key={p.valore} value={p.valore}>
              {p.etichetta}
            </option>
          ))}
        </select>
      </div>
      <input
        className={campo}
        placeholder="Categoria (facoltativa)"
        value={category}
        onChange={(e) => setCategory(e.target.value)}
      />
      <Azioni onAnnulla={onAnnulla} />
    </form>
  );
}

function FormAcquisto({
  onSalva,
  onAnnulla,
}: {
  onSalva: (v: Record<string, unknown>) => void;
  onAnnulla: () => void;
}) {
  const [label, setLabel] = useState('');
  const [importo, setImporto] = useState('');
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        const cents = euroInCentesimi(importo);
        if (label.trim() === '' || cents === null) return;
        onSalva({ label: label.trim(), amount_cents: cents, purchased_on: data });
      }}
    >
      <input
        className={campo}
        placeholder="Descrizione (es. SSD 1TB)"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        required
      />
      <div className="grid grid-cols-2 gap-2">
        <input
          className={campo}
          inputMode="decimal"
          placeholder="Importo €"
          value={importo}
          onChange={(e) => setImporto(e.target.value)}
          required
        />
        <input
          type="date"
          className={campo}
          value={data}
          onChange={(e) => setData(e.target.value)}
          required
        />
      </div>
      <Azioni onAnnulla={onAnnulla} />
    </form>
  );
}

function Azioni({ onAnnulla }: { onAnnulla: () => void }) {
  return (
    <div className="flex gap-2 pt-1">
      <button
        type="button"
        onClick={onAnnulla}
        className="flex-1 rounded-lg bg-surface-2 py-2.5 text-xs font-medium text-muted"
      >
        Annulla
      </button>
      <button
        type="submit"
        className="flex-1 rounded-lg bg-accent py-2.5 text-xs font-semibold text-bg"
      >
        Salva
      </button>
    </div>
  );
}
