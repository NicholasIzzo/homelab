import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

function str(key: string, fallback: string): string {
  const v = process.env[key];
  return v === undefined || v === '' ? fallback : v;
}

function int(key: string, fallback: number): number {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) {
    throw new Error(`Variabile ${key} non e' un intero valido: "${v}"`);
  }
  return n;
}

/** Valore opzionale: assente finche' non arriva la fase che lo usa. */
function opt(key: string): string | undefined {
  const v = process.env[key];
  return v === undefined || v === '' ? undefined : v;
}

function bool(key: string, fallback: boolean): boolean {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  return ['1', 'true', 'yes', 'si'].includes(v.toLowerCase());
}

export const config = {
  env: str('NODE_ENV', 'production'),
  tz: str('TZ', 'Europe/Rome'),

  http: {
    host: str('HTTP_HOST', '0.0.0.0'),
    port: int('HTTP_PORT', 8090),
  },

  // In container: /data/hub.db (volume Docker locale, MAI mount NFS/SMB).
  db: {
    path: str('DB_PATH', '/data/hub.db'),
  },

  // Bundle del frontend. In dev punta alla dist di Vite nel workspace web.
  publicDir: resolve(str('PUBLIC_DIR', join(here, '..', '..', 'web', 'dist'))),

  auth: {
    // Assente = app chiusa: ogni rotta protetta risponde 503 finche' non e'
    // configurata. Non esiste una modalita' "aperta".
    passwordHash: opt('ADMIN_PASSWORD_HASH'),
    sessionDays: int('SESSION_DAYS', 90),
    // Falso perche' l'app gira in HTTP sull'IP Tailscale: con secure attivo il
    // browser non invierebbe mai il cookie. Da mettere a true dietro HTTPS.
    cookieSecure: bool('COOKIE_SECURE', false),
  },

  // --- Sorgenti di monitoring: usate dalla Fase 3, opzionali qui. ---
  nas: {
    host: str('NAS_SSH_HOST', '192.168.0.36'),
    user: str('NAS_SSH_USER', 'nicholasizzo'),
    keyPath: opt('NAS_SSH_KEY'),
    hostFingerprint: opt('NAS_SSH_HOST_FINGERPRINT'),
    resticStatePath: str('RESTIC_STATE_PATH', '/var/lib/nas-backup/state.json'),
  },
  scrutinyUrl: str('SCRUTINY_URL', 'http://192.168.0.36:8087'),
  uptimeKuma: {
    url: str('UPTIME_KUMA_URL', 'http://192.168.0.36:3002'),
    apiKey: opt('UPTIME_KUMA_API_KEY'),
  },
  tls: {
    host: str('VAULTWARDEN_TLS_HOST', '100.98.207.48'),
    port: int('VAULTWARDEN_TLS_PORT', 44075),
    servername: str('VAULTWARDEN_TLS_SERVERNAME', 'dh4300plus-fix.taile39e4f.ts.net'),
  },
} as const;

export type Config = typeof config;
