-- Sessioni persistenti: sopravvivono al riavvio del container, cosi' la PWA
-- sull'iPhone non ti rimanda al login ogni volta che aggiorni l'app.
--
-- In `id` sta lo SHA-256 del token, non il token: chi legge il database non
-- ottiene comunque una sessione utilizzabile.
CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen  TEXT NOT NULL,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at);
