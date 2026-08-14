import Database from 'better-sqlite3';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { config } from '../config.js';

export type DB = Database.Database;

let instance: DB | undefined;

/**
 * Applica le migrazioni .sql non ancora registrate, in ordine di nome.
 * Ogni migrazione gira in una transazione: o passa intera o non passa.
 */
function migrate(db: DB, log: (msg: string) => void): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const dir = join(import.meta.dirname, 'migrations');
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const applied = new Set(
    db.prepare('SELECT name FROM schema_migrations').all().map((r) => (r as { name: string }).name),
  );
  const insert = db.prepare('INSERT INTO schema_migrations (name) VALUES (?)');

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(dir, file), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      insert.run(file);
    })();
    log(`migrazione applicata: ${file}`);
  }
}

export function openDb(log: (msg: string) => void): DB {
  if (instance) return instance;

  mkdirSync(dirname(config.db.path), { recursive: true });

  const db = new Database(config.db.path);
  // WAL: le letture non si bloccano mentre un collector scrive.
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  migrate(db, log);

  instance = db;
  return db;
}

export function closeDb(): void {
  instance?.close();
  instance = undefined;
}
