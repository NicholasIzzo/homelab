import { readFileSync } from 'node:fs';
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

const FORMATO_ARGON2 = /^\$argon2(id|i|d)\$v=\d+\$m=\d+,t=\d+,p=\d+\$[^$]+\$[^$]+$/;

/**
 * L'hash argon2id e' pieno di '$', e Docker Compose interpola le variabili
 * dentro il file .env: messo li' in chiaro arriva mutilato ("$argon2id" e
 * "$v" diventano stringhe vuote) e ogni login fallisce senza dire perche'.
 *
 * Per questo la forma preferita e' base64, che di '$' non ne ha. Restano
 * accettati un file montato e il valore grezzo, utile con `docker run
 * --env-file`, che invece non interpola.
 */
function risolviHashPassword(): { hash?: string; problema?: string } {
  const percorso = opt('ADMIN_PASSWORD_HASH_FILE');
  if (percorso) {
    try {
      return validaHash(readFileSync(percorso, 'utf8').trim(), `il file ${percorso}`);
    } catch {
      return { problema: `ADMIN_PASSWORD_HASH_FILE punta a un file illeggibile: ${percorso}` };
    }
  }

  const b64 = opt('ADMIN_PASSWORD_HASH_B64');
  if (b64) {
    const decodificato = Buffer.from(b64, 'base64').toString('utf8').trim();
    return validaHash(decodificato, 'ADMIN_PASSWORD_HASH_B64');
  }

  const grezzo = opt('ADMIN_PASSWORD_HASH');
  if (grezzo) return validaHash(grezzo.trim(), 'ADMIN_PASSWORD_HASH');

  return {};
}

function validaHash(valore: string, fonte: string): { hash?: string; problema?: string } {
  if (FORMATO_ARGON2.test(valore)) return { hash: valore };

  const mutilato = !valore.startsWith('$argon2');
  return {
    problema:
      `L'hash letto da ${fonte} non e' un argon2id valido.` +
      (mutilato
        ? " Sembra che i '$' siano stati mangiati: e' l'interpolazione di Docker Compose sul file .env." +
          ' Usa ADMIN_PASSWORD_HASH_B64 con il valore in base64.'
        : ' Rigeneralo con il tool hash-password.'),
  };
}

const hashPassword = risolviHashPassword();

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
    passwordHash: hashPassword.hash,
    // Valorizzato quando un hash c'e' ma e' inutilizzabile: senza questo il
    // sintomo sarebbe solo "password errata", che manda a caccia del problema
    // sbagliato.
    problemaHash: hashPassword.problema,
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
