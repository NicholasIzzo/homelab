import type { FastifyInstance } from 'fastify';

export const PERIODI = ['monthly', 'quarterly', 'semiannual', 'annual'] as const;
export type Periodo = (typeof PERIODI)[number];

/** Divisore per portare una spesa al suo equivalente mensile. */
const DIVISORE: Record<Periodo, number> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  annual: 12,
};

export type Recurring = {
  id: number;
  label: string;
  amount_cents: number;
  currency: string;
  period: Periodo;
  category: string | null;
  active: number;
  started_on: string | null;
  notes: string | null;
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
  archived: number;
};

export function equivalenteMensile(amountCents: number, period: Periodo): number {
  return Math.round(amountCents / (DIVISORE[period] ?? 1));
}

function meseCorrente(): string {
  // Il mese va calcolato nel fuso dell'utente: TZ e' impostata nel container.
  const ora = new Date();
  return `${ora.getFullYear()}-${String(ora.getMonth() + 1).padStart(2, '0')}`;
}

/** Ultimi n mesi in ordine cronologico, incluso quello corrente. */
function ultimiMesi(n: number): string[] {
  const out: string[] = [];
  const ora = new Date();
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(ora.getFullYear(), ora.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

const corpoRicorrente = {
  type: 'object',
  additionalProperties: false,
  properties: {
    label: { type: 'string', minLength: 1, maxLength: 120 },
    amount_cents: { type: 'integer', minimum: 0, maximum: 100_000_000 },
    period: { type: 'string', enum: [...PERIODI] },
    category: { type: ['string', 'null'], maxLength: 60 },
    active: { type: 'integer', minimum: 0, maximum: 1 },
    started_on: { type: ['string', 'null'], pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    notes: { type: ['string', 'null'], maxLength: 300 },
  },
} as const;

const corpoAcquisto = {
  type: 'object',
  additionalProperties: false,
  properties: {
    label: { type: 'string', minLength: 1, maxLength: 120 },
    amount_cents: { type: 'integer', minimum: 0, maximum: 100_000_000 },
    purchased_on: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    category: { type: ['string', 'null'], maxLength: 60 },
    notes: { type: ['string', 'null'], maxLength: 300 },
  },
} as const;

const corpoObiettivo = {
  type: 'object',
  additionalProperties: false,
  properties: {
    label: { type: 'string', minLength: 1, maxLength: 120 },
    target_cents: { type: 'integer', minimum: 1, maximum: 100_000_000 },
    saved_cents: { type: 'integer', minimum: 0, maximum: 100_000_000 },
    target_date: { type: ['string', 'null'], pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    priority: { type: 'integer', minimum: 0, maximum: 99 },
    archived: { type: 'integer', minimum: 0, maximum: 1 },
  },
} as const;

/** Costruisce UPDATE parziale: aggiorna solo i campi effettivamente inviati. */
function patch(
  db: FastifyInstance['db'],
  tabella: string,
  campi: readonly string[],
  id: number,
  body: Record<string, unknown>,
): boolean {
  const set: string[] = [];
  const valori: unknown[] = [];
  for (const c of campi) {
    if (c in body) {
      set.push(`${c} = ?`);
      valori.push(body[c] ?? null);
    }
  }
  if (set.length === 0) return false;
  valori.push(id);
  db.prepare(`UPDATE ${tabella} SET ${set.join(', ')} WHERE id = ?`).run(...valori);
  return true;
}

export async function financeRoutes(app: FastifyInstance): Promise<void> {
  // --- Panoramica: una sola chiamata per l'intera pagina ---
  app.get('/api/finance', async () => {
    const mese = meseCorrente();

    const recurring = app.db
      .prepare('SELECT * FROM recurring_expenses ORDER BY active DESC, label ASC')
      .all() as Recurring[];
    const purchases = app.db
      .prepare('SELECT * FROM purchases ORDER BY purchased_on DESC')
      .all() as Purchase[];
    const goals = app.db
      .prepare('SELECT * FROM savings_goals WHERE archived = 0 ORDER BY priority ASC, label ASC')
      .all() as Goal[];
    const budget = app.db.prepare('SELECT amount_cents FROM budget WHERE month = ?').get(mese) as
      | { amount_cents: number }
      | undefined;

    const mensileRicorrente = recurring
      .filter((r) => r.active === 1)
      .reduce((tot, r) => tot + equivalenteMensile(r.amount_cents, r.period), 0);

    const acquistiMese = purchases
      .filter((p) => p.purchased_on.startsWith(mese))
      .reduce((tot, p) => tot + p.amount_cents, 0);

    const budgetCents = budget?.amount_cents ?? 0;
    const speso = mensileRicorrente + acquistiMese;

    return {
      mese,
      recurring: recurring.map((r) => ({
        ...r,
        monthly_cents: equivalenteMensile(r.amount_cents, r.period),
      })),
      purchases,
      goals: goals.map((g) => {
        const mancante = Math.max(0, g.target_cents - g.saved_cents);
        // Mesi interi al target: sotto 1 mese il conto perde senso.
        const giorni = g.target_date
          ? Math.ceil((new Date(`${g.target_date}T12:00:00`).getTime() - Date.now()) / 86_400_000)
          : null;
        const mesi = giorni !== null && giorni > 0 ? Math.max(1, Math.round(giorni / 30.44)) : null;
        return {
          ...g,
          missing_cents: mancante,
          percent: g.target_cents > 0 ? Math.min(100, (g.saved_cents / g.target_cents) * 100) : 0,
          months_left: mesi,
          per_month_cents: mesi ? Math.ceil(mancante / mesi) : null,
        };
      }),
      budget: {
        amount_cents: budgetCents,
        recurring_monthly_cents: mensileRicorrente,
        purchases_month_cents: acquistiMese,
        spent_cents: speso,
        remaining_cents: budgetCents - speso,
        percent: budgetCents > 0 ? (speso / budgetCents) * 100 : 0,
      },
      totals: {
        recurring_monthly_cents: mensileRicorrente,
        recurring_yearly_cents: mensileRicorrente * 12,
        purchases_total_cents: purchases.reduce((t, p) => t + p.amount_cents, 0),
      },
      // Andamento a 6 mesi. La quota ricorrente e' quella ATTUALE proiettata
      // all'indietro: non conserviamo lo storico degli abbonamenti, quindi e'
      // una linea di base, non una ricostruzione. La UI lo dichiara.
      trend: ultimiMesi(6).map((m) => {
        const acquisti = purchases
          .filter((p) => p.purchased_on.startsWith(m))
          .reduce((t, p) => t + p.amount_cents, 0);
        return {
          month: m,
          purchases_cents: acquisti,
          recurring_cents: mensileRicorrente,
          total_cents: acquisti + mensileRicorrente,
        };
      }),
    };
  });

  // --- Spese ricorrenti ---
  app.post<{ Body: Partial<Recurring> }>(
    '/api/finance/recurring',
    { schema: { body: { ...corpoRicorrente, required: ['label', 'amount_cents'] } } },
    async (req, reply) => {
      const b = req.body;
      const res = app.db
        .prepare(
          `INSERT INTO recurring_expenses (label, amount_cents, period, category, active, started_on, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          b.label,
          b.amount_cents,
          b.period ?? 'monthly',
          b.category ?? null,
          b.active ?? 1,
          b.started_on ?? null,
          b.notes ?? null,
        );
      return reply.code(201).send({ id: Number(res.lastInsertRowid) });
    },
  );

  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>(
    '/api/finance/recurring/:id',
    { schema: { body: corpoRicorrente } },
    async (req) => {
      patch(
        app.db,
        'recurring_expenses',
        ['label', 'amount_cents', 'period', 'category', 'active', 'started_on', 'notes'],
        Number(req.params.id),
        req.body,
      );
      return { ok: true };
    },
  );

  app.delete<{ Params: { id: string } }>('/api/finance/recurring/:id', async (req, reply) => {
    app.db.prepare('DELETE FROM recurring_expenses WHERE id = ?').run(Number(req.params.id));
    return reply.code(204).send();
  });

  // --- Acquisti una tantum ---
  app.post<{ Body: Partial<Purchase> }>(
    '/api/finance/purchases',
    { schema: { body: { ...corpoAcquisto, required: ['label', 'amount_cents', 'purchased_on'] } } },
    async (req, reply) => {
      const b = req.body;
      const res = app.db
        .prepare(
          `INSERT INTO purchases (label, amount_cents, purchased_on, category, notes)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(b.label, b.amount_cents, b.purchased_on, b.category ?? null, b.notes ?? null);
      return reply.code(201).send({ id: Number(res.lastInsertRowid) });
    },
  );

  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>(
    '/api/finance/purchases/:id',
    { schema: { body: corpoAcquisto } },
    async (req) => {
      patch(
        app.db,
        'purchases',
        ['label', 'amount_cents', 'purchased_on', 'category', 'notes'],
        Number(req.params.id),
        req.body,
      );
      return { ok: true };
    },
  );

  app.delete<{ Params: { id: string } }>('/api/finance/purchases/:id', async (req, reply) => {
    app.db.prepare('DELETE FROM purchases WHERE id = ?').run(Number(req.params.id));
    return reply.code(204).send();
  });

  // --- Budget del mese ---
  app.put<{ Body: { amount_cents: number; month?: string } }>(
    '/api/finance/budget',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['amount_cents'],
          properties: {
            amount_cents: { type: 'integer', minimum: 0, maximum: 100_000_000 },
            month: { type: 'string', pattern: '^\\d{4}-\\d{2}$' },
          },
        },
      },
    },
    async (req) => {
      const mese = req.body.month ?? meseCorrente();
      app.db
        .prepare(
          `INSERT INTO budget (month, amount_cents) VALUES (?, ?)
           ON CONFLICT(month) DO UPDATE SET amount_cents = excluded.amount_cents`,
        )
        .run(mese, req.body.amount_cents);
      return { month: mese, amount_cents: req.body.amount_cents };
    },
  );

  // --- Obiettivi di risparmio ---
  app.post<{ Body: Partial<Goal> }>(
    '/api/finance/goals',
    { schema: { body: { ...corpoObiettivo, required: ['label', 'target_cents'] } } },
    async (req, reply) => {
      const b = req.body;
      const res = app.db
        .prepare(
          `INSERT INTO savings_goals (label, target_cents, saved_cents, target_date, priority)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(b.label, b.target_cents, b.saved_cents ?? 0, b.target_date ?? null, b.priority ?? 0);
      return reply.code(201).send({ id: Number(res.lastInsertRowid) });
    },
  );

  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>(
    '/api/finance/goals/:id',
    { schema: { body: corpoObiettivo } },
    async (req) => {
      patch(
        app.db,
        'savings_goals',
        ['label', 'target_cents', 'saved_cents', 'target_date', 'priority', 'archived'],
        Number(req.params.id),
        req.body,
      );
      return { ok: true };
    },
  );

  app.delete<{ Params: { id: string } }>('/api/finance/goals/:id', async (req, reply) => {
    app.db.prepare('DELETE FROM savings_goals WHERE id = ?').run(Number(req.params.id));
    return reply.code(204).send();
  });
}
