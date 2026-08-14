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

// --- Dati reali del homelab -------------------------------------------------
//
// Convenzione sulle date: dove conosco solo il mese uso il giorno 1 per le
// garanzie (l'allarme scatta prima, mai dopo) e il 15 per gli acquisti (mese
// giusto, giorno neutro). Ogni voce interessata lo dichiara nelle note.

const RICORRENTI = [
  { label: 'Mullvad VPN', cents: 500, categoria: 'VPN', note: null },
  { label: 'Claude Pro', cents: 2000, categoria: 'Software', note: 'Piano Pro per Claude Code.' },
  {
    label: 'Elettricita’ homelab',
    cents: 1500,
    categoria: 'Energia',
    note: 'Stima per NAS + hpserver accesi 24/7.',
  },
];

const ACQUISTI = [
  {
    label: 'NAS Ugreen DH4300 Plus',
    cents: 45_000,
    data: '2024-11-15',
    categoria: 'Hardware',
    note: 'Giorno esatto non noto.',
  },
  {
    label: 'HP ProDesk 600 G4 Mini',
    cents: 12_000,
    data: '2024-06-15',
    categoria: 'Hardware',
    note: 'Garanzia gia’ scaduta: nessuna scadenza da monitorare.',
  },
  {
    label: 'WD Red Plus 4TB (sda)',
    cents: 9_500,
    data: '2024-11-15',
    categoria: 'Dischi',
    note: null,
  },
  {
    label: 'WD Red Plus 4TB (sdb)',
    cents: 9_500,
    data: '2024-11-15',
    categoria: 'Dischi',
    note: 'In guasto, RMA da avviare.',
  },
  {
    label: 'Seagate IronWolf 12TB (sdc)',
    cents: 20_000,
    data: '2024-11-15',
    categoria: 'Dischi',
    note: null,
  },
];

const GARANZIE: { titolo: string; data: string; note: string }[] = [
  {
    titolo: 'Garanzia NAS Ugreen DH4300 Plus',
    data: '2026-11-01',
    note: '2 anni dall’acquisto (nov 2024). Giorno impostato al 1º del mese, in anticipo.',
  },
  {
    titolo: 'Garanzia sda — WD Red Plus 4TB',
    data: '2029-11-01',
    note: 'WD Red Plus: 5 anni dall’acquisto (nov 2024).',
  },
  {
    titolo: 'Garanzia sdb — WD Red Plus 4TB',
    data: '2029-11-01',
    note: 'WD Red Plus: 5 anni. DISCO IN GUASTO, RMA da avviare: 283 settori in attesa.',
  },
  {
    titolo: 'Garanzia sdc — Seagate IronWolf 12TB',
    data: '2027-11-01',
    note: 'IronWolf: 3 anni dall’acquisto (nov 2024).',
  },
];

/** Voci del seed iniziale che i dati reali rendono superflue. */
const DA_RIMUOVERE = [
  // Garanzia scaduta: una riga permanentemente rossa e' rumore. L'informazione
  // resta sull'acquisto corrispondente.
  'Garanzia hpserver HP ProDesk 600 G4',
  // Ora e' una spesa ricorrente mensile: come scadenza non significa nulla.
  'Abbonamento Mullvad',
  // Nessuna data di scadenza fornita.
  'Certificazione AZ-104',
];

const OBIETTIVI_REALI = [
  { vecchio: 'UPS', label: 'UPS APC Back-UPS', target: 7_000, data: '2026-10-31', priorita: 1 },
  {
    vecchio: 'HP EliteDesk',
    label: 'HP EliteDesk 800 G6 Mini',
    target: 37_500,
    data: '2027-03-31',
    priorita: 2,
  },
  {
    vecchio: 'Router ASUS',
    label: 'ASUS RT-BE86U',
    target: 28_000,
    data: '2027-06-30',
    priorita: 3,
  },
];

function seedDatiReali(db: DB, log: (m: string) => void): void {
  const aggiornaScadenza = db.prepare(
    'UPDATE deadlines SET due_date = ?, notes = ? WHERE title = ?',
  );
  for (const g of GARANZIE) {
    const res = aggiornaScadenza.run(g.data, g.note, g.titolo);
    if (res.changes === 0) {
      db.prepare(
        'INSERT INTO deadlines (title, category, due_date, alert_days, notes) VALUES (?, ?, ?, 90, ?)',
      ).run(g.titolo, 'garanzia', g.data, g.note);
      log(`scadenza creata (non trovata da aggiornare): ${g.titolo}`);
    }
  }

  const elimina = db.prepare('DELETE FROM deadlines WHERE title = ? AND auto_source IS NULL');
  for (const t of DA_RIMUOVERE) elimina.run(t);

  db.prepare(
    'INSERT INTO deadlines (title, category, due_date, alert_days, notes) VALUES (?, ?, NULL, 90, ?)',
  ).run(
    'Certificazione Terraform Associate',
    'certificazione',
    'Da programmare dopo AZ-400. Nessuna data ancora.',
  );

  const insRic = db.prepare(
    'INSERT INTO recurring_expenses (label, amount_cents, period, category, active, notes) VALUES (?, ?, ?, ?, 1, ?)',
  );
  for (const r of RICORRENTI) insRic.run(r.label, r.cents, 'monthly', r.categoria, r.note);

  const insAcq = db.prepare(
    'INSERT INTO purchases (label, amount_cents, purchased_on, category, notes) VALUES (?, ?, ?, ?, ?)',
  );
  for (const a of ACQUISTI) insAcq.run(a.label, a.cents, a.data, a.categoria, a.note);

  const aggObiettivo = db.prepare(
    'UPDATE savings_goals SET label = ?, target_cents = ?, target_date = ?, priority = ? WHERE label = ?',
  );
  for (const o of OBIETTIVI_REALI) {
    const res = aggObiettivo.run(o.label, o.target, o.data, o.priorita, o.vecchio);
    if (res.changes === 0) {
      db.prepare(
        'INSERT INTO savings_goals (label, target_cents, saved_cents, target_date, priority) VALUES (?, ?, 0, ?, ?)',
      ).run(o.label, o.target, o.data, o.priorita);
      log(`obiettivo creato (non trovato da aggiornare): ${o.label}`);
    }
  }
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

  // Gira dopo i due seed base: aggiorna quelle righe con i dati reali.
  unaVolta(db, 'seed_dati_reali_v1', () => seedDatiReali(db, log), log);
}
