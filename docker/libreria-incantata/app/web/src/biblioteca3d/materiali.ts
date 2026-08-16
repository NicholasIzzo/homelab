import * as THREE from "three";

/**
 * Texture procedurali per la biblioteca.
 *
 * Tutto è generato su canvas una volta sola e condiviso fra i mobili: un solo
 * set di mappe legno per l'intera scena (albedo + rugosità + normali), così la
 * resa è PBR credibile senza scaricare immagini né moltiplicare i materiali.
 */

let ANISO = 1;
export function impostaAnisotropia(v: number) {
  ANISO = Math.max(1, v);
}

/**
 * Definizione delle texture procedurali. Su desktop si alza (venature e
 * intonaco piu leggibili da vicino); sui telefoni resta bassa, dove conta il
 * framerate e lo schermo e piccolo.
 */
let DEFINIZIONE = 1;
export function impostaDefinizione(fattore: number) {
  DEFINIZIONE = Math.max(0.5, Math.min(2, fattore));
}
const dim = (n: number) => Math.round(n * DEFINIZIONE);

function nuovaCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d", { willReadFrequently: true })!];
}

function daCanvas(c: HTMLCanvasElement, srgb: boolean, ripeti?: [number, number]): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = ANISO;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  if (ripeti) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(ripeti[0], ripeti[1]);
  }
  return t;
}

/** Rumore valore-interpolato, deterministico: base di venature e macchie. */
function rumore(seed: number) {
  const casuale = (x: number, y: number) => {
    const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
    return n - Math.floor(n);
  };
  return (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const a = casuale(xi, yi), b = casuale(xi + 1, yi);
    const c = casuale(xi, yi + 1), d = casuale(xi + 1, yi + 1);
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
  };
}

/** Campo di altezza del legno: anelli allungati + fibra fine. */
function altezzaLegno(w: number, h: number, seed: number): Float32Array {
  const n1 = rumore(seed);
  const n2 = rumore(seed + 11);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w, v = y / h;
      // anelli: coordinata deformata da rumore a bassa frequenza
      const onda = v * 9 + n1(u * 3.2, v * 1.4) * 2.4;
      const anelli = Math.abs(Math.sin(onda * Math.PI));
      // fibra: rumore molto allungato lungo la venatura
      const fibra = n2(u * 220, v * 5) * 0.45 + n2(u * 60, v * 2) * 0.25;
      out[y * w + x] = anelli * 0.62 + fibra * 0.38;
    }
  }
  return out;
}

function normaliDaAltezza(alt: Float32Array, w: number, h: number, forza: number): HTMLCanvasElement {
  const [c, ctx] = nuovaCanvas(w, h);
  const img = ctx.createImageData(w, h);
  const at = (x: number, y: number) => alt[((y + h) % h) * w + ((x + w) % w)]!;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * forza;
      const dy = (at(x, y + 1) - at(x, y - 1)) * forza;
      // normale = normalize(-dx, -dy, 1) rimappata in 0..255
      const len = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      img.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = (1 / len) * 0.5 * 255 + 127.5;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export interface MappeLegno {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
}

/** Set completo di mappe per un legno (noce scuro di default). */
export function mappeLegno(
  seed = 3,
  base: [number, number, number] = [86, 52, 33],
  ripeti: [number, number] = [1, 1],
): MappeLegno {
  const W = dim(512), H = dim(512);
  const alt = altezzaLegno(W, H, seed);

  const [cA, ctxA] = nuovaCanvas(W, H);
  const [cR, ctxR] = nuovaCanvas(W, H);
  const imgA = ctxA.createImageData(W, H);
  const imgR = ctxR.createImageData(W, H);
  for (let i = 0; i < W * H; i++) {
    const a = alt[i]!;
    const scuro = 0.55 + a * 0.55; // le venature scuriscono
    const j = i * 4;
    imgA.data[j] = Math.min(255, base[0] * scuro);
    imgA.data[j + 1] = Math.min(255, base[1] * scuro);
    imgA.data[j + 2] = Math.min(255, base[2] * scuro);
    imgA.data[j + 3] = 255;
    // il legno è più lucido dove è compatto, più opaco sulla fibra
    const rough = 205 - a * 70;
    imgR.data[j] = imgR.data[j + 1] = imgR.data[j + 2] = rough;
    imgR.data[j + 3] = 255;
  }
  ctxA.putImageData(imgA, 0, 0);
  ctxR.putImageData(imgR, 0, 0);

  return {
    map: daCanvas(cA, true, ripeti),
    roughnessMap: daCanvas(cR, false, ripeti),
    normalMap: daCanvas(normaliDaAltezza(alt, W, H, 2.2), false, ripeti),
  };
}

/** Parquet a doghe per il pavimento. */
export function mappePavimento(): MappeLegno {
  const W = dim(512), H = dim(512);
  const alt = altezzaLegno(W, H, 17);
  const [cA, ctxA] = nuovaCanvas(W, H);
  const [cR, ctxR] = nuovaCanvas(W, H);
  const imgA = ctxA.createImageData(W, H);
  const imgR = ctxR.createImageData(W, H);
  const doga = dim(64);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x, j = i * 4;
      const riga = Math.floor(y / doga);
      const sfasa = (riga % 2) * (doga * 1.5);
      const bordoY = y % doga < 2;
      const bordoX = Math.floor((x + sfasa) % (doga * 3)) < 2;
      const a = alt[i]!;
      const tono = (0.5 + a * 0.5) * (bordoY || bordoX ? 0.45 : 1) * (0.9 + ((riga * 7) % 5) * 0.04);
      imgA.data[j] = Math.min(255, 74 * tono);
      imgA.data[j + 1] = Math.min(255, 48 * tono);
      imgA.data[j + 2] = Math.min(255, 32 * tono);
      imgA.data[j + 3] = 255;
      const rough = 190 - a * 45 + (bordoY || bordoX ? 40 : 0);
      imgR.data[j] = imgR.data[j + 1] = imgR.data[j + 2] = Math.min(255, rough);
      imgR.data[j + 3] = 255;
    }
  }
  ctxA.putImageData(imgA, 0, 0);
  ctxR.putImageData(imgR, 0, 0);
  return {
    map: daCanvas(cA, true, [4, 10]),
    roughnessMap: daCanvas(cR, false, [4, 10]),
    normalMap: daCanvas(normaliDaAltezza(alt, W, H, 1.1), false, [4, 10]),
  };
}

/** Intonaco/pietra per le pareti. */
export function mappaParete(): MappeLegno {
  const W = dim(256), H = dim(256);
  const n = rumore(41);
  const alt = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const sx = x / DEFINIZIONE, sy = y / DEFINIZIONE;
      alt[y * W + x] = n(sx / 12, sy / 12) * 0.6 + n(sx / 3, sy / 3) * 0.4;
    }
  }
  const [cA, ctxA] = nuovaCanvas(W, H);
  const img = ctxA.createImageData(W, H);
  for (let i = 0; i < W * H; i++) {
    const a = alt[i]!;
    const j = i * 4;
    img.data[j] = 38 + a * 16;
    img.data[j + 1] = 32 + a * 14;
    img.data[j + 2] = 52 + a * 18;
    img.data[j + 3] = 255;
  }
  ctxA.putImageData(img, 0, 0);
  const [cR, ctxR] = nuovaCanvas(W, H);
  ctxR.fillStyle = "#d8d8d8";
  ctxR.fillRect(0, 0, W, H);
  return {
    map: daCanvas(cA, true, [3, 2]),
    roughnessMap: daCanvas(cR, false, [3, 2]),
    normalMap: daCanvas(normaliDaAltezza(alt, W, H, 0.9), false, [3, 2]),
  };
}

/** Alone morbido: candele, bagliori, ombre di contatto. */
export function texturaAlone(colore = "#ffffff", durezza = 0.25): THREE.Texture {
  const [c, ctx] = nuovaCanvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, colore);
  g.addColorStop(durezza, colore);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return daCanvas(c, true);
}

/** Ombra di contatto ellittica da appoggiare sotto i libri. */
export function texturaOmbraContatto(): THREE.Texture {
  const [c, ctx] = nuovaCanvas(128, 64);
  const g = ctx.createRadialGradient(64, 32, 0, 64, 32, 60);
  g.addColorStop(0, "rgba(0,0,0,0.55)");
  g.addColorStop(0.55, "rgba(0,0,0,0.22)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 64);
  return daCanvas(c, true);
}

/** Insegna incisa di una sezione: sigillo, nome e motto. */
export function texturaInsegna(nome: string, icona: string, luce: string, motto: string): THREE.Texture {
  const W = dim(640), H = dim(200);
  const [c, ctx] = nuovaCanvas(W, H);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#241606");
  g.addColorStop(1, "#120c08");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = luce;
  ctx.globalAlpha = 0.75;
  ctx.lineWidth = 3;
  ctx.strokeRect(12, 12, W - 24, H - 24);
  ctx.globalAlpha = 1;

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = luce;
  ctx.shadowBlur = 18;
  ctx.fillStyle = luce;
  ctx.font = "44px serif";
  ctx.fillText(icona, 74, H / 2 - 4);

  ctx.font = "bold 46px Georgia, serif";
  ctx.fillStyle = "#f7ecd2";
  ctx.shadowBlur = 10;
  ctx.fillText(nome, W / 2 + 40, 78, W - 180);

  ctx.font = "italic 26px Georgia, serif";
  ctx.fillStyle = luce;
  ctx.shadowBlur = 6;
  ctx.fillText(motto, W / 2 + 40, 130, W - 180);

  return daCanvas(c, true);
}

/** Cerchio di rune da proiettare sul pavimento. */
export function texturaRune(colore = "#c9a24b"): THREE.Texture {
  const S = 256;
  const [c, ctx] = nuovaCanvas(S, S);
  ctx.translate(S / 2, S / 2);
  ctx.strokeStyle = colore;
  ctx.fillStyle = colore;
  ctx.lineWidth = 2.5;
  for (const r of [116, 104, 74]) {
    ctx.globalAlpha = r === 104 ? 0.5 : 0.85;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  // segni runici disposti in cerchio
  ctx.globalAlpha = 0.9;
  const segni = 12;
  for (let i = 0; i < segni; i++) {
    ctx.save();
    ctx.rotate((i / segni) * Math.PI * 2);
    ctx.translate(0, -90);
    ctx.beginPath();
    ctx.moveTo(-7, -9);
    ctx.lineTo(0, 9);
    ctx.lineTo(7, -9);
    if (i % 3 === 0) ctx.moveTo(-6, 0), ctx.lineTo(6, 0);
    if (i % 4 === 1) ctx.moveTo(0, -12), ctx.lineTo(0, 12);
    ctx.stroke();
    ctx.restore();
  }
  // stella a sei punte interna
  ctx.globalAlpha = 0.55;
  for (const off of [0, Math.PI / 3]) {
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = off + (i / 3) * Math.PI * 2;
      const x = Math.cos(a) * 62, y = Math.sin(a) * 62;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }
  return daCanvas(c, true);
}

const COPERTINE_SEGNAPOSTO: THREE.Texture[] = [];

/**
 * Copertine di attesa: pelle scura con cornice dorata. Sono poche e condivise,
 * così nessun libro appare bianco mentre l'immagine vera sta caricando.
 */
export function copertinaSegnaposto(indice: number): THREE.Texture {
  if (COPERTINE_SEGNAPOSTO.length === 0) {
    const tinte: [string, string][] = [
      ["#3a1f2a", "#1a0e14"],
      ["#22304a", "#101725"],
      ["#3d2a18", "#1b120a"],
      ["#2c3a2a", "#131a13"],
      ["#3a2440", "#180f1c"],
      ["#402020", "#1c0e0e"],
    ];
    for (const [alto, basso] of tinte) {
      const [c, ctx] = nuovaCanvas(256, 384);
      const g = ctx.createLinearGradient(0, 0, 0, 384);
      g.addColorStop(0, alto);
      g.addColorStop(1, basso);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 256, 384);
      ctx.strokeStyle = "rgba(201,162,75,0.55)";
      ctx.lineWidth = 4;
      ctx.strokeRect(14, 14, 228, 356);
      ctx.fillStyle = "rgba(201,162,75,0.75)";
      ctx.textAlign = "center";
      ctx.font = "40px serif";
      ctx.fillText("✦", 128, 210);
      COPERTINE_SEGNAPOSTO.push(daCanvas(c, true));
    }
  }
  return COPERTINE_SEGNAPOSTO[indice % COPERTINE_SEGNAPOSTO.length]!;
}

/** Dorso coerente con la copertina: tinta unita scurita + filetti dorati. */
export function texturaDorso(colore: THREE.Color): THREE.Texture {
  const [c, ctx] = nuovaCanvas(32, 128);
  const scuro = colore.clone().multiplyScalar(0.62);
  ctx.fillStyle = `#${scuro.getHexString()}`;
  ctx.fillRect(0, 0, 32, 128);
  ctx.fillStyle = "rgba(214,178,96,0.5)";
  ctx.fillRect(0, 14, 32, 2);
  ctx.fillRect(0, 112, 32, 2);
  return daCanvas(c, true);
}

/** Media dei pixel: serve a tinteggiare dorso e taglio come la copertina. */
export function coloreMedio(img: TexImageSource, larghezza = 16, altezza = 24): THREE.Color {
  try {
    const [c, ctx] = nuovaCanvas(larghezza, altezza);
    ctx.drawImage(img as CanvasImageSource, 0, 0, larghezza, altezza);
    const d = ctx.getImageData(0, 0, larghezza, altezza).data;
    let r = 0, g = 0, b = 0;
    const n = larghezza * altezza;
    for (let i = 0; i < n; i++) {
      r += d[i * 4]!;
      g += d[i * 4 + 1]!;
      b += d[i * 4 + 2]!;
    }
    return new THREE.Color(r / n / 255, g / n / 255, b / n / 255).convertSRGBToLinear();
  } catch {
    return new THREE.Color(0x3a2a3a);
  }
}
