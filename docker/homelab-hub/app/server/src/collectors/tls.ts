import { connect, type PeerCertificate } from 'node:tls';

import { config } from '../config.js';
import type { Collector, CollectResult, Status } from './types.js';

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

// Un Let's Encrypt dura 90 giorni e NPM rinnova a ~30: la soglia 90 usata per
// l'hardware qui sarebbe permanentemente rossa.
const WARN_DAYS = 45;
const CRIT_DAYS = 21;

function valuta(days: number): Status {
  if (days <= CRIT_DAYS) return 'crit';
  if (days <= WARN_DAYS) return 'warn';
  return 'ok';
}

function certificato(timeoutMs: number): Promise<PeerCertificate> {
  return new Promise((resolve, reject) => {
    const socket = connect({
      host: config.tls.host,
      port: config.tls.port,
      servername: config.tls.servername,
      // Vogliamo leggere la scadenza anche di un certificato gia' scaduto:
      // con la validazione attiva l'handshake fallirebbe proprio nel caso
      // che ci interessa di piu'.
      rejectUnauthorized: false,
      timeout: timeoutMs,
    });

    const fail = (err: Error) => {
      socket.destroy();
      reject(err);
    };

    socket.once('secureConnect', () => {
      const cert = socket.getPeerCertificate();
      socket.end();
      if (!cert || Object.keys(cert).length === 0) {
        reject(new Error('nessun certificato presentato dal peer'));
        return;
      }
      resolve(cert);
    });
    socket.once('timeout', () => fail(new Error(`timeout TLS dopo ${timeoutMs}ms`)));
    socket.once('error', fail);
  });
}

function nome(campo: Record<string, string> | undefined): string | null {
  if (!campo) return null;
  return campo['CN'] ?? campo['O'] ?? null;
}

async function run(): Promise<CollectResult<TlsPayload>> {
  const cert = await certificato(10_000);

  const validTo = new Date(cert.valid_to);
  if (Number.isNaN(validTo.getTime())) {
    throw new Error(`valid_to non parsabile: ${cert.valid_to}`);
  }
  const days = Math.floor((validTo.getTime() - Date.now()) / 86_400_000);

  return {
    status: valuta(days),
    metric: days,
    payload: {
      host: config.tls.host,
      port: config.tls.port,
      servername: config.tls.servername,
      subject: nome(cert.subject as unknown as Record<string, string>),
      issuer: nome(cert.issuer as unknown as Record<string, string>),
      valid_from: new Date(cert.valid_from).toISOString(),
      valid_to: validTo.toISOString(),
      days_remaining: days,
    },
  };
}

export const tlsCollector: Collector<TlsPayload> = {
  source: 'tls',
  label: 'Certificato TLS',
  intervalMs: 12 * 60 * 60_000,
  run,
};
