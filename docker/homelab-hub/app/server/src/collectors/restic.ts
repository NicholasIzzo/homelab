import { config } from '../config.js';
import { sshExec } from './ssh.js';
import type { Collector, CollectResult, Status } from './types.js';

export type BackupPayload = {
  last_run: string | null;
  exit_code: number | null;
  message: string | null;
  age_hours: number | null;
};

/** Oltre questa eta' il backup e' considerato stantio: il job gira ogni notte. */
const STALE_HOURS = 36;

function valuta(exit: number, ageHours: number): Status {
  if (exit !== 0) return 'crit';
  return ageHours >= STALE_HOURS ? 'warn' : 'ok';
}

async function run(): Promise<CollectResult<BackupPayload>> {
  const raw = await sshExec(`cat ${config.nas.resticStatePath}`);

  let parsed: { last_run?: string; exit?: number; msg?: string };
  try {
    parsed = JSON.parse(raw) as typeof parsed;
  } catch {
    throw new Error(`state.json non e' JSON valido: ${raw.slice(0, 120)}`);
  }

  if (typeof parsed.last_run !== 'string' || typeof parsed.exit !== 'number') {
    throw new Error('state.json privo dei campi last_run/exit');
  }

  const ts = new Date(parsed.last_run);
  if (Number.isNaN(ts.getTime())) {
    throw new Error(`last_run non parsabile: ${parsed.last_run}`);
  }

  const ageHours = (Date.now() - ts.getTime()) / 3_600_000;

  return {
    status: valuta(parsed.exit, ageHours),
    metric: Math.round(ageHours * 10) / 10,
    payload: {
      last_run: ts.toISOString(),
      exit_code: parsed.exit,
      message: parsed.msg ?? null,
      age_hours: Math.round(ageHours * 10) / 10,
    },
  };
}

export const resticCollector: Collector<BackupPayload> = {
  source: 'backup',
  label: 'Backup Restic',
  intervalMs: 15 * 60_000,
  run,
};
