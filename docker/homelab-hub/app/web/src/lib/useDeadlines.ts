import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from './api.ts';
import { giorniA } from './format.ts';
import type { Status } from './types.ts';

export type Deadline = {
  id: number;
  title: string;
  category: string;
  due_date: string | null;
  alert_days: number;
  notes: string | null;
  url: string | null;
  auto_source: string | null;
  archived: number;
};

export type DeadlineInput = {
  title: string;
  category: string;
  due_date: string | null;
  alert_days: number;
  notes: string | null;
};

export const CATEGORIE = [
  { valore: 'garanzia', etichetta: 'Garanzia' },
  { valore: 'abbonamento', etichetta: 'Abbonamento' },
  { valore: 'certificazione', etichetta: 'Certificazione' },
  { valore: 'custom', etichetta: 'Altro' },
] as const;

/**
 * Tre bande sulla soglia della voce: rosso entro un terzo del preavviso,
 * ambra dentro il preavviso, verde oltre. Senza data non c'e' urgenza da
 * calcolare, solo un dato mancante.
 */
export function bandaScadenza(d: Deadline): { status: Status; giorni: number | null } {
  const giorni = giorniA(d.due_date);
  if (giorni === null) return { status: 'unknown', giorni: null };
  if (giorni < 0) return { status: 'crit', giorni };
  if (giorni <= Math.max(1, Math.round(d.alert_days / 3))) return { status: 'crit', giorni };
  if (giorni <= d.alert_days) return { status: 'warn', giorni };
  return { status: 'ok', giorni };
}

export function useDeadlines() {
  return useQuery({
    queryKey: ['deadlines'],
    queryFn: () => api<{ deadlines: Deadline[] }>('/deadlines'),
  });
}

export function useDeadlineMutations() {
  const qc = useQueryClient();
  const invalida = () => void qc.invalidateQueries({ queryKey: ['deadlines'] });

  const crea = useMutation({
    mutationFn: (input: DeadlineInput) =>
      api<Deadline>('/deadlines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
    onSuccess: invalida,
  });

  const aggiorna = useMutation({
    mutationFn: ({ id, ...input }: Partial<DeadlineInput> & { id: number }) =>
      api<Deadline>(`/deadlines/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
    onSuccess: invalida,
  });

  const elimina = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/deadlines/${id}`, { method: 'DELETE' }).then((r) => {
        if (!r.ok) throw new Error('eliminazione non riuscita');
      }),
    onSuccess: invalida,
  });

  return { crea, aggiorna, elimina };
}
