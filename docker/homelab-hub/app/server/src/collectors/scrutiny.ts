import { config } from '../config.js';
import { worst, type Collector, type CollectResult, type Status } from './types.js';

export type DiskAttr = { id: number; label: string; raw: number; critico: boolean };

export type Disk = {
  wwn: string;
  name: string;
  model: string;
  serial: string;
  capacity_bytes: number;
  device_status: number;
  status: Status;
  temp_c: number | null;
  power_on_hours: number | null;
  collected_at: string | null;
  attrs: DiskAttr[];
};

export type DisksPayload = { disks: Disk[] };

// Attributi SMART che vogliamo sempre in chiaro nella UI: sono quelli che
// raccontano un disco che sta cedendo.
const ATTRS_INTERESSANTI: Record<number, string> = {
  5: 'Settori riallocati',
  197: 'Settori in attesa',
  198: 'Errori non correggibili',
  199: 'Errori CRC UDMA',
};

/** device_status Scrutiny: 0 ok · 1 SMART fallito · 2 soglie Scrutiny · 3 entrambi. */
function valuta(deviceStatus: number): Status {
  return deviceStatus === 0 ? 'ok' : 'crit';
}

type SummaryDevice = {
  device?: {
    wwn?: string;
    device_name?: string;
    model_name?: string;
    device_serial_id?: string;
    capacity?: number;
    device_status?: number;
  };
  smart?: { temp?: number; power_on_hours?: number; collector_date?: string };
};

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`${url} ha risposto ${res.status}`);
  return (await res.json()) as T;
}

async function dettagli(wwn: string): Promise<DiskAttr[]> {
  type Details = {
    data?: {
      smart_results?: {
        attrs?: Record<
          string,
          { attribute_id?: number; raw_value?: number; status?: number }
        >;
      }[];
    };
  };

  const d = await getJson<Details>(
    `${config.scrutinyUrl}/api/device/${encodeURIComponent(wwn)}/details`,
  );
  // smart_results e' ordinato dal piu' recente: ci interessa l'ultimo campione.
  const attrs = d.data?.smart_results?.[0]?.attrs ?? {};

  const out: DiskAttr[] = [];
  for (const [id, label] of Object.entries(ATTRS_INTERESSANTI)) {
    const a = attrs[id];
    if (!a || typeof a.raw_value !== 'number') continue;
    out.push({
      id: Number(id),
      label,
      raw: a.raw_value,
      critico: (a.status ?? 0) !== 0,
    });
  }
  return out;
}

async function run(): Promise<CollectResult<DisksPayload>> {
  const summary = await getJson<{ data?: { summary?: Record<string, SummaryDevice> } }>(
    `${config.scrutinyUrl}/api/summary`,
  );

  const entries = Object.entries(summary.data?.summary ?? {});
  if (entries.length === 0) throw new Error('Scrutiny non ha restituito alcun disco');

  const disks: Disk[] = [];
  for (const [wwn, entry] of entries) {
    const dev = entry.device ?? {};
    const deviceStatus = dev.device_status ?? 0;

    // I dettagli SMART costano una chiamata per disco: li chiediamo solo
    // per i dischi che stanno male, dove servono davvero.
    let attrs: DiskAttr[] = [];
    if (deviceStatus !== 0) {
      try {
        attrs = await dettagli(wwn);
      } catch {
        attrs = [];
      }
    }

    disks.push({
      wwn,
      name: dev.device_name ?? '?',
      model: dev.model_name ?? '?',
      serial: dev.device_serial_id ?? '',
      capacity_bytes: dev.capacity ?? 0,
      device_status: deviceStatus,
      status: valuta(deviceStatus),
      temp_c: entry.smart?.temp ?? null,
      power_on_hours: entry.smart?.power_on_hours ?? null,
      collected_at: entry.smart?.collector_date ?? null,
      attrs,
    });
  }

  disks.sort((a, b) => b.device_status - a.device_status || a.name.localeCompare(b.name));

  return {
    status: worst(disks.map((d) => d.status)),
    metric: disks.filter((d) => d.device_status !== 0).length,
    payload: { disks },
  };
}

export const scrutinyCollector: Collector<DisksPayload> = {
  source: 'disks',
  label: 'Salute dischi',
  intervalMs: 15 * 60_000,
  run,
};
