// Copia gli asset non-TypeScript (le migrazioni SQL) nella dist:
// tsc compila solo .ts e lascerebbe indietro lo schema.
import { cpSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const from = join(root, 'src', 'db', 'migrations');
const to = join(root, 'dist', 'db', 'migrations');

if (!existsSync(from)) {
  console.error(`copy-assets: sorgente mancante ${from}`);
  process.exit(1);
}

cpSync(from, to, { recursive: true });
console.log(`copy-assets: migrazioni copiate in ${to}`);
