import type { FastifyInstance } from 'fastify';

import type { DB } from '../db/index.js';

export const CATEGORIE = ['garanzia', 'abbonamento', 'certificazione', 'tls', 'custom'] as const;

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

const CAMPI = 'id, title, category, due_date, alert_days, notes, url, auto_source, archived';

const corpo = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string', minLength: 1, maxLength: 120 },
    category: { type: 'string', enum: [...CATEGORIE] },
    due_date: { type: ['string', 'null'], pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    alert_days: { type: 'integer', minimum: 1, maximum: 3650 },
    notes: { type: ['string', 'null'], maxLength: 500 },
    url: { type: ['string', 'null'], maxLength: 300 },
  },
} as const;

/**
 * Allinea la scadenza del certificato TLS a quanto ha visto il collector.
 * La riga esiste come qualsiasi altra scadenza, ma la data non e' modificabile
 * a mano: la fonte di verita' e' l'handshake, non la memoria dell'utente.
 */
export function sincronizzaScadenzaTls(db: DB, validTo: string | null): void {
  if (!validTo) return;
  const data = validTo.slice(0, 10);

  const esistente = db
    .prepare("SELECT id FROM deadlines WHERE auto_source = 'tls' LIMIT 1")
    .get() as { id: number } | undefined;

  if (esistente) {
    db.prepare('UPDATE deadlines SET due_date = ? WHERE id = ?').run(data, esistente.id);
  } else {
    db.prepare(
      `INSERT INTO deadlines (title, category, due_date, alert_days, notes, auto_source)
       VALUES (?, 'tls', ?, 45, ?, 'tls')`,
    ).run(
      'Certificato TLS Vaultwarden',
      data,
      'Aggiornata automaticamente a ogni controllo del certificato.',
    );
  }
}

export async function deadlineRoutes(app: FastifyInstance): Promise<void> {
  const leggi = (id: number) =>
    app.db.prepare(`SELECT ${CAMPI} FROM deadlines WHERE id = ?`).get(id) as Deadline | undefined;

  app.get('/api/deadlines', async () => {
    // Le voci senza data finiscono in fondo: non sono urgenti, sono incomplete.
    const righe = app.db
      .prepare(
        `SELECT ${CAMPI} FROM deadlines WHERE archived = 0
         ORDER BY due_date IS NULL, due_date ASC, title ASC`,
      )
      .all() as Deadline[];
    return { deadlines: righe };
  });

  app.post<{ Body: Partial<Deadline> }>(
    '/api/deadlines',
    { schema: { body: { ...corpo, required: ['title'] } } },
    async (req, reply) => {
      const b = req.body;
      const res = app.db
        .prepare(
          `INSERT INTO deadlines (title, category, due_date, alert_days, notes, url)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          b.title,
          b.category ?? 'custom',
          b.due_date ?? null,
          b.alert_days ?? 90,
          b.notes ?? null,
          b.url ?? null,
        );
      return reply.code(201).send(leggi(Number(res.lastInsertRowid)));
    },
  );

  app.patch<{ Params: { id: string }; Body: Partial<Deadline> }>(
    '/api/deadlines/:id',
    { schema: { body: corpo } },
    async (req, reply) => {
      const id = Number(req.params.id);
      const attuale = leggi(id);
      if (!attuale) return reply.code(404).send({ error: 'non_trovata' });

      const b = { ...req.body };
      // La data delle voci automatiche appartiene al collector.
      if (attuale.auto_source) delete b.due_date;

      const campi = ['title', 'category', 'due_date', 'alert_days', 'notes', 'url'] as const;
      const set: string[] = [];
      const valori: unknown[] = [];
      for (const c of campi) {
        if (c in b) {
          set.push(`${c} = ?`);
          valori.push(b[c] ?? null);
        }
      }
      if (set.length === 0) return attuale;

      valori.push(id);
      app.db.prepare(`UPDATE deadlines SET ${set.join(', ')} WHERE id = ?`).run(...valori);
      return leggi(id);
    },
  );

  app.delete<{ Params: { id: string } }>('/api/deadlines/:id', async (req, reply) => {
    const id = Number(req.params.id);
    const attuale = leggi(id);
    if (!attuale) return reply.code(404).send({ error: 'non_trovata' });
    if (attuale.auto_source) {
      return reply.code(409).send({
        error: 'gestita_automaticamente',
        messaggio: 'Questa scadenza e\' alimentata da un collector e non si elimina a mano.',
      });
    }
    app.db.prepare('DELETE FROM deadlines WHERE id = ?').run(id);
    return reply.code(204).send();
  });
}
