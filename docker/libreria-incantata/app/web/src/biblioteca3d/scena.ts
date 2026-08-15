import * as THREE from "three";
import { coverUrl } from "../api";
import { temaDi } from "../temi";
import type { Libro, Scaffale } from "../tipi";

export interface CallbacksScena {
  onPickLibro: (libro: Libro) => void;
  onArrivo: (scaffaleId: string | null) => void;
  onRuota: () => void;
  onDesideri: () => void;
}

// Su telefoni e GPU deboli abbassiamo la resa: meno pixel, niente antialias.
export const BASSA_POTENZA = (() => {
  if (typeof navigator === "undefined") return false;
  const mem = (navigator as { deviceMemory?: number }).deviceMemory ?? 4;
  const tocco = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;
  return mem <= 4 || tocco;
})();

const OCCHI = 1.62; // altezza degli occhi
const PASSO_Z = 3.7; // distanza fra due scaffali della stessa fila
const Z0 = 0.4; // z del primo scaffale
const LATO_X = 2.75; // distanza degli scaffali dal centro corsia
let ANISO = 1;

function texturaCanvas(
  disegna: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  w = 256,
  h = 256,
): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  disegna(c.getContext("2d")!, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = ANISO;
  return t;
}

/** Venatura del legno scuro, tono libreria antica. */
function texturaLegno(tinta = "#2a1a10"): THREE.CanvasTexture {
  return texturaCanvas((ctx, w, h) => {
    ctx.fillStyle = tinta;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) {
      ctx.strokeStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.12})`;
      ctx.lineWidth = 0.5 + Math.random() * 1.5;
      ctx.beginPath();
      const y = Math.random() * h;
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(w * 0.3, y + (Math.random() - 0.5) * 14, w * 0.6, y + (Math.random() - 0.5) * 14, w, y + (Math.random() - 0.5) * 8);
      ctx.stroke();
    }
  }, 256, 256);
}

/** Parquet a spina di pesce, luce calda di candela. */
function texturaPavimento(): THREE.CanvasTexture {
  const t = texturaCanvas((ctx, w, h) => {
    ctx.fillStyle = "#160f0a";
    ctx.fillRect(0, 0, w, h);
    const s = 32;
    for (let y = 0; y < h; y += s) {
      for (let x = 0; x < w; x += s) {
        const g = 20 + ((x + y) / s) % 3 * 10 + Math.random() * 12;
        ctx.fillStyle = `rgb(${g + 24},${g + 14},${g + 6})`;
        ctx.save();
        ctx.translate(x, y);
        ctx.fillRect(2, 2, s - 4, s / 2 - 3);
        ctx.fillStyle = `rgb(${g + 14},${g + 8},${g + 2})`;
        ctx.fillRect(2, s / 2 + 1, s - 4, s / 2 - 3);
        ctx.restore();
      }
    }
  }, 256, 256);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(10, 22);
  return t;
}

/** Insegna incantata di uno scaffale: nome + sigillo, in rune luminose. */
function texturaInsegna(nome: string, icona: string, luce: string, motto: string): THREE.CanvasTexture {
  return texturaCanvas((ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "#160c22");
    grad.addColorStop(1, "#0c0715");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = luce;
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 6;
    ctx.strokeRect(10, 10, w - 20, h - 20);
    ctx.globalAlpha = 1;
    ctx.shadowColor = luce;
    ctx.shadowBlur = 26;
    ctx.fillStyle = luce;
    ctx.font = "70px serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(icona, w / 2, 78);
    ctx.font = "bold 46px Georgia, serif";
    ctx.fillStyle = "#f6ecd4";
    ctx.shadowBlur = 14;
    ctx.fillText(nome, w / 2, 150);
    ctx.font = "italic 26px Georgia, serif";
    ctx.fillStyle = luce;
    ctx.shadowBlur = 8;
    ctx.fillText(motto, w / 2, 200);
  }, 512, 240);
}

/** Piccolo alone luminoso per candele/scintille (sprite additivo). */
function texturaAlone(colore: string): THREE.CanvasTexture {
  return texturaCanvas((ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, colore);
    g.addColorStop(0.3, colore);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }, 64, 64);
}

/** Yaw per far guardare la camera verso un punto (ordine YXZ, solo Y). */
function yawVerso(cx: number, cz: number, px: number, pz: number): number {
  return Math.atan2(-(px - cx), -(pz - cz));
}

function normalizzaAngolo(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

interface Waypoint {
  id: string;
  x: number;
  z: number;
  yaw: number;
}

export class ScenaBiblioteca {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private orologio = new THREE.Clock();
  private raf = 0;
  private raycaster = new THREE.Raycaster();

  private pos = new THREE.Vector3(0, 0, Z0 + 4.2);
  private posBersaglio = new THREE.Vector3(0, 0, Z0 + 4.2);
  private yaw = 0;
  private yawBersaglio = 0;
  private pitch = 0;
  private ruotaVerso = false;
  private passo = 0;
  private strafe = 0;
  private tasti = new Set<string>();

  private minZ: number;
  private maxZ = Z0 + 4.6;

  private interattivi: THREE.Object3D[] = [];
  private pavimento!: THREE.Mesh;
  private waypoints: Waypoint[] = [];
  private scaffaleAttuale: string | null = null;

  private candele: { luce: THREE.PointLight; base: number; fase: number }[] = [];
  private orb!: THREE.Mesh;
  private orbLuce!: THREE.PointLight;
  private portale!: THREE.Object3D;
  private particelle!: THREE.Points;
  private loader = new THREE.TextureLoader();
  private daSmaltire: (THREE.Texture | THREE.Material | THREE.BufferGeometry)[] = [];

  // trascinamento vs click
  private giu = false;
  private trascinato = false;
  private ultimoX = 0;
  private ultimoY = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    scaffali: Scaffale[],
    desideriN: number,
    private cb: CallbacksScena,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !BASSA_POTENZA });
    this.renderer.setPixelRatio(BASSA_POTENZA ? 0.7 : Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    ANISO = BASSA_POTENZA ? 1 : this.renderer.capabilities.getMaxAnisotropy();

    this.camera = new THREE.PerspectiveCamera(66, 1, 0.1, 90);
    this.camera.rotation.order = "YXZ";

    this.scene.background = new THREE.Color(0x0a0713);
    this.scene.fog = new THREE.Fog(0x0a0713, 8, 34);

    const perLato = Math.ceil(scaffali.length / 2);
    this.minZ = Z0 - perLato * PASSO_Z - 3.2;

    this.costruisciStanza(perLato);
    scaffali.forEach((s, i) => this.costruisciScaffale(s, i));
    this.costruisciDais();
    this.costruisciPortale(desideriN);
    this.costruisciAtmosfera();

    this.ridimensiona();
    addEventListener("resize", this.ridimensiona);
    canvas.addEventListener("pointerdown", this.onDown);
    canvas.addEventListener("pointermove", this.onMove);
    canvas.addEventListener("pointerup", this.onUp);
    canvas.addEventListener("pointerleave", this.onUp);
    addEventListener("keydown", this.onKeyDown);
    addEventListener("keyup", this.onKeyUp);

    this.raf = requestAnimationFrame(this.tick);
  }

  // ---- costruzione -------------------------------------------------------

  private costruisciStanza(perLato: number) {
    const lung = perLato * PASSO_Z + 10;
    const centroZ = Z0 - (perLato * PASSO_Z) / 2 + PASSO_Z / 2;

    const pav = new THREE.Mesh(
      new THREE.PlaneGeometry(9, lung + 8),
      new THREE.MeshStandardMaterial({ map: texturaPavimento(), roughness: 0.9 }),
    );
    pav.rotation.x = -Math.PI / 2;
    pav.position.set(0, 0, centroZ);
    this.scene.add(pav);
    this.pavimento = pav;

    const soffitto = new THREE.Mesh(
      new THREE.PlaneGeometry(9, lung + 8),
      new THREE.MeshStandardMaterial({ color: 0x0d0820, roughness: 1 }),
    );
    soffitto.rotation.x = Math.PI / 2;
    soffitto.position.set(0, 4.4, centroZ);
    this.scene.add(soffitto);

    const matParete = new THREE.MeshStandardMaterial({ color: 0x1a1030, roughness: 1 });
    const paretiX: [number, number][] = [[-4.5, Math.PI / 2], [4.5, -Math.PI / 2]];
    for (const [x, ry] of paretiX) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(lung + 8, 4.4), matParete);
      m.rotation.y = ry;
      m.position.set(x, 2.2, centroZ);
      this.scene.add(m);
    }
    // fondo (dietro il dais) e ingresso
    const fondo = new THREE.Mesh(new THREE.PlaneGeometry(9, 4.4), matParete);
    fondo.position.set(0, 2.2, this.minZ - 0.5);
    this.scene.add(fondo);
    const ingresso = new THREE.Mesh(new THREE.PlaneGeometry(9, 4.4), matParete);
    ingresso.rotation.y = Math.PI;
    ingresso.position.set(0, 2.2, this.maxZ + 0.9);
    this.scene.add(ingresso);

    // tappeto centrale
    const tappeto = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, lung),
      new THREE.MeshStandardMaterial({ color: 0x3a1230, roughness: 0.8 }),
    );
    tappeto.rotation.x = -Math.PI / 2;
    tappeto.position.set(0, 0.01, centroZ);
    this.scene.add(tappeto);
  }

  private matLegno(tinta?: string): THREE.MeshStandardMaterial {
    const map = texturaLegno(tinta);
    this.daSmaltire.push(map);
    return new THREE.MeshStandardMaterial({ map, roughness: 0.85 });
  }

  private costruisciScaffale(shelf: Scaffale, indice: number) {
    const lato = indice % 2 === 0 ? -1 : 1;
    const fila = Math.floor(indice / 2);
    const z = Z0 - fila * PASSO_Z;
    const x = lato * LATO_X;
    const ry = lato < 0 ? Math.PI / 2 : -Math.PI / 2;
    const tema = temaDi(shelf.id);

    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = ry;

    const L = 2.5, H = 3.0, P = 0.42;
    const legno = this.matLegno();
    // fianchi + fondo + cappello
    const fianco = new THREE.BoxGeometry(0.08, H, P);
    for (const dx of [-L / 2, L / 2]) {
      const m = new THREE.Mesh(fianco, legno);
      m.position.set(dx, H / 2, 0);
      g.add(m);
    }
    const fondo = new THREE.Mesh(new THREE.BoxGeometry(L, H, 0.06), legno);
    fondo.position.set(0, H / 2, -P / 2 + 0.03);
    g.add(fondo);
    const cappello = new THREE.Mesh(new THREE.BoxGeometry(L + 0.2, 0.12, P + 0.1), legno);
    cappello.position.set(0, H + 0.02, 0);
    g.add(cappello);

    // ripiani
    const nRip = 4;
    const yBase = 0.5;
    const passoY = (H - yBase - 0.25) / (nRip - 1);
    const ripianoGeo = new THREE.BoxGeometry(L, 0.05, P);
    const ripiani: number[] = [];
    for (let r = 0; r < nRip; r++) {
      const y = yBase + r * passoY;
      const m = new THREE.Mesh(ripianoGeo, legno);
      m.position.set(0, y, 0);
      g.add(m);
      ripiani.push(y);
    }

    // insegna luminosa
    const insegnaMap = texturaInsegna(shelf.nome, tema.icona, tema.luce, tema.motto);
    this.daSmaltire.push(insegnaMap);
    const insegna = new THREE.Mesh(
      new THREE.PlaneGeometry(L, L * 0.32),
      new THREE.MeshBasicMaterial({ map: insegnaMap, transparent: true }),
    );
    insegna.position.set(0, H + 0.45, 0.02);
    insegna.userData = { scaffaleId: shelf.id };
    g.add(insegna);
    this.interattivi.push(insegna);
    // alone dell'insegna
    const alone = new THREE.Sprite(new THREE.SpriteMaterial({
      map: texturaAlone(tema.luce), color: tema.luce, transparent: true,
      opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    alone.scale.set(3.4, 1.6, 1);
    alone.position.set(0, H + 0.45, 0.06);
    g.add(alone);

    // libri "di faccia" sui ripiani
    const perRip = Math.max(4, Math.ceil(shelf.libri.length / nRip));
    const passoX = (L - 0.3) / perRip;
    const larghCop = Math.min(0.42, passoX - 0.06);
    shelf.libri.forEach((libro, i) => {
      const r = Math.floor(i / perRip);
      const c = i % perRip;
      const yRip = ripiani[Math.min(r, ripiani.length - 1)]!;
      const bx = -L / 2 + 0.2 + c * passoX + passoX / 2;
      this.aggiungiLibro(g, libro, bx, yRip + 0.05, larghCop);
    });

    this.scene.add(g);

    // waypoint davanti allo scaffale
    const wx = lato * 1.35;
    this.waypoints.push({
      id: shelf.id,
      x: wx,
      z,
      yaw: yawVerso(wx, z, x, z),
    });
  }

  private aggiungiLibro(g: THREE.Group, libro: Libro, x: number, yBase: number, largh: number) {
    const alt = largh * 1.5;
    // blocchetto-libro (spessore) con copertina davanti
    const spess = 0.16 + Math.random() * 0.05;
    const corpo = new THREE.Mesh(
      new THREE.BoxGeometry(largh, alt, spess),
      new THREE.MeshStandardMaterial({ color: 0x20141a, roughness: 0.8 }),
    );
    corpo.position.set(x, yBase + alt / 2, -0.04);
    g.add(corpo);

    const cop = new THREE.Mesh(
      new THREE.PlaneGeometry(largh, alt),
      new THREE.MeshStandardMaterial({ color: 0x3a2a3a, roughness: 0.6 }),
    );
    cop.position.set(x, yBase + alt / 2, spess / 2 - 0.035);
    cop.userData = { libro };
    g.add(cop);
    this.interattivi.push(cop);

    // carica la copertina reale (stesso-origine → texture sicura)
    this.loader.load(
      coverUrl(libro.id),
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = ANISO;
        (cop.material as THREE.MeshStandardMaterial).map = tex;
        (cop.material as THREE.MeshStandardMaterial).color.set(0xffffff);
        (cop.material as THREE.MeshStandardMaterial).needsUpdate = true;
        this.daSmaltire.push(tex);
      },
      undefined,
      () => {},
    );
  }

  private costruisciDais() {
    const z = this.minZ + 1.6;
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(1.5, 1.7, 0.3, 32),
      this.matLegno("#241528"),
    );
    base.position.set(0, 0.15, z);
    this.scene.add(base);
    const colonna = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.36, 1.1, 20),
      new THREE.MeshStandardMaterial({ color: 0x2a1c3a, roughness: 0.6 }),
    );
    colonna.position.set(0, 0.85, z);
    this.scene.add(colonna);

    // sfera del destino, fluttuante e luminosa
    this.orb = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.42, 1),
      new THREE.MeshStandardMaterial({
        color: 0xffd98a, emissive: 0xff9d3c, emissiveIntensity: 1.3,
        roughness: 0.3, metalness: 0.4, flatShading: true,
      }),
    );
    this.orb.position.set(0, 1.85, z);
    this.orb.userData = { azione: "ruota" };
    this.scene.add(this.orb);
    this.interattivi.push(this.orb);

    const anello = new THREE.Mesh(
      new THREE.TorusGeometry(0.62, 0.03, 8, 40),
      new THREE.MeshBasicMaterial({ color: 0xffcf7a }),
    );
    anello.position.copy(this.orb.position);
    anello.rotation.x = Math.PI / 2;
    anello.userData = { azione: "ruota" };
    this.scene.add(anello);
    this.interattivi.push(anello);

    const alone = new THREE.Sprite(new THREE.SpriteMaterial({
      map: texturaAlone("#ffcf7a"), color: 0xffcf7a, transparent: true,
      opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    alone.scale.set(3, 3, 1);
    alone.position.copy(this.orb.position);
    this.scene.add(alone);

    this.orbLuce = new THREE.PointLight(0xffb35c, 2.4, 12, 2);
    this.orbLuce.position.set(0, 2.1, z);
    this.scene.add(this.orbLuce);

    // cartello a terra
    const map = texturaInsegna("La Ruota del Destino", "🔮", "#ffcf7a", "Scegli per me");
    this.daSmaltire.push(map);
    const cartello = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 1.03),
      new THREE.MeshBasicMaterial({ map, transparent: true }),
    );
    cartello.position.set(0, 2.9, z - 0.2);
    this.scene.add(cartello);

    this.waypoints.push({ id: "__ruota", x: 0, z: z + 2.1, yaw: yawVerso(0, z + 2.1, 0, z) });
  }

  private costruisciPortale(desideriN: number) {
    // portale dei desideri, vicino all'ingresso, sul lato destro
    const z = this.maxZ - 1.6;
    const x = LATO_X - 0.1;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = -Math.PI / 2;

    const arco = new THREE.Mesh(
      new THREE.TorusGeometry(0.95, 0.09, 12, 48, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0xf6b45a, emissive: 0xe08a2c, emissiveIntensity: 0.8, metalness: 0.6, roughness: 0.3 }),
    );
    arco.position.set(0, 1.15, 0);
    g.add(arco);
    for (const dx of [-0.95, 0.95]) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.15, 12),
        new THREE.MeshStandardMaterial({ color: 0xf6b45a, emissive: 0xe08a2c, emissiveIntensity: 0.6, metalness: 0.6, roughness: 0.3 }));
      col.position.set(dx, 0.57, 0);
      g.add(col);
    }
    // velo luminoso del portale
    const velo = new THREE.Mesh(
      new THREE.PlaneGeometry(1.8, 2.1),
      new THREE.MeshBasicMaterial({ color: 0x3a2a12, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    );
    velo.position.set(0, 1.1, 0);
    velo.userData = { azione: "desideri" };
    g.add(velo);
    this.interattivi.push(velo);

    const map = texturaInsegna(`I Desideri · ${desideriN}`, "⭐", "#f6b45a", "Ancora da conquistare");
    this.daSmaltire.push(map);
    const insegna = new THREE.Mesh(
      new THREE.PlaneGeometry(2.1, 0.98),
      new THREE.MeshBasicMaterial({ map, transparent: true }),
    );
    insegna.position.set(0, 2.5, 0);
    insegna.userData = { azione: "desideri" };
    g.add(insegna);
    this.interattivi.push(insegna);

    const luce = new THREE.PointLight(0xf6b45a, 1.2, 8, 2);
    luce.position.set(0, 1.4, 0.4);
    g.add(luce);

    this.scene.add(g);
    this.portale = g;
    this.waypoints.push({ id: "__desideri", x: x - 1.3, z, yaw: yawVerso(x - 1.3, z, x, z) });
  }

  private costruisciAtmosfera() {
    this.scene.add(new THREE.AmbientLight(0x40305a, 0.7));
    const emi = new THREE.HemisphereLight(0x5a4a80, 0x1a1008, 0.5);
    this.scene.add(emi);

    // candele fluttuanti lungo la corsia
    const aloneMap = texturaAlone("#ffcf8a");
    this.daSmaltire.push(aloneMap);
    const perLato = Math.ceil(this.waypoints.length / 2);
    for (let i = 0; i < 5; i++) {
      const z = Z0 + 2 - i * (PASSO_Z * perLato + 4) / 5;
      const x = (i % 2 === 0 ? -1 : 1) * 1.1;
      const luce = new THREE.PointLight(0xffb060, 1.6, 9, 2);
      luce.position.set(x, 2.5, z);
      this.scene.add(luce);
      this.candele.push({ luce, base: 1.6, fase: Math.random() * 6 });

      const fiamma = new THREE.Sprite(new THREE.SpriteMaterial({
        map: aloneMap, color: 0xffd28a, transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      fiamma.scale.set(0.5, 0.7, 1);
      fiamma.position.set(x, 2.5, z);
      this.scene.add(fiamma);
    }

    // polvere magica: punti dorati che ondeggiano
    const N = BASSA_POTENZA ? 220 : 500;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 8;
      pos[i * 3 + 1] = Math.random() * 4.2;
      pos[i * 3 + 2] = this.minZ + Math.random() * (this.maxZ - this.minZ + 4);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.daSmaltire.push(geo);
    const matP = new THREE.PointsMaterial({
      map: aloneMap, color: 0xffd98a, size: 0.06, transparent: true,
      opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    this.particelle = new THREE.Points(geo, matP);
    this.scene.add(this.particelle);
  }

  // ---- navigazione e input ----------------------------------------------

  private ndc(e: PointerEvent): THREE.Vector2 {
    const r = this.canvas.getBoundingClientRect();
    return new THREE.Vector2(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1,
    );
  }

  private onDown = (e: PointerEvent) => {
    this.giu = true;
    this.trascinato = false;
    this.ultimoX = e.clientX;
    this.ultimoY = e.clientY;
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  private onMove = (e: PointerEvent) => {
    if (!this.giu) return;
    const dx = e.clientX - this.ultimoX;
    const dy = e.clientY - this.ultimoY;
    if (Math.abs(dx) + Math.abs(dy) > 4) this.trascinato = true;
    this.ultimoX = e.clientX;
    this.ultimoY = e.clientY;
    this.ruotaVerso = false;
    this.yaw -= dx * 0.005;
    this.yawBersaglio = this.yaw;
    this.pitch = Math.max(-0.9, Math.min(0.9, this.pitch - dy * 0.005));
  };

  private onUp = (e: PointerEvent) => {
    if (!this.giu) return;
    this.giu = false;
    if (this.trascinato) return;
    // clic secco → raycast su libri/insegne/oggetti, poi sul pavimento
    const p = this.ndc(e);
    this.raycaster.setFromCamera(p, this.camera);

    const hit = this.raycaster.intersectObjects(this.interattivi, false)[0];
    if (hit) {
      const u = hit.object.userData as { libro?: Libro; scaffaleId?: string; azione?: string };
      if (u.libro) return this.cb.onPickLibro(u.libro);
      if (u.azione === "ruota") return this.cb.onRuota();
      if (u.azione === "desideri") return this.cb.onDesideri();
      if (u.scaffaleId) return this.vaiAScaffale(u.scaffaleId);
    }
    const suolo = this.raycaster.intersectObject(this.pavimento, false)[0];
    if (suolo) {
      this.posBersaglio.set(
        Math.max(-1.85, Math.min(1.85, suolo.point.x)),
        0,
        Math.max(this.minZ + 0.6, Math.min(this.maxZ, suolo.point.z)),
      );
    }
  };

  private onKeyDown = (e: KeyboardEvent) => {
    this.tasti.add(e.key.toLowerCase());
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.tasti.delete(e.key.toLowerCase());
  };

  /** Passo continuo per i pulsanti mobile (1 avanti, -1 indietro, 0 fermo). */
  impostaPasso(v: number) {
    this.passo = v;
  }

  vaiAScaffale(id: string) {
    const w = this.waypoints.find((x) => x.id === id);
    if (!w) return;
    this.posBersaglio.set(w.x, 0, w.z);
    this.yawBersaglio = w.yaw;
    this.ruotaVerso = true;
  }
  vaiAllaRuota() { this.vaiAScaffale("__ruota"); }
  vaiAiDesideri() { this.vaiAScaffale("__desideri"); }
  vaiAllIngresso() {
    this.posBersaglio.set(0, 0, this.maxZ);
    this.yawBersaglio = 0;
    this.ruotaVerso = true;
  }

  // ---- loop --------------------------------------------------------------

  private tick = () => {
    this.raf = requestAnimationFrame(this.tick);
    const dt = Math.min(this.orologio.getDelta(), 0.05);
    const t = this.orologio.elapsedTime;

    // movimento manuale (WASD + pulsanti)
    const avanti = (this.tasti.has("w") || this.tasti.has("arrowup") ? 1 : 0) +
      (this.tasti.has("s") || this.tasti.has("arrowdown") ? -1 : 0) + this.passo;
    const lat = (this.tasti.has("d") ? 1 : 0) + (this.tasti.has("a") ? -1 : 0);

    if (avanti !== 0 || lat !== 0) {
      const v = 3.0 * dt;
      const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
      this.pos.x += (-sin * avanti + cos * lat) * v;
      this.pos.z += (-cos * avanti - sin * -lat) * v;
      this.posBersaglio.copy(this.pos);
    } else {
      const k = 1 - Math.pow(0.0016, dt);
      this.pos.lerp(this.posBersaglio, k);
    }
    // limiti della sala
    this.pos.x = Math.max(-1.9, Math.min(1.9, this.pos.x));
    this.pos.z = Math.max(this.minZ + 0.6, Math.min(this.maxZ + 0.3, this.pos.z));

    // rotazione morbida verso il bersaglio (solo dopo un clic-cammina)
    if (this.ruotaVerso) {
      const d = normalizzaAngolo(this.yawBersaglio - this.yaw);
      this.yaw += d * (1 - Math.pow(0.002, dt));
      if (Math.abs(d) < 0.01) this.ruotaVerso = false;
    }

    const bob = Math.sin(t * 6) * 0.012 * (avanti !== 0 ? 1 : 0);
    this.camera.position.set(this.pos.x, OCCHI + bob, this.pos.z);
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;

    // scaffale più vicino → HUD
    let vicino: string | null = null;
    let distMin = 2.0;
    for (const w of this.waypoints) {
      if (w.id.startsWith("__")) continue;
      const d = Math.hypot(this.pos.x - w.x, this.pos.z - w.z);
      if (d < distMin) { distMin = d; vicino = w.id; }
    }
    if (vicino !== this.scaffaleAttuale) {
      this.scaffaleAttuale = vicino;
      this.cb.onArrivo(vicino);
    }

    // atmosfera viva
    for (const c of this.candele) {
      c.luce.intensity = c.base * (0.75 + Math.sin(t * 9 + c.fase) * 0.12 + Math.random() * 0.06);
    }
    this.orb.rotation.y += dt * 0.6;
    this.orb.rotation.x += dt * 0.25;
    this.orb.position.y = 1.85 + Math.sin(t * 1.4) * 0.06;
    this.orbLuce.intensity = 2.2 + Math.sin(t * 3) * 0.4;
    if (this.particelle) {
      this.particelle.rotation.y = t * 0.02;
      const arr = this.particelle.geometry.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 1; i < arr.count * 3; i += 3) {
        // leggero saliscendi
      }
      this.particelle.position.y = Math.sin(t * 0.3) * 0.1;
    }

    this.renderer.render(this.scene, this.camera);
  };

  private ridimensiona = () => {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    removeEventListener("resize", this.ridimensiona);
    removeEventListener("keydown", this.onKeyDown);
    removeEventListener("keyup", this.onKeyUp);
    this.canvas.removeEventListener("pointerdown", this.onDown);
    this.canvas.removeEventListener("pointermove", this.onMove);
    this.canvas.removeEventListener("pointerup", this.onUp);
    this.canvas.removeEventListener("pointerleave", this.onUp);
    for (const x of this.daSmaltire) x.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = (m as THREE.Mesh).material;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else if (mat) (mat as THREE.Material).dispose();
    });
    this.renderer.dispose();
  }
}
