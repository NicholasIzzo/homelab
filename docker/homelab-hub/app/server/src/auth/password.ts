import { Algorithm, hash, verify } from '@node-rs/argon2';

/**
 * Parametri argon2id. Con un utente solo e un login raro possiamo permetterci
 * un costo alto: ~64 MB e 3 passate rendono il brute force sull'hash
 * sgradevole anche a chi si portasse via il file .env.
 */
const OPZIONI = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPZIONI);
}

export async function verificaPassword(hashSalvato: string, password: string): Promise<boolean> {
  try {
    return await verify(hashSalvato, password, OPZIONI);
  } catch {
    // Hash malformato in .env: trattiamolo come password errata, non come crash.
    return false;
  }
}
