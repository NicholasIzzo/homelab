import { sshExec } from './ssh.js';
import { worst, type Collector, type CollectResult, type Status } from './types.js';

export type Container = {
  name: string;
  image: string;
  state: string;
  health: string | null;
  restarts: number;
  started_at: string | null;
  exit_code: number;
  status: Status;
  label: string;
  /** Container che vanno trattati come unita' atomica (stack Mullvad). */
  group: string | null;
};

export type DockerPayload = {
  containers: Container[];
  totale: number;
  in_esecuzione: number;
  problemi: number;
};

/**
 * qBittorrent gira nel namespace di rete di Gluetun: toccarne uno solo lo orfana.
 * La UI li presenta insieme, e l'app non espone comunque nessuna azione.
 */
const GRUPPO_MULLVAD = new Set(['gluetun', 'qbittorrent-vpn']);

/** Oltre questa soglia i riavvii smettono di essere rumore e diventano un sintomo. */
const RESTART_SOSPETTI = 3;

const FORMATO =
  '{{.Name}}|{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' +
  '|{{.RestartCount}}|{{.State.StartedAt}}|{{.Config.Image}}|{{.State.ExitCode}}';

// Una sola invocazione SSH per tutti i container. La guardia su $IDS evita che
// `docker inspect` senza argomenti faccia uscire il comando in errore.
const COMANDO =
  'IDS=$(docker ps -aq); ' +
  `if [ -n "$IDS" ]; then docker inspect --format "${FORMATO}" $IDS; fi`;

function valuta(
  state: string,
  health: string | null,
  restarts: number,
  exitCode: number,
): { status: Status; label: string } {
  if (state === 'restarting') return { status: 'crit', label: 'in riavvio continuo' };

  if (state === 'running') {
    if (health === 'unhealthy') return { status: 'crit', label: 'unhealthy' };
    if (health === 'starting') return { status: 'warn', label: 'in avvio' };
    if (restarts > RESTART_SOSPETTI) {
      return { status: 'warn', label: `attivo, ${restarts} riavvii` };
    }
    return { status: 'ok', label: health === 'healthy' ? 'healthy' : 'attivo' };
  }

  if (state === 'exited') {
    // Uscita pulita = fermato di proposito. Uscita sporca = caduto.
    // Distinguerli evita una dashboard perennemente rossa per container spenti a mano.
    return exitCode === 0
      ? { status: 'warn', label: 'fermo' }
      : { status: 'crit', label: `caduto (exit ${exitCode})` };
  }

  if (state === 'created') return { status: 'warn', label: 'mai avviato' };
  if (state === 'paused') return { status: 'warn', label: 'in pausa' };
  if (state === 'dead') return { status: 'crit', label: 'dead' };

  return { status: 'unknown', label: state };
}

async function run(): Promise<CollectResult<DockerPayload>> {
  const raw = await sshExec(COMANDO, 25_000);

  const containers: Container[] = [];
  for (const riga of raw.split('\n')) {
    const t = riga.trim();
    if (t === '') continue;

    const parti = t.split('|');
    if (parti.length < 7) continue;
    const [nomeGrezzo, state, healthGrezzo, restartsGrezzo, startedAt, image, exitGrezzo] = parti as [
      string,
      string,
      string,
      string,
      string,
      string,
      string,
    ];

    const name = nomeGrezzo.replace(/^\//, '');
    const health = healthGrezzo === 'none' ? null : healthGrezzo;
    const restarts = Number.parseInt(restartsGrezzo, 10) || 0;
    const exitCode = Number.parseInt(exitGrezzo, 10) || 0;
    const { status, label } = valuta(state, health, restarts, exitCode);

    containers.push({
      name,
      image,
      state,
      health,
      restarts,
      // Docker usa la data zero per i container mai avviati.
      started_at: startedAt.startsWith('0001-01-01') ? null : startedAt,
      exit_code: exitCode,
      status,
      label,
      group: GRUPPO_MULLVAD.has(name) ? 'mullvad' : null,
    });
  }

  if (containers.length === 0) throw new Error('nessun container restituito dal NAS');

  const peso: Record<Status, number> = { crit: 0, warn: 1, unknown: 2, ok: 3 };
  containers.sort((a, b) => peso[a.status] - peso[b.status] || a.name.localeCompare(b.name));

  return {
    status: worst(containers.map((c) => c.status)),
    metric: containers.filter((c) => c.status === 'crit').length,
    payload: {
      containers,
      totale: containers.length,
      in_esecuzione: containers.filter((c) => c.state === 'running').length,
      problemi: containers.filter((c) => c.status === 'crit' || c.status === 'warn').length,
    },
  };
}

export const dockerCollector: Collector<DockerPayload> = {
  source: 'docker',
  label: 'Container NAS',
  intervalMs: 60_000,
  run,
};
