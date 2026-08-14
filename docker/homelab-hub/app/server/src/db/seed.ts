import type { DB } from './index.js';

type SeedDeadline = {
  title: string;
  category: string;
  due_date: string | null;
  alert_days?: number;
  notes?: string;
};

/**
 * Scadenze pre-popolate. due_date null = "data mancante": la voce compare in
 * lista con un badge ma non genera alert. Meglio una riga dichiaratamente
 * incompleta che una data inventata.
 */
const DEADLINES: SeedDeadline[] = [
  {
    title: 'Garanzia NAS Ugreen DH4300 Plus',
    category: 'garanzia',
    due_date: null,
    notes: 'Inserire la data di acquisto.',
  },
  {
    title: 'Garanzia hpserver HP ProDesk 600 G4',
    category: 'garanzia',
    due_date: null,
    notes: 'Probabilmente fuori garanzia: verificare.',
  },
  {
    title: 'Garanzia sda — WD Red Plus 4TB',
    category: 'garanzia',
    due_date: '2028-11-30',
    notes: 'WD Red Plus: 5 anni.',
  },
  {
    title: 'Garanzia sdb — WD Red Plus 4TB',
    category: 'garanzia',
    due_date: '2028-11-30',
    notes: 'Disco in guasto, RMA in corso. 283 settori in attesa.',
  },
  {
    title: 'Garanzia sdc — Seagate IronWolf 12TB',
    category: 'garanzia',
    due_date: null,
    notes: 'IronWolf: 3 anni dalla data di acquisto, da inserire.',
  },
  {
    title: 'Abbonamento Mullvad',
    category: 'abbonamento',
    due_date: null,
    notes: 'Inserire la data di rinnovo.',
  },
  {
    title: 'Certificazione AZ-104',
    category: 'certificazione',
    due_date: null,
    alert_days: 60,
    notes: 'Conseguita. Rinnovo annuale Microsoft: inserire la data.',
  },
  {
    title: 'Certificazione AZ-400',
    category: 'certificazione',
    due_date: '2026-10-31',
    alert_days: 60,
    notes: 'Target esame.',
  },
];

const OBIETTIVI: { label: string; target_cents: number; priority: number }[] = [
  { label: 'HP EliteDesk', target_cents: 37_500, priority: 1 },
  { label: 'Router ASUS', target_cents: 28_000, priority: 2 },
  { label: 'UPS', target_cents: 7_000, priority: 3 },
];

/** Il seed gira una volta sola: la chiave in settings e' il marcatore. */
function unaVolta(db: DB, chiave: string, azione: () => void, log: (m: string) => void): void {
  const fatto = db.prepare('SELECT value FROM settings WHERE key = ?').get(chiave);
  if (fatto) return;
  db.transaction(() => {
    azione();
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(
      chiave,
      new Date().toISOString(),
    );
  })();
  log(`seed applicato: ${chiave}`);
}

export function seed(db: DB, log: (m: string) => void): void {
  unaVolta(
    db,
    'seed_deadlines_v1',
    () => {
      const ins = db.prepare(
        `INSERT INTO deadlines (title, category, due_date, alert_days, notes)
         VALUES (?, ?, ?, ?, ?)`,
      );
      for (const d of DEADLINES) {
        ins.run(d.title, d.category, d.due_date, d.alert_days ?? 90, d.notes ?? null);
      }
    },
    log,
  );

  unaVolta(
    db,
    'seed_goals_v1',
    () => {
      const ins = db.prepare(
        'INSERT INTO savings_goals (label, target_cents, saved_cents, priority) VALUES (?, ?, 0, ?)',
      );
      for (const o of OBIETTIVI) ins.run(o.label, o.target_cents, o.priority);
    },
    log,
  );
}
