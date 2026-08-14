export type Status = 'ok' | 'warn' | 'crit' | 'unknown';
export type Source = 'backup' | 'tls' | 'disks' | 'uptime' | 'docker';

export type MonitorState<T = unknown> = {
  source: Source;
  label: string;
  status: Status;
  payload: T | null;
  collected_at: string | null;
  error: string | null;
  stale: boolean;
  stale_after_s: number;
};

export type MonitorsResponse = {
  monitors: MonitorState[];
  status: Status;
  generated_at: string;
};

export type BackupPayload = {
  last_run: string | null;
  exit_code: number | null;
  message: string | null;
  age_hours: number | null;
};

export type TlsPayload = {
  host: string;
  port: number;
  servername: string;
  subject: string | null;
  issuer: string | null;
  valid_from: string | null;
  valid_to: string | null;
  days_remaining: number | null;
};

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
  group: string | null;
};

export type DockerPayload = {
  containers: Container[];
  totale: number;
  in_esecuzione: number;
  problemi: number;
};
