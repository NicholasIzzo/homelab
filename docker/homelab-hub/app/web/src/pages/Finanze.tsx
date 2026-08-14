import { useState } from 'react';

import { AndamentoSpese } from '../components/Andamento.tsx';
import { Barra, COLORE } from '../components/Stati.tsx';
import { formattaCentesimi, formattaData, formattaMese } from '../lib/format.ts';
import type { Status } from '../lib/types.ts';
import {
  centesimiInEuro,
  euroInCentesimi,
  PERIODI,
  useFinance,
  useFinanceMutations,
  type Goal,
  type Periodo,
} from '../lib/useFinance.ts';

const campo = 'w-full rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-[13px] text-ink';

export function Finanze() {
  const { data, isLoading } = useFinance();
  const m = useFinanceMutations();
  const [nuovaRicorrente, setNuovaRicorrente] = useState(false);
  const [nuovoAcquisto, setNuovoAcquisto] = useState(false);

  if (isLoading || !data) return <p className="corpo py-10 text-center">Caricamento…</p>;

  const b = data.budget;
  const sopraBudget = b.amount_cents > 0 && b.spent_cents > b.amount_cents;
  const statoBudget: Status = sopraBudget ? 'crit' : b.percent > 80 ? 'warn' : 'ok';

  return (
    <>
      {/* --- Budget del mese --- */}
      <section className="card mb-2.5 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="etichetta">Budget di {formattaMese(data.mese)}</p>
            <p className={`valore-xl mt-1.5 ${b.amount_cents > 0 ? COLORE[statoBudget].testo : ''}`}>
              {formattaCentesimi(b.spent_cents)}
            </p>
            {b.amount_cents > 0 ? (
              <p className="nota mt-1">di {formattaCentesimi(b.amount_cents)} previsti</p>
            ) : null}
          </div>
          <BudgetInput
            valore={b.amount_cents}
            onSalva={(cents) => m.salvaBudget.mutate({ amount_cents: cents })}
          />
        </div>

        {b.amount_cents > 0 ? (
          <>
            <div className="mt-3">
              <Barra percento={b.percent} status={statoBudget} altezza={10} />
            </div>
            <div className="mt-2 flex justify-between">
              <span className="nota tabular">
                ricorrenti {formattaCentesimi(b.recurring_monthly_cents)} · acquisti{' '}
                {formattaCentesimi(b.purchases_month_cents)}
              </span>
              <span className={`nota tabular font-semibold ${COLORE[statoBudget].testo}`}>
                {sopraBudget
                  ? `oltre di ${formattaCentesimi(-b.remaining_cents)}`
                  : `${formattaCentesimi(b.remaining_cents)} liberi`}
              </span>
            </div>
          </>
        ) : (
          <p className="nota mt-2">Imposta un budget mensile per vedere la disponibilita&apos;.</p>
        )}
      </section>

      {/* --- Andamento --- */}
      <section className="card mb-2.5 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="titolo-card">Spesa mensile</h2>
          <span className="nota">ultimi 6 mesi</span>
        </div>
        <div className="mt-3">
          <AndamentoSpese dati={data.trend} />
        </div>
        <p className="nota mt-2.5">
          La quota ricorrente e&apos; quella attuale proiettata all&apos;indietro: lo storico degli
          abbonamenti non viene conservato.
        </p>
      </section>

      {/* --- Spese ricorrenti --- */}
      <section className="card mb-2.5 overflow-hidden">
        <header className="flex items-baseline justify-between gap-3 px-4 py-3">
          <h2 className="titolo-card">Spese ricorrenti</h2>
          <span className="nota tabular">
            {formattaCentesimi(data.totals.recurring_monthly_cents)}/mese ·{' '}
            {formattaCentesimi(data.totals.recurring_yearly_cents)}/anno
          </span>
        </header>

        <ul>
          {data.recurring.map((r) => (
            <li key={r.id} className="flex items-center gap-3 border-t border-line/70 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className={`truncate text-[13px] ${r.active ? '' : 'text-muted line-through'}`}>
                  {r.label}
                </p>
                <p className="nota">
                  {formattaCentesimi(r.amount_cents)}{' '}
                  {PERIODI.find((p) => p.valore === r.period)?.etichetta.toLowerCase()}
                  {r.category ? ` · ${r.category}` : ''}
                </p>
              </div>
              <span className="tabular shrink-0 text-[13px] font-semibold">
                {formattaCentesimi(r.monthly_cents)}
              </span>
              <button
                type="button"
                onClick={() => m.eliminaRicorrente.mutate(r.id)}
                aria-label={`Elimina ${r.label}`}
                className="nota shrink-0 px-1 active:text-crit"
              >
                ✕
              </button>
            </li>
          ))}
          {data.recurring.length === 0 ? (
            <li className="nota border-t border-line/70 px-4 py-3">Nessuna spesa ricorrente.</li>
          ) : null}
        </ul>

        <div className="border-t border-line/70 p-3">
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
              className="nota w-full rounded-lg bg-surface-2 py-2.5 font-medium text-accent"
            >
              + Aggiungi spesa ricorrente
            </button>
          )}
        </div>
      </section>

      {/* --- Acquisti una tantum --- */}
      <section className="card mb-2.5 overflow-hidden">
        <header className="flex items-baseline justify-between gap-3 px-4 py-3">
          <h2 className="titolo-card">Acquisti hardware</h2>
          <span className="nota tabular">
            totale {formattaCentesimi(data.totals.purchases_total_cents)}
          </span>
        </header>

        <ul>
          {data.purchases.map((p) => (
            <li key={p.id} className="flex items-center gap-3 border-t border-line/70 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px]">{p.label}</p>
                <p className="nota">
                  {formattaData(p.purchased_on)}
                  {p.category ? ` · ${p.category}` : ''}
                </p>
              </div>
              <span className="tabular shrink-0 text-[13px] font-semibold">
                {formattaCentesimi(p.amount_cents)}
              </span>
              <button
                type="button"
                onClick={() => m.eliminaAcquisto.mutate(p.id)}
                aria-label={`Elimina ${p.label}`}
                className="nota shrink-0 px-1 active:text-crit"
              >
                ✕
              </button>
            </li>
          ))}
          {data.purchases.length === 0 ? (
            <li className="nota border-t border-line/70 px-4 py-3">Nessun acquisto registrato.</li>
          ) : null}
        </ul>

        <div className="border-t border-line/70 p-3">
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
              className="nota w-full rounded-lg bg-surface-2 py-2.5 font-medium text-accent"
            >
              + Aggiungi acquisto
            </button>
          )}
        </div>
      </section>

      {/* --- Obiettivi di risparmio --- */}
      <section className="card mb-2.5 p-4">
        <h2 className="titolo-card mb-3">Obiettivi di risparmio</h2>
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
  // Meno di due mesi al target con quasi tutto ancora da mettere da parte:
  // vale la pena dirlo con un colore, non solo con un numero.
  const stretto = !completato && g.months_left !== null && g.months_left <= 2;

  return (
    <li>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[13px] font-semibold">{g.label}</p>
        <p className="nota tabular shrink-0">
          <span className="text-ink">{formattaCentesimi(g.saved_cents)}</span> /{' '}
          {formattaCentesimi(g.target_cents)}
        </p>
      </div>

      <div className="mt-2">
        <Barra percento={g.percent} status={completato ? 'ok' : 'unknown'} />
      </div>

      <p className={`nota mt-1.5 ${stretto ? COLORE.warn.testo : ''}`}>
        {completato ? (
          <span className={COLORE.ok.testo}>Obiettivo raggiunto.</span>
        ) : g.per_month_cents !== null && g.months_left !== null ? (
          <>
            Mancano {formattaCentesimi(g.missing_cents)} —{' '}
            <span className="font-semibold">{formattaCentesimi(g.per_month_cents)}/mese</span> per{' '}
            {g.months_left} {g.months_left === 1 ? 'mese' : 'mesi'}
          </>
        ) : (
          <>Mancano {formattaCentesimi(g.missing_cents)} — imposta una data per il piano mensile</>
        )}
      </p>

      <div className="mt-2 flex gap-2">
        <input
          className={`${campo} py-1.5 text-[12px]`}
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
          className={`${campo} py-1.5 text-[12px]`}
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
    <label className="shrink-0 text-right">
      <span className="etichetta block">Budget €</span>
      <input
        className="mt-1 w-24 rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-right text-[13px] tabular-nums"
        inputMode="decimal"
        value={testo}
        onChange={(e) => setTesto(e.target.value)}
        onBlur={() => {
          const cents = euroInCentesimi(testo);
          if (cents !== null && cents !== valore) onSalva(cents);
        }}
        aria-label="Budget mensile"
      />
    </label>
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
        className="nota flex-1 rounded-lg bg-surface-2 py-2.5 font-medium"
      >
        Annulla
      </button>
      <button
        type="submit"
        className="flex-1 rounded-lg bg-accent py-2.5 text-[12px] font-semibold text-bg"
      >
        Salva
      </button>
    </div>
  );
}
