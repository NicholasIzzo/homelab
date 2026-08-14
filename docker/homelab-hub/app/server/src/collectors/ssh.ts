import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { Client } from 'ssh2';

import { config } from '../config.js';

let cachedKey: Buffer | undefined;

function privateKey(): Buffer {
  if (cachedKey) return cachedKey;
  if (!config.nas.keyPath) {
    throw new Error('NAS_SSH_KEY non configurata: impossibile aprire la connessione SSH');
  }
  cachedKey = readFileSync(config.nas.keyPath);
  return cachedKey;
}

/** Impronta SHA256 in base64 senza padding, lo stesso formato di `ssh-keygen -lf`. */
function fingerprint(hostKey: Buffer): string {
  return `SHA256:${createHash('sha256').update(hostKey).digest('base64').replace(/=+$/, '')}`;
}

export class SshError extends Error {}

/**
 * Esegue un comando sul NAS e restituisce stdout.
 *
 * La host key e' verificata contro NAS_SSH_HOST_FINGERPRINT: senza impronta
 * configurata la connessione viene rifiutata, non accettata alla cieca.
 * L'algoritmo host key e' forzato a ed25519 perche' il NAS ne offre tre e
 * l'impronta pinnata vale per uno solo.
 */
export function sshExec(command: string, timeoutMs = 20_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const expected = config.nas.hostFingerprint;
    if (!expected) {
      reject(new SshError('NAS_SSH_HOST_FINGERPRINT non configurata: connessione rifiutata'));
      return;
    }

    const conn = new Client();
    let settled = false;

    const finish = (err: Error | null, out?: string) => {
      if (settled) return;
      settled = true;
      conn.end();
      if (err) reject(err);
      else resolve(out ?? '');
    };

    const timer = setTimeout(() => {
      finish(new SshError(`timeout SSH dopo ${timeoutMs}ms: ${command.slice(0, 60)}`));
    }, timeoutMs);

    conn
      .on('ready', () => {
        conn.exec(command, (err, stream) => {
          if (err) {
            clearTimeout(timer);
            finish(new SshError(`exec fallita: ${err.message}`));
            return;
          }
          let stdout = '';
          let stderr = '';
          stream
            .on('close', (code: number) => {
              clearTimeout(timer);
              if (code === 0) finish(null, stdout);
              else finish(new SshError(`comando uscito con codice ${code}: ${stderr.trim()}`));
            })
            .on('data', (d: Buffer) => {
              stdout += d.toString('utf8');
            })
            .stderr.on('data', (d: Buffer) => {
              stderr += d.toString('utf8');
            });
        });
      })
      .on('error', (err) => {
        clearTimeout(timer);
        finish(new SshError(err.message));
      })
      .connect({
        host: config.nas.host,
        username: config.nas.user,
        privateKey: privateKey(),
        readyTimeout: timeoutMs,
        algorithms: { serverHostKey: ['ssh-ed25519'] },
        hostVerifier: (hostKey: Buffer) => {
          const actual = fingerprint(hostKey);
          const ok = actual === expected.trim();
          if (!ok) {
            // Il messaggio arriva all'handler 'error' come fallimento di handshake.
            conn.emit(
              'error',
              new SshError(`host key non corrispondente: attesa ${expected}, ricevuta ${actual}`),
            );
          }
          return ok;
        },
      });
  });
}
