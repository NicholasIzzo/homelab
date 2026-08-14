import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from './api.ts';

export type Periodo = 'monthly' | 'quarterly' | 'semiannual' | 'annual';

export const PERIODI: { valore: Periodo; etichetta: string }[] = [
  { valore: 'monthly', etichetta: 'Mensile' },
  { valore: 'quarterly', etichetta: 'Trimestrale' },
  { valore: 'semiannual', etichetta: 'Semestrale' },
  { valore: 'annual', etichetta: 'Annuale' },
];

export type Recurring = {
  id: number;
  label: string;
  amount_cents: number;
  period: Periodo;
  category: string | null;
  active: number;
  notes: string | null;
  monthly_cents: number;
};

export type Purchase = {
  id: number;
  label: string;
  amount_cents: number;
  purchased_on: string;
  category: string | null;
  notes: string | null;
};

export type Goal = {
  id: number;
  label: string;
  target_cents: number;
  saved_cents: number;
  target_date: string | null;
  priority: number;
  missing_cents: number;
  percent: number;
  months_left: number | null;
  per_month_cents: number | null;
};

export type Finance = {
  mese: string;
  recurring: Recurring[];
  purchases: Purchase[];
  goals: Goal[];
  budget: {
    amount_cents: number;
    recurring_monthly_cents: number;
    purchases_month_cents: number;
    spent_cents: number;
    remaining_cents: number;
    percent: number;
  };
  totals: {
    recurring_monthly_cents: number;
    recurring_yearly_cents: number;
    purchases_total_cents: number;
  };
  trend: {
    month: string;
    purchases_cents: number;
    recurring_cents: number;
    total_cents: number;
  }[];
};

export function useFinance() {
  return useQuery({ queryKey: ['finance'], queryFn: () => api<Finance>('/finance') });
}

/** "12,50" e "12.50" valgono entrambi 1250 centesimi. */
export function euroInCentesimi(testo: string): number | null {
  const pulito = testo.replace(/\s|€/g, '').replace(',', '.');
  if (pulito === '') return null;
  const n = Number.parseFloat(pulito);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export function centesimiInEuro(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

type Corpo = Record<string, unknown>;

export function useFinanceMutations() {
  const qc = useQueryClient();
  const invalida = () => void qc.invalidateQueries({ queryKey: ['finance'] });

  const invia = (path: string, method: string) => (body: Corpo) =>
    api<unknown>(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  return {
    creaRicorrente: useMutation({ mutationFn: invia('/finance/recurring', 'POST'), onSuccess: invalida }),
    eliminaRicorrente: useMutation({
      mutationFn: (id: number) =>
        fetch(`/api/finance/recurring/${id}`, { method: 'DELETE' }).then(() => undefined),
      onSuccess: invalida,
    }),
    creaAcquisto: useMutation({ mutationFn: invia('/finance/purchases', 'POST'), onSuccess: invalida }),
    eliminaAcquisto: useMutation({
      mutationFn: (id: number) =>
        fetch(`/api/finance/purchases/${id}`, { method: 'DELETE' }).then(() => undefined),
      onSuccess: invalida,
    }),
    salvaBudget: useMutation({ mutationFn: invia('/finance/budget', 'PUT'), onSuccess: invalida }),
    aggiornaObiettivo: useMutation({
      mutationFn: ({ id, ...body }: Corpo & { id: number }) =>
        invia(`/finance/goals/${id}`, 'PATCH')(body),
      onSuccess: invalida,
    }),
    creaObiettivo: useMutation({ mutationFn: invia('/finance/goals', 'POST'), onSuccess: invalida }),
    eliminaObiettivo: useMutation({
      mutationFn: (id: number) =>
        fetch(`/api/finance/goals/${id}`, { method: 'DELETE' }).then(() => undefined),
      onSuccess: invalida,
    }),
  };
}
