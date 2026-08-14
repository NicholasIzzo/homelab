-- Schema iniziale Homelab Hub.
-- Tutti gli importi in centesimi interi: nessun float su valuta, mai.

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Ultimo stato noto per ogni sorgente di monitoring.
-- Una riga per sorgente: docker | disks | backup | tls | uptime.
-- payload conserva l'ultimo dato BUONO anche quando error e' valorizzato,
-- cosi' la UI puo' mostrare "ultimo dato di N minuti fa" invece di una schermata vuota.
CREATE TABLE IF NOT EXISTS monitor_state (
  source       TEXT PRIMARY KEY,
  status       TEXT NOT NULL DEFAULT 'unknown',
  payload      TEXT,
  collected_at TEXT,
  error        TEXT,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Serie storica leggera per sparkline. Retention 30 giorni, purge notturno.
CREATE TABLE IF NOT EXISTS monitor_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  source      TEXT NOT NULL,
  subject     TEXT,
  status      TEXT NOT NULL,
  metric      REAL,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_history_source_time
  ON monitor_history (source, recorded_at DESC);

-- category: garanzia | abbonamento | certificazione | tls | custom
-- auto_source NON NULL  -> la data e' gestita da un collector e non e' editabile a mano.
-- due_date NULL         -> voce "data mancante": mostrata ma non genera alert.
CREATE TABLE IF NOT EXISTS deadlines (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'custom',
  due_date    TEXT,
  alert_days  INTEGER NOT NULL DEFAULT 90,
  notes       TEXT,
  url         TEXT,
  auto_source TEXT,
  archived    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_deadlines_due ON deadlines (archived, due_date);

-- period: monthly | quarterly | semiannual | annual
CREATE TABLE IF NOT EXISTS recurring_expenses (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  label        TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency     TEXT NOT NULL DEFAULT 'EUR',
  period       TEXT NOT NULL DEFAULT 'monthly',
  category     TEXT,
  active       INTEGER NOT NULL DEFAULT 1,
  started_on   TEXT,
  notes        TEXT
);

CREATE TABLE IF NOT EXISTS purchases (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  label        TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  purchased_on TEXT NOT NULL,
  category     TEXT,
  notes        TEXT
);
CREATE INDEX IF NOT EXISTS idx_purchases_date ON purchases (purchased_on DESC);

CREATE TABLE IF NOT EXISTS budget (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  month        TEXT NOT NULL UNIQUE,  -- 'YYYY-MM'
  amount_cents INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS savings_goals (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  label        TEXT NOT NULL,
  target_cents INTEGER NOT NULL,
  saved_cents  INTEGER NOT NULL DEFAULT 0,
  target_date  TEXT,
  priority     INTEGER NOT NULL DEFAULT 0,
  archived     INTEGER NOT NULL DEFAULT 0
);
