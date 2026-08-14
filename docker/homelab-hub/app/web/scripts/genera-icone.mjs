// Rasterizza icona.svg nei PNG richiesti dal manifest e da iOS.
// Gira in fase di build (devDependency): sharp non entra nell'immagine runtime.
// I PNG non sono versionati, si rigenerano dalla sorgente SVG a ogni build.
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sorgente = readFileSync(join(root, 'icona.svg'));
const dest = join(root, 'public', 'icons');

mkdirSync(dest, { recursive: true });

const FORMATI = [
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  // Stessa grafica: il disegno e' gia' dentro la zona sicura dell'80%.
  { file: 'icon-maskable-512.png', size: 512 },
  // iOS ignora il manifest per l'icona della schermata Home e usa questa.
  { file: 'apple-touch-icon.png', size: 180 },
];

for (const { file, size } of FORMATI) {
  await sharp(sorgente, { density: 384 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(join(dest, file));
  console.log(`icona generata: ${file} (${size}px)`);
}
