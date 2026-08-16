import * as THREE from "three";

/**
 * Tagli decorati (gli "sprayed edges" delle edizioni speciali).
 *
 * Nessuna fonte pubblica associa a un ISBN il disegno reale del taglio: né
 * Goodreads né Amazon lo espongono. Qui se ne disegnano due varianti,
 * intonate al colore del genere del libro, fra cui scegliere:
 *
 *  0 — "Tinta e oro": campitura piena con filetti dorati, come le edizioni
 *      classiche rilegate.
 *  1 — "Giardino inciso": spruzzata sfumata con rami e petali, lo stile delle
 *      edizioni speciali romantasy.
 */

export const NOMI_BORDI = ["Tinta e oro", "Giardino inciso"] as const;
export type VarianteBordo = 0 | 1;

function rnd(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Disegna il taglio su un canvas. Larghezza piccola: è una striscia sottile,
 * vista di taglio, e non serve altra definizione.
 */
export function disegnaBordo(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  colore: string,
  variante: VarianteBordo,
  seme = 1,
) {
  const c = new THREE.Color(colore);
  const chiaro = c.clone().lerp(new THREE.Color(0xffffff), 0.55);
  const scuro = c.clone().multiplyScalar(0.42);
  const casuale = rnd(seme);

  if (variante === 0) {
    // campitura piena con filetti dorati in alto e in basso
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, `#${chiaro.getHexString()}`);
    g.addColorStop(0.5, `#${c.getHexString()}`);
    g.addColorStop(1, `#${scuro.getHexString()}`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = "rgba(214,178,96,0.85)";
    ctx.fillRect(0, Math.round(h * 0.06), w, Math.max(1, h * 0.02));
    ctx.fillRect(0, Math.round(h * 0.92), w, Math.max(1, h * 0.02));
    // finta rigatura dei fogli
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = "#000";
    for (let x = 0; x < w; x += 3) ctx.fillRect(x, 0, 1, h);
    ctx.globalAlpha = 1;
    return;
  }

  // spruzzata sfumata + rami e petali
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#f6efe0");
  g.addColorStop(0.35, `#${chiaro.getHexString()}`);
  g.addColorStop(1, `#${c.getHexString()}`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // rametti
  ctx.strokeStyle = `#${scuro.getHexString()}`;
  ctx.globalAlpha = 0.75;
  ctx.lineWidth = Math.max(1, w * 0.03);
  for (let i = 0; i < 5; i++) {
    const y0 = h * (0.12 + i * 0.18);
    ctx.beginPath();
    ctx.moveTo(w * 0.5 + (casuale() - 0.5) * w * 0.5, y0);
    ctx.quadraticCurveTo(w * 0.2, y0 + h * 0.05, w * 0.85, y0 + h * 0.1);
    ctx.stroke();
  }
  // petali
  ctx.globalAlpha = 0.9;
  for (let i = 0; i < 26; i++) {
    ctx.fillStyle = casuale() > 0.5 ? `#${chiaro.getHexString()}` : "rgba(255,255,255,0.85)";
    const px = casuale() * w;
    const py = casuale() * h;
    const r = Math.max(1, w * (0.06 + casuale() * 0.1));
    ctx.beginPath();
    ctx.ellipse(px, py, r, r * 0.65, casuale() * 3, 0, 7);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** Texture del taglio, per il libro in 3D. */
export function texturaBordo(
  colore: string,
  variante: VarianteBordo,
  seme = 1,
): THREE.CanvasTexture {
  const w = 32, h = 256;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  disegnaBordo(c.getContext("2d")!, w, h, colore, variante, seme);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Anteprima per il pannello di personalizzazione (immagine 2D). */
export function anteprimaBordo(
  colore: string,
  variante: VarianteBordo,
  seme = 1,
  w = 54,
  h = 76,
): string {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  disegnaBordo(c.getContext("2d")!, w, h, colore, variante, seme);
  return c.toDataURL("image/png");
}
