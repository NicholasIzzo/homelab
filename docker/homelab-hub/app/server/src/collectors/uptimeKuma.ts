import { config } from '../config.js';
import { worst, type Collector, type CollectResult, type Status } from './types.js';

export type Monitor = {
  name: string;
  type: string;
  target: string;
  code: number;
  status: Status;
  label: string;
  response_ms: number | null;
  cert_days: number | null;
};

export type UptimePayload = { monitors: Monitor[]; up: number; down: number; totale: number };

/** monitor_status: 0 DOWN · 1 UP · 2 PENDING · 3 MAINTENANCE */
const CODICI: Record<number, { status: Status; label: string }> = {
  0: { status: 'crit', label: 'giu' },
  1: { status: 'ok', label: 'attivo' },
  2: { status: 'warn', label: 'in attesa' },
  // La manutenzione e' voluta: non deve far diventare rossa la dashboard.
  3: { status: 'ok', label: 'manutenzione' },
};

type Sample = { labels: Record<string, string>; value: number };

const RIGA = /^([a-zA-Z_][a-zA-Z0-9_]*)\{(.*)\}\s+(.+)$/;
const ETICHETTA = /([a-zA-Z_][a-zA-Z0-9_]*)="((?:[^"\\]|\\.)*)"/g;

/** Parser minimale del formato di esposizione Prometheus, sufficiente per Kuma. */
function parseMetrics(testo: string): Map<string, Sample[]> {
  const out = new Map<string, Sample[]>();

  for (const riga of testo.split('\n')) {
    const t = riga.trim();
    if (t === '' || t.startsWith('#')) continue;

    const m = RIGA.exec(t);
    if (!m) continue;
    const [, nome, blocco, grezzo] = m;
    if (!nome || blocco === undefined || grezzo === undefined) continue;

    const value = Number.parseFloat(grezzo);
    if (!Number.isFinite(value)) continue; // Kuma emette Nan quando non ha campioni

    const labels: Record<string, string> = {};
    for (const l of blocco.matchAll(ETICHETTA)) {
      const [, k, v] = l;
      if (k && v !== undefined) labels[k] = v.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }

    const lista = out.get(nome) ?? [];
    lista.push({ labels, value });
    out.set(nome, lista);
  }
  return out;
}

function bersaglio(labels: Record<string, string>): string {
  const url = labels['monitor_url'];
  if (url && url !== 'https://' && url !== 'null') return url;
  const host = labels['monitor_hostname'];
  const port = labels['monitor_port'];
  if (host && host !== 'null') return port && port !== 'null' ? `${host}:${port}` : host;
  return '';
}

async function run(): Promise<CollectResult<UptimePayload>> {
  if (!config.uptimeKuma.apiKey) {
    throw new Error('UPTIME_KUMA_API_KEY non configurata');
  }

  // Kuma autentica /metrics in Basic con utente vuoto e la chiave come password.
  const auth = Buffer.from(`:${config.uptimeKuma.apiKey}`).toString('base64');
  const res = await fetch(`${config.uptimeKuma.url}/metrics`, {
    headers: { Authorization: `Basic ${auth}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 401) throw new Error('Uptime Kuma ha rifiutato la API key (401)');
  if (!res.ok) throw new Error(`Uptime Kuma ha risposto ${res.status}`);

  const metrics = parseMetrics(await res.text());
  const stati = metrics.get('monitor_status') ?? [];
  if (stati.length === 0) throw new Error('nessuna metrica monitor_status trovata');

  const perNome = (nome: string, metrica: string): number | null =>
    metrics.get(metrica)?.find((s) => s.labels['monitor_name'] === nome)?.value ?? null;

  const monitors: Monitor[] = stati.map((s) => {
    const nome = s.labels['monitor_name'] ?? '?';
    const codice = Math.round(s.value);
    const mappa = CODICI[codice] ?? { status: 'unknown' as Status, label: `codice ${codice}` };
    const rt = perNome(nome, 'monitor_response_time');

    return {
      name: nome,
      type: s.labels['monitor_type'] ?? '?',
      target: bersaglio(s.labels),
      code: codice,
      status: mappa.status,
      label: mappa.label,
      // Kuma usa -1 come "nessuna misura", non come tempo di risposta.
      response_ms: rt === null || rt < 0 ? null : Math.round(rt * 100) / 100,
      cert_days: perNome(nome, 'monitor_cert_days_remaining'),
    };
  });

  monitors.sort(
    (a, b) => Number(b.status === 'crit') - Number(a.status === 'crit') || a.name.localeCompare(b.name),
  );

  const down = monitors.filter((m) => m.status === 'crit').length;

  return {
    status: worst(monitors.map((m) => m.status)),
    metric: down,
    payload: {
      monitors,
      up: monitors.filter((m) => m.code === 1).length,
      down,
      totale: monitors.length,
    },
  };
}

export const uptimeKumaCollector: Collector<UptimePayload> = {
  source: 'uptime',
  label: 'Uptime Kuma',
  intervalMs: 60_000,
  run,
};
