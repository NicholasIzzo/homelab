import { useState } from 'react';

import { COLORE, Glifo, Pill } from '../components/Stati.tsx';
import { formattaData, formattaGiorni } from '../lib/format.ts';
import {
  bandaScadenza,
  CATEGORIE,
  useDeadlineMutations,
  useDeadlines,
  type Deadline,
  type DeadlineInput,
} from '../lib/useDeadlines.ts';

const VUOTA: DeadlineInput = {
  title: '',
  category: 'custom',
  due_date: null,
  alert_days: 90,
  notes: null,
};

export function Scadenze() {
  const { data, isLoading } = useDeadlines();
  const { crea, aggiorna, elimina } = useDeadlineMutations();
  const [formAperto, setFormAperto] = useState(false);
  const [inModifica, setInModifica] = useState<Deadline | null>(null);

  if (isLoading) return <p className="py-8 text-center text-sm text-muted">Caricamento…</p>;

  const scadenze = data?.deadlines ?? [];
  const senzaData = scadenze.filter((d) => !d.due_date);
  const conData = scadenze.filter((d) => d.due_date);
  const imminenti = conData.filter((d) => bandaScadenza(d).status !== 'ok');

  const salva = (input: DeadlineInput) => {
    if (inModifica) aggiorna.mutate({ id: inModifica.id, ...input });
    else crea.mutate(input);
    setFormAperto(false);
    setInModifica(null);
  };

  return (
    <>
      {imminenti.length > 0 ? (
        <p className="card mb-2.5 border-warn/45 bg-warn/12 px-4 py-3 text-[13px] text-warn">
          {imminenti.length}{' '}
          {imminenti.length === 1 ? 'scadenza richiede' : 'scadenze richiedono'} attenzione.
        </p>
      ) : null}

      <ul className="mb-3">
        {conData.map((d) => (
          <VoceScadenza
            key={d.id}
            d={d}
            onModifica={() => {
              setInModifica(d);
              setFormAperto(true);
            }}
            onElimina={() => elimina.mutate(d.id)}
          />
        ))}
      </ul>

      {senzaData.length > 0 ? (
        <>
          <h2 className="etichetta mt-5 mb-2 px-1">Da completare</h2>
          <ul className="mb-3">
            {senzaData.map((d) => (
              <VoceScadenza
                key={d.id}
                d={d}
                onModifica={() => {
                  setInModifica(d);
                  setFormAperto(true);
                }}
                onElimina={() => elimina.mutate(d.id)}
              />
            ))}
          </ul>
        </>
      ) : null}

      {formAperto ? (
        <FormScadenza
          iniziale={
            inModifica
              ? {
                  title: inModifica.title,
                  category: inModifica.category,
                  due_date: inModifica.due_date,
                  alert_days: inModifica.alert_days,
                  notes: inModifica.notes,
                }
              : VUOTA
          }
          bloccaData={Boolean(inModifica?.auto_source)}
          onSalva={salva}
          onAnnulla={() => {
            setFormAperto(false);
            setInModifica(null);
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setFormAperto(true)}
          className="w-full rounded-xl border border-accent/40 bg-accent/10 py-3 text-sm font-medium text-accent active:bg-accent/20"
        >
          + Aggiungi scadenza
        </button>
      )}
    </>
  );
}

function VoceScadenza({
  d,
  onModifica,
  onElimina,
}: {
  d: Deadline;
  onModifica: () => void;
  onElimina: () => void;
}) {
  const { status, giorni } = bandaScadenza(d);
  const automatica = Boolean(d.auto_source);

  return (
    <li className="card mb-2.5 p-3.5">
      <div className="flex items-start gap-2.5">
        <span className="mt-1">
          <Glifo status={status} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[14px] leading-tight font-semibold">{d.title}</p>
            {giorni !== null ? (
              <span className={`nota tabular shrink-0 font-semibold ${COLORE[status].testo}`}>
                {formattaGiorni(giorni)}
              </span>
            ) : null}
          </div>
          <p className="nota mt-1">
            {d.due_date ? formattaData(d.due_date) : 'nessuna data impostata'}
          </p>
          {d.notes ? <p className="nota mt-1">{d.notes}</p> : null}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {!d.due_date ? <Pill status="unknown">data mancante</Pill> : null}
            {automatica ? <Pill status="ok">automatica</Pill> : null}
            <span className="nota">preavviso {d.alert_days} gg</span>
          </div>
        </div>
      </div>

      <div className="mt-3 flex gap-2 border-t border-line/70 pt-2.5">
        <button
          type="button"
          onClick={onModifica}
          className="nota flex-1 rounded-lg bg-surface-2 py-2 font-medium active:bg-line"
        >
          Modifica
        </button>
        {!automatica ? (
          <button
            type="button"
            onClick={onElimina}
            className="nota flex-1 rounded-lg bg-surface-2 py-2 font-medium text-crit active:bg-line"
          >
            Elimina
          </button>
        ) : null}
      </div>
    </li>
  );
}

function FormScadenza({
  iniziale,
  bloccaData,
  onSalva,
  onAnnulla,
}: {
  iniziale: DeadlineInput;
  bloccaData: boolean;
  onSalva: (v: DeadlineInput) => void;
  onAnnulla: () => void;
}) {
  const [v, setV] = useState(iniziale);
  const campo = 'w-full rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm text-ink';

  return (
    <form
      className="card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (v.title.trim() === '') return;
        onSalva({ ...v, title: v.title.trim(), notes: v.notes?.trim() || null });
      }}
    >
      <label className="mb-2 block">
        <span className="mb-1 block text-xs text-muted">Titolo</span>
        <input
          className={campo}
          value={v.title}
          onChange={(e) => setV({ ...v, title: e.target.value })}
          placeholder="Es. Rinnovo dominio"
          required
        />
      </label>

      <label className="mb-2 block">
        <span className="mb-1 block text-xs text-muted">Categoria</span>
        <select
          className={campo}
          value={v.category}
          onChange={(e) => setV({ ...v, category: e.target.value })}
        >
          {CATEGORIE.map((c) => (
            <option key={c.valore} value={c.valore}>
              {c.etichetta}
            </option>
          ))}
        </select>
      </label>

      <div className="mb-2 grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-xs text-muted">Data</span>
          <input
            type="date"
            className={`${campo} disabled:opacity-50`}
            value={v.due_date ?? ''}
            disabled={bloccaData}
            onChange={(e) => setV({ ...v, due_date: e.target.value || null })}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted">Preavviso (gg)</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={3650}
            className={campo}
            value={v.alert_days}
            onChange={(e) => setV({ ...v, alert_days: Number(e.target.value) || 90 })}
          />
        </label>
      </div>

      {bloccaData ? (
        <p className="mb-2 text-xs text-muted">
          La data arriva dal controllo del certificato e non e&apos; modificabile.
        </p>
      ) : null}

      <label className="mb-3 block">
        <span className="mb-1 block text-xs text-muted">Note</span>
        <textarea
          className={campo}
          rows={2}
          value={v.notes ?? ''}
          onChange={(e) => setV({ ...v, notes: e.target.value || null })}
        />
      </label>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onAnnulla}
          className="flex-1 rounded-lg bg-surface-2 py-2.5 text-sm font-medium text-muted"
        >
          Annulla
        </button>
        <button
          type="submit"
          className="flex-1 rounded-lg bg-accent py-2.5 text-sm font-semibold text-bg"
        >
          Salva
        </button>
      </div>
    </form>
  );
}
