/**
 * Genera l'hash argon2id da mettere in .env.
 *
 *   docker compose run --rm --entrypoint node homelab-hub \
 *     server/dist/tools/hash-password.js
 *
 * Stampa il valore in BASE64: l'hash argon2id contiene '$' e Docker Compose
 * interpola le variabili dentro .env, quindi in chiaro arriverebbe mutilato.
 *
 * La password viene chiesta a schermo con l'eco disattivato: non passa dagli
 * argomenti e non finisce nella cronologia della shell.
 */
import { createInterface } from 'node:readline';

import { hashPassword } from '../auth/password.js';

const PROMPT = 'Password: ';

function chiediPassword(): Promise<string> {
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    const output = process.stdout;

    // Senza TTY (pipe, CI) leggiamo stdin fino a EOF.
    if (!input.isTTY) {
      let dati = '';
      input.setEncoding('utf8');
      input.on('data', (c) => (dati += c));
      input.on('end', () => resolve(dati.trim()));
      input.on('error', reject);
      return;
    }

    const rl = createInterface({ input, output, terminal: true });

    // Il prompt lo deve stampare readline: scritto a mano prima di question()
    // verrebbe cancellato dal primo ridisegno della riga (ESC[1G ESC[0J), e a
    // schermo resterebbe il nulla mentre il processo aspetta l'input.
    //
    // _writeToOutput intercetta ogni scrittura di readline: lasciamo passare
    // il prompt una sola volta e sopprimiamo tutto il resto, cioe' l'eco dei
    // caratteri digitati e i ridisegni che cancellerebbero la riga.
    let promptMostrato = false;
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => {
      if (!promptMostrato && s.includes(PROMPT)) {
        output.write(PROMPT);
        promptMostrato = true;
      }
    };

    let risposto = false;
    rl.question(PROMPT, (risposta) => {
      risposto = true;
      rl.close();
      output.write('\n');
      resolve(risposta);
    });

    // Ctrl-C o Ctrl-D chiudono readline senza rispondere: senza questo la
    // promise resterebbe pendente e Node uscirebbe lamentando una await
    // di primo livello mai risolta.
    rl.on('close', () => {
      if (!risposto) {
        output.write('\n');
        resolve('');
      }
    });
  });
}

async function main(): Promise<number> {
  const password = await chiediPassword();

  if (password === '') {
    console.error('Nessuna password inserita. Niente da fare.');
    return 1;
  }
  if (password.length < 12) {
    console.error('\nLa password deve avere almeno 12 caratteri. Nessun hash generato.');
    return 1;
  }

  const hash = await hashPassword(password);
  const b64 = Buffer.from(hash, 'utf8').toString('base64');

  console.log('\nIncolla questa riga in .env (sostituendo quella esistente):\n');
  console.log(`ADMIN_PASSWORD_HASH_B64=${b64}`);
  console.log('\nPoi riavvia:  docker compose up -d\n');
  console.log("E' in base64 di proposito: l'hash contiene '$' e Docker Compose");
  console.log('li interpreterebbe come variabili, svuotandoli.\n');
  return 0;
}

// Niente await di primo livello: il processo esce sempre con un codice esplicito.
main()
  .then((codice) => process.exit(codice))
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
