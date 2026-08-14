/**
 * Genera l'hash argon2id da incollare in ADMIN_PASSWORD_HASH.
 *
 *   docker compose run --rm --entrypoint node homelab-hub \
 *     server/dist/tools/hash-password.js
 *
 * La password viene chiesta a schermo con l'eco disattivato: non passa dagli
 * argomenti e non finisce nella cronologia della shell.
 */
import { createInterface } from 'node:readline';

import { hashPassword } from '../auth/password.js';

function chiediPassword(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    const output = process.stdout;

    if (!input.isTTY) {
      // Modalita' non interattiva: leggiamo la password da stdin.
      let dati = '';
      input.setEncoding('utf8');
      input.on('data', (c) => (dati += c));
      input.on('end', () => resolve(dati.trim()));
      input.on('error', reject);
      return;
    }

    const rl = createInterface({ input, output, terminal: true });
    output.write(prompt);

    // Sopprimiamo l'eco dei caratteri digitati.
    const scrittura = (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput;
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = function (s) {
      if (s.includes(prompt)) scrittura.call(this, s);
    };

    rl.question('', (risposta) => {
      rl.close();
      output.write('\n');
      resolve(risposta);
    });
  });
}

const password = await chiediPassword('Password: ');

if (password.length < 12) {
  console.error('\nLa password deve avere almeno 12 caratteri. Nessun hash generato.');
  process.exit(1);
}

const hash = await hashPassword(password);

console.log('\nIncolla questa riga in .env:\n');
console.log(`ADMIN_PASSWORD_HASH=${hash}`);
console.log('\nPoi riavvia il container: docker compose up -d\n');
