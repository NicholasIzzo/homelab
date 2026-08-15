import * as THREE from "three";
import { coverUrl } from "../api";
import { temaDi } from "../temi";
import type { Shelf, StoreItem } from "../tipi";

export interface CallbacksScena {
  onPickItem: (item: StoreItem, shelfId: string) => void;
  onArrivo: (shelfId: string | null) => void;
  onRoulette: () => void;
}

const OCCHI = 1.6; // altezza occhi
const RIPIANI = 3;
const BOX_PER_RIPIANO = 7;
const PER_PAGINA = RIPIANI * BOX_PER_RIPIANO;
const LARGHEZZA_UNITA = 3.8;
const PASSO_CORSIE = 4.6; // distanza tra unità lungo il corridoio
const X_UNITA = 4.2; // distanza delle unità dal centro corridoio
const X_CAMMINO = 3.0; // quanto ci si può allontanare dal centro
const PORTATA = 3.4; // distanza massima per "prendere" una custodia
const LARGHEZZA_NEGOZIO = 10.8;

// filtro anisotropico: nitidezza delle texture viste di sbieco (impostato dal renderer)
let ANISO = 1;

interface Unita {
  shelf: Shelf;
  group: THREE.Group;
  boxes: THREE.Mesh[];
  etichette: THREE.Mesh[];
  frecce: THREE.Mesh[];
  pagina: 0 | number;
  lato: -1 | 1;
  waypoint: { pos: THREE.Vector3; yaw: number };
  texAssicurate: boolean;
}

interface Glide {
  daPos: THREE.Vector3;
  aPos: THREE.Vector3;
  daYaw: number;
  aYaw: number;
  t: number;
  durata: number;
  shelfId: string | null;
  dopo?: () => void;
}

function normalizzaAngolo(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/* ---- texture procedurali (canvas) ---- */

function texturaCanvas(disegna: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, w = 256, h = 256): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  disegna(c.getContext("2d")!, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = ANISO;
  return t;
}

function texturaMoquette(): THREE.CanvasTexture {
  const t = texturaCanvas((ctx, w, h) => {
    ctx.fillStyle = "#17102a";
    ctx.fillRect(0, 0, w, h);
    const colori = ["#ff3d9a", "#2de1fc", "#ffd166", "#66ff99"];
    for (let i = 0; i < 46; i++) {
      ctx.fillStyle = colori[i % colori.length]! + "2e";
      ctx.save();
      ctx.translate(Math.random() * w, Math.random() * h);
      ctx.rotate(Math.random() * Math.PI);
      if (i % 2) ctx.fillRect(-9, -3, 18, 6);
      else {
        ctx.beginPath();
        ctx.moveTo(0, -8);
        ctx.lineTo(7, 6);
        ctx.lineTo(-7, 6);
        ctx.fill();
      }
      ctx.restore();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function texturaLegno(): THREE.CanvasTexture {
  const t = texturaCanvas((ctx, w, h) => {
    ctx.fillStyle = "#54371c";
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 30; i++) {
      ctx.strokeStyle = `rgba(30,16,5,${0.12 + Math.random() * 0.2})`;
      ctx.lineWidth = 1 + Math.random() * 3;
      const y = Math.random() * h;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(w * 0.3, y + 6, w * 0.7, y - 6, w, y);
      ctx.stroke();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function texturaInsegna(nome: string, icona: string, neon: string): THREE.CanvasTexture {
  return texturaCanvas(
    (ctx, w, h) => {
      ctx.fillStyle = "#0a0a12";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = neon;
      ctx.lineWidth = 9;
      ctx.strokeRect(12, 12, w - 24, h - 24);
      ctx.font = "bold 126px Georgia, serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = neon;
      ctx.shadowBlur = 50;
      ctx.fillStyle = neon;
      ctx.fillText(`${icona} ${nome}`, w / 2, h / 2 + 6, w - 90);
    },
    1536,
    288,
  );
}

function texturaFreccia(dir: -1 | 1, neon: string): THREE.CanvasTexture {
  return texturaCanvas(
    (ctx, w, h) => {
      ctx.fillStyle = "#0a0a12";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = neon;
      ctx.shadowColor = neon;
      ctx.shadowBlur = 18;
      ctx.beginPath();
      if (dir === 1) {
        ctx.moveTo(w * 0.3, h * 0.22);
        ctx.lineTo(w * 0.74, h * 0.5);
        ctx.lineTo(w * 0.3, h * 0.78);
      } else {
        ctx.moveTo(w * 0.7, h * 0.22);
        ctx.lineTo(w * 0.26, h * 0.5);
        ctx.lineTo(w * 0.7, h * 0.78);
      }
      ctx.fill();
    },
    128,
    128,
  );
}

/** Legno (o metallo, o vernice) a tema: ogni genere ha il suo materiale, come
 *  una libreria d'epoca ha il suo mogano intarsiato. Tutto procedurale. */
function texturaLegnoTema(shelfId: string, neon: string): THREE.CanvasTexture {
  const BASI: Record<string, [string, string]> = {
    horror: ["#1c0d10", "#2e1216"],
    fantascienza: ["#222b36", "#2e3c4c"],
    animazione: ["#8a4fb0", "#8a4fb0"],
    azione: ["#37301c", "#453a20"],
    thriller: ["#181f30", "#222c44"],
    commedia: ["#7a5510", "#8d6316"],
    dramma: ["#43200f", "#582b14"],
    famiglia: ["#8a6a3c", "#9d7a46"],
    serie: ["#332048", "#40285a"],
    novita: ["#54430e", "#665212"],
    varie: ["#3d2712", "#54371c"],
  };
  const [scuro, chiaro] = BASI[shelfId] ?? BASI["varie"]!;
  return texturaCanvas((ctx, w, h) => {
    ctx.fillStyle = chiaro;
    ctx.fillRect(0, 0, w, h);

    if (shelfId === "animazione") {
      // assi dipinte a colori vivaci
      const colori = ["#e0483f", "#e8a33d", "#3faf5c", "#3f7ac0", "#8a4fb0"];
      const nAssi = 5;
      for (let i = 0; i < nAssi; i++) {
        ctx.fillStyle = colori[i % colori.length]!;
        ctx.fillRect(0, (i * h) / nAssi, w, h / nAssi - 3);
      }
    } else {
      // venature del legno (o spazzolatura del metallo)
      for (let i = 0; i < 34; i++) {
        ctx.strokeStyle = scuro + "";
        ctx.globalAlpha = 0.25 + Math.random() * 0.3;
        ctx.lineWidth = 1 + Math.random() * 3;
        const y = Math.random() * h;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(w * 0.3, y + 7, w * 0.7, y - 7, w, y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    if (shelfId === "dramma" || shelfId === "novita") {
      // cornice ornamentale dorata, da biblioteca d'epoca
      ctx.strokeStyle = "#d9a520";
      ctx.globalAlpha = 0.8;
      ctx.lineWidth = 4;
      ctx.strokeRect(10, 10, w - 20, h - 20);
      ctx.font = "26px serif";
      ctx.fillStyle = "#d9a520";
      ctx.textAlign = "center";
      for (let x = 34; x < w; x += 62) ctx.fillText("❦", x, 34);
      ctx.globalAlpha = 1;
    } else if (shelfId === "fantascienza") {
      // pannelli metallici rivettati
      ctx.fillStyle = "#4a5d73";
      for (let x = 18; x < w; x += 60) {
        for (const y of [16, h - 16]) {
          ctx.beginPath();
          ctx.arc(x, y, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.strokeStyle = "#151b23";
      ctx.lineWidth = 3;
      ctx.strokeRect(2, 2, w - 4, h - 4);
    } else if (shelfId === "horror") {
      // graffi e colature
      ctx.strokeStyle = "#571018";
      ctx.lineWidth = 2;
      for (let i = 0; i < 8; i++) {
        const x = Math.random() * w;
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + 10 - Math.random() * 20, 24 + Math.random() * 46);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    } else if (shelfId === "famiglia") {
      // legno chiaro con festoni colorati
      const colori = ["#e0483f", "#e8a33d", "#3faf5c", "#3f7ac0"];
      for (let x = 22; x < w; x += 44) {
        ctx.fillStyle = colori[(x / 44) % colori.length | 0]!;
        ctx.beginPath();
        ctx.arc(x, 14, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // filo neon discreto lungo il bordo
      ctx.strokeStyle = neon;
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 3;
      ctx.strokeRect(4, 4, w - 8, h - 8);
      ctx.globalAlpha = 1;
    }
  }, 512, 128);
}

function texturaMarquee(sala: number, titolo: string): THREE.CanvasTexture {
  return texturaCanvas(
    (ctx, w, h) => {
      ctx.fillStyle = "#0a0a12";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "#ffd166";
      ctx.lineWidth = 10;
      ctx.strokeRect(10, 10, w - 20, h - 20);
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffd166";
      ctx.font = "bold 76px Georgia, serif";
      ctx.shadowColor = "#ffd166";
      ctx.shadowBlur = 24;
      ctx.fillText(`SALA ${sala}`, w / 2, 96);
      ctx.fillStyle = "#f5ecd7";
      ctx.shadowBlur = 10;
      ctx.font = "bold 92px Georgia, serif";
      ctx.fillText(titolo, w / 2, 226, w - 60);
    },
    1024,
    300,
  );
}

function texturaTabellone(intestazione: string, righe: [string, string][]): THREE.CanvasTexture {
  return texturaCanvas(
    (ctx, w, h) => {
      ctx.fillStyle = "#0e0a18";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "#2de1fc";
      ctx.lineWidth = 8;
      ctx.strokeRect(10, 10, w - 20, h - 20);
      ctx.textAlign = "center";
      ctx.fillStyle = "#2de1fc";
      ctx.shadowColor = "#2de1fc";
      ctx.shadowBlur = 30;
      ctx.font = "bold 82px Georgia, serif";
      ctx.fillText(intestazione, w / 2, 128, w - 100);
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "#2de1fc55";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(70, 172);
      ctx.lineTo(w - 70, 172);
      ctx.stroke();
      righe.forEach(([titolo, data], i) => {
        const y = 280 + i * 142;
        ctx.textAlign = "left";
        ctx.fillStyle = "#f5ecd7";
        ctx.font = "62px Georgia, serif";
        ctx.fillText(titolo, 80, y, w - 400);
        ctx.textAlign = "right";
        ctx.fillStyle = "#ffd166";
        ctx.font = "bold 54px monospace";
        ctx.fillText(data, w - 80, y);
      });
    },
    1280,
    1520,
  );
}

/** Targhetta col titolo, come i cartellini dei prezzi sotto le custodie. */
function texturaEtichetta(titolo: string, anno: number | null): THREE.CanvasTexture {
  return texturaCanvas(
    (ctx, w, h) => {
      ctx.fillStyle = "#f5ecd7";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "#8a6a3a";
      ctx.lineWidth = 6;
      ctx.strokeRect(3, 3, w - 6, h - 6);
      ctx.fillStyle = "#241d10";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "bold 44px 'Trebuchet MS', sans-serif";
      const testo = anno ? `${titolo} (${anno})` : titolo;
      ctx.fillText(testo, w / 2, h / 2 + 2, w - 26);
    },
    512,
    104,
  );
}

function texturaEmoji(emoji: string): THREE.CanvasTexture {
  return texturaCanvas(
    (ctx, w, h) => {
      ctx.font = "150px serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(emoji, w / 2, h / 2 + 10);
    },
    192,
    192,
  );
}

function texturaZerbino(nome: string, neon: string): THREE.CanvasTexture {
  return texturaCanvas(
    (ctx, w, h) => {
      ctx.fillStyle = "#151021";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = neon;
      ctx.lineWidth = 10;
      ctx.setLineDash([26, 14]);
      ctx.strokeRect(16, 16, w - 32, h - 32);
      ctx.setLineDash([]);
      ctx.fillStyle = neon;
      ctx.font = "bold 92px Georgia, serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(nome.toUpperCase(), w / 2, h / 2, w - 90);
    },
    1024,
    256,
  );
}

function texturaDiscoRoulette(): THREE.CanvasTexture {
  return texturaCanvas(
    (ctx, w, h) => {
      const cx = w / 2;
      const cy = h / 2;
      const colori = ["#ff3d9a", "#2de1fc", "#ffd166", "#66ff99", "#cc88ff", "#ff8822"];
      const spicchi = 12;
      for (let i = 0; i < spicchi; i++) {
        ctx.fillStyle = colori[i % colori.length]!;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, w / 2 - 4, (i / spicchi) * Math.PI * 2, ((i + 1) / spicchi) * Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#0a0a12";
      ctx.beginPath();
      ctx.arc(cx, cy, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffd166";
      ctx.font = "34px serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("🎲", cx, cy + 2);
    },
    512,
    512,
  );
}


/* ---- la scena ---- */

export class ScenaNegozio {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private raf = 0;
  private orologio = new THREE.Clock();
  private raycaster = new THREE.Raycaster();

  private unita: Unita[] = [];
  private yaw = 0;
  private pitch = 0;
  private glide: Glide | null = null;
  private tasti = new Set<string>();
  private passoTouch = 0;
  private discoRoulette: THREE.Mesh | null = null;
  private waypointRoulette = { pos: new THREE.Vector3(-2.3, OCCHI, 1.4), yaw: Math.PI / 2 };
  private area: { tipo: "negozio" } | { tipo: "sala"; indice: number } = { tipo: "negozio" };
  private filmSale: { item: StoreItem; shelfId: string }[] = [];
  private saleCentri: THREE.Vector3[] = [];
  private zMin = -6;
  private corsiaAttuale: string | null = null;
  private ultimaVerificaTexture = 0;

  private texCopertine = new Map<string, THREE.Texture>();
  private texInCarico = new Set<string>();
  private loader = new THREE.TextureLoader();

  private geoBox = new THREE.BoxGeometry(0.34, 0.51, 0.05);
  private matLatoBox = new THREE.MeshStandardMaterial({ color: 0x14101c, roughness: 0.7 });
  private matLegno: THREE.MeshStandardMaterial;
  private matLegnoTema = new Map<string, THREE.MeshStandardMaterial>();
  private matSegnaposto = new Map<string, THREE.MeshBasicMaterial>();
  private matEtichette = new Map<string, THREE.MeshBasicMaterial>();

  private disposto = false;

  constructor(
    private canvas: HTMLCanvasElement,
    shelves: Shelf[],
    private cb: CallbacksScena,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    ANISO = this.renderer.capabilities.getMaxAnisotropy();
    this.camera = new THREE.PerspectiveCamera(68, 1, 0.1, 60);
    this.camera.position.set(0, OCCHI, 2.2);
    this.camera.rotation.order = "YXZ";

    this.matLegno = new THREE.MeshStandardMaterial({ map: texturaLegno(), roughness: 0.85 });

    this.scene.background = new THREE.Color(0x0b0716);
    this.scene.fog = new THREE.Fog(0x0b0716, 12, 42);

    this.costruisciNegozio(shelves);
    this.costruisciSale(shelves);
    this.costruisciTabellone();
    this.costruisciLuci();

    this.ridimensiona();
    addEventListener("resize", this.ridimensiona);
    this.collegaInput();

    // Copertine delle prime corsie subito, le altre man mano che ci si avvicina.
    for (const u of this.unita.slice(0, 4)) this.assicuraTexture(u);

    this.raf = requestAnimationFrame(this.anima);
  }

  /* ---- costruzione ---- */

  private costruisciNegozio(shelves: Shelf[]) {
    const righe = Math.max(1, Math.ceil(shelves.length / 2));
    const zPrimo = -3.4;
    this.zMin = zPrimo - (righe - 1) * PASSO_CORSIE - 1.2;
    const lunghezza = 4.5 - this.zMin + 2;
    const zCentro = (3.5 + this.zMin - 1.5) / 2;
    const larghezza = LARGHEZZA_NEGOZIO;

    // pavimento
    const moquette = texturaMoquette();
    moquette.repeat.set(larghezza / 2.4, lunghezza / 2.4);
    const pavimento = new THREE.Mesh(
      new THREE.PlaneGeometry(larghezza, lunghezza),
      new THREE.MeshStandardMaterial({ map: moquette, roughness: 1 }),
    );
    pavimento.rotation.x = -Math.PI / 2;
    pavimento.position.set(0, 0, zCentro);
    pavimento.userData = { tipo: "pavimento" };
    this.scene.add(pavimento);

    // soffitto + pannelli luce
    const soffitto = new THREE.Mesh(
      new THREE.PlaneGeometry(larghezza, lunghezza),
      new THREE.MeshStandardMaterial({ color: 0x120d1e, roughness: 1 }),
    );
    soffitto.rotation.x = Math.PI / 2;
    soffitto.position.set(0, 3.2, zCentro);
    this.scene.add(soffitto);

    const geoPannello = new THREE.PlaneGeometry(1.4, 0.5);
    const matPannello = new THREE.MeshBasicMaterial({ color: 0xf0ead2 });
    for (let z = 2; z > this.zMin; z -= PASSO_CORSIE) {
      for (const px of [-2.2, 2.2]) {
        const p = new THREE.Mesh(geoPannello, matPannello);
        p.rotation.x = Math.PI / 2;
        p.position.set(px, 3.19, z);
        this.scene.add(p);
      }
    }

    // pareti
    const matParete = new THREE.MeshStandardMaterial({ color: 0x1c1430, roughness: 1 });
    const mkParete = (w: number, h: number, pos: [number, number, number], rotY: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), matParete);
      m.position.set(...pos);
      m.rotation.y = rotY;
      this.scene.add(m);
    };
    mkParete(lunghezza, 3.2, [-larghezza / 2, 1.6, zCentro], Math.PI / 2);
    mkParete(lunghezza, 3.2, [larghezza / 2, 1.6, zCentro], -Math.PI / 2);
    mkParete(larghezza, 3.2, [0, 1.6, this.zMin - 1.5], 0);
    mkParete(larghezza, 3.2, [0, 1.6, 3.5], Math.PI);

    // insegna USCITA sopra l'ingresso, guardando dentro il negozio
    const uscita = new THREE.Mesh(
      new THREE.PlaneGeometry(1.4, 0.42),
      new THREE.MeshBasicMaterial({ map: texturaInsegna("USCITA", "🚪", "#66ff99") }),
    );
    uscita.position.set(0, 2.7, 3.46);
    uscita.rotation.y = Math.PI;
    this.scene.add(uscita);

    // bancone della cassa vicino all'ingresso, roulette sul lato opposto
    this.costruisciCassa();
    this.costruisciRoulette();

    // unità scaffale, alternate sui due lati del corridoio
    shelves.forEach((shelf, i) => {
      const lato = (i % 2 === 0 ? -1 : 1) as -1 | 1;
      const z = zPrimo - Math.floor(i / 2) * PASSO_CORSIE;
      this.unita.push(this.costruisciUnita(shelf, lato, z));
    });
  }

  private costruisciCassa() {
    const g = new THREE.Group();
    const banco = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.05, 0.7), this.matLegno);
    banco.position.y = 0.525;
    g.add(banco);
    const piano = new THREE.Mesh(
      new THREE.BoxGeometry(1.95, 0.06, 0.85),
      new THREE.MeshStandardMaterial({ color: 0x2b1a12, roughness: 0.5 }),
    );
    piano.position.y = 1.08;
    g.add(piano);
    // il commesso: testa, busto, cappellino
    const busto = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.26, 0.62, 12),
      new THREE.MeshStandardMaterial({ color: 0x2471a3 }),
    );
    busto.position.set(0, 1.42, -0.55);
    g.add(busto);
    const testa = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 16, 12),
      new THREE.MeshStandardMaterial({ color: 0xe8bf9a }),
    );
    testa.position.set(0, 1.9, -0.55);
    g.add(testa);
    const cappello = new THREE.Mesh(
      new THREE.CylinderGeometry(0.17, 0.17, 0.09, 16),
      new THREE.MeshStandardMaterial({ color: 0xb7950b }),
    );
    cappello.position.set(0, 2.0, -0.55);
    g.add(cappello);

    g.position.set(3.9, 0, 1.9);
    g.rotation.y = -Math.PI / 2.6;
    this.scene.add(g);
  }

  /** Tabellone "in arrivo questo mese" sulla parete sinistra, dati dal server. */
  private costruisciTabellone() {
    fetch("/api/uscite")
      .then((r) => r.json())
      .then((d: { fonte: string; titoli: { titolo: string; data: string }[] }) => {
        if (this.disposto || d.titoli.length === 0) return;
        const intestazione =
          d.fonte === "tmdb" ? "🎬 IN ARRIVO AL CINEMA" : "🆕 ULTIMI ARRIVI";
        const board = new THREE.Mesh(
          new THREE.PlaneGeometry(2.1, 2.5),
          new THREE.MeshBasicMaterial({
            map: texturaTabellone(intestazione, d.titoli.map((t) => [t.titolo, t.data])),
          }),
        );
        // parete destra, subito dopo l'ingresso: la prima cosa che vedi entrando
        board.position.set(LARGHEZZA_NEGOZIO / 2 - 0.02, 1.7, 1.2);
        board.rotation.y = -Math.PI / 2;
        this.scene.add(board);
      })
      .catch(() => {});
  }

  /** Le sei sale cinema in fondo al negozio: porte sulla parete di fondo.
   *  Programmazione: una categoria diversa per sala, preferendo i film
   *  dell'anno corrente (le "prime visioni"). */
  private costruisciSale(shelves: Shelf[]) {
    const annoCorrente = new Date().getFullYear();
    const perScaffale = new Map<string, { item: StoreItem; shelfId: string }[]>();
    for (const shelf of shelves) {
      if (shelf.id === "novita" || shelf.id === "recenti") continue;
      for (const item of shelf.items) {
        if (item.type !== "movie" || !item.hasImage) continue;
        const lista = perScaffale.get(shelf.id) ?? [];
        lista.push({ item, shelfId: shelf.id });
        perScaffale.set(shelf.id, lista);
      }
    }
    const mescola = <T,>(a: T[]) => {
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j]!, a[i]!];
      }
      return a;
    };
    const categorie = mescola([...perScaffale.keys()]);
    this.filmSale = [];
    for (const sid of categorie) {
      if (this.filmSale.length === 6) break;
      const lista = perScaffale.get(sid)!;
      const primeVisioni = lista.filter((x) => (x.item.year ?? 0) >= annoCorrente);
      const candidati =
        primeVisioni.length > 0
          ? primeVisioni
          : [...lista].sort((a, b) => (b.item.year ?? 0) - (a.item.year ?? 0)).slice(0, 6);
      this.filmSale.push(candidati[Math.floor(Math.random() * candidati.length)]!);
    }
    if (this.filmSale.length === 0) return;

    const zParete = this.zMin - 1.5;
    const matPorta = new THREE.MeshStandardMaterial({ color: 0x351f18, roughness: 0.8 });

    // insegna della zona cinema sopra le porte
    const insegnaCinema = new THREE.Mesh(
      new THREE.PlaneGeometry(7.2, 0.62),
      new THREE.MeshBasicMaterial({ map: texturaInsegna("CINEMA · PROGRAMMAZIONE", "🎟", "#ff3d9a") }),
    );
    insegnaCinema.position.set(0, 2.88, zParete + 0.02);
    this.scene.add(insegnaCinema);

    const matSedile = new THREE.MeshStandardMaterial({ color: 0x8a1626, roughness: 0.85 });
    const geoSeduta = new THREE.BoxGeometry(0.52, 0.42, 0.5);
    const geoSchienale = new THREE.BoxGeometry(0.52, 0.55, 0.12);
    const matSala = new THREE.MeshStandardMaterial({ color: 0x11101a, roughness: 1 });
    const matTenda = new THREE.MeshStandardMaterial({ color: 0x5c1020, roughness: 0.9 });

    this.filmSale.forEach((film, i) => {
      // porta nel negozio: marquee grande e locandina esposta accanto, come al cinema
      const xPorta = -4.4 + i * 1.76;
      const datiSala = { tipo: "sala", indice: i };
      const porta = new THREE.Mesh(new THREE.BoxGeometry(0.95, 2.05, 0.08), matPorta);
      porta.position.set(xPorta - 0.3, 1.025, zParete + 0.05);
      porta.userData = datiSala;
      this.scene.add(porta);
      const marquee = new THREE.Mesh(
        new THREE.PlaneGeometry(1.6, 0.47),
        new THREE.MeshBasicMaterial({ map: texturaMarquee(i + 1, film.item.title) }),
      );
      marquee.position.set(xPorta, 2.34, zParete + 0.06);
      marquee.userData = datiSala;
      this.scene.add(marquee);

      // bacheca con la locandina del film in proiezione
      const bacheca = new THREE.Mesh(new THREE.BoxGeometry(0.72, 1.06, 0.05), matPorta);
      bacheca.position.set(xPorta + 0.55, 1.35, zParete + 0.04);
      bacheca.userData = datiSala;
      this.scene.add(bacheca);
      const locandina = new THREE.Mesh(
        new THREE.PlaneGeometry(0.62, 0.94),
        this.segnaposto("#ffd166"),
      );
      locandina.position.set(xPorta + 0.55, 1.35, zParete + 0.075);
      locandina.userData = datiSala;
      this.scene.add(locandina);
      this.loader.load(coverUrl(film.item.id, 450), (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = ANISO;
        if (!this.disposto) locandina.material = new THREE.MeshBasicMaterial({ map: tex });
      });

      // la sala vera e propria, in una "tasca" ben distanziata dietro la parete:
      // spaziatura larga, così la planata non sfiora mai le sale vicine
      const cx = (i - 2.5) * 22;
      const cz = this.zMin - 16;
      this.saleCentri.push(new THREE.Vector3(cx, 0, cz));
      const sala = new THREE.Group();
      sala.position.set(cx, 0, cz);

      const pav = new THREE.Mesh(new THREE.PlaneGeometry(6, 7), matSala);
      pav.rotation.x = -Math.PI / 2;
      pav.userData = { tipo: "pavimento" };
      sala.add(pav);
      const soff = new THREE.Mesh(new THREE.PlaneGeometry(6, 7), matSala);
      soff.rotation.x = Math.PI / 2;
      soff.position.y = 3.1;
      sala.add(soff);
      const mkMuro = (w: number, pos: [number, number, number], rotY: number) => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 3.1), matSala);
        m.position.set(...pos);
        m.rotation.y = rotY;
        sala.add(m);
      };
      mkMuro(7, [-3, 1.55, 0], Math.PI / 2);
      mkMuro(7, [3, 1.55, 0], -Math.PI / 2);
      mkMuro(6, [0, 1.55, -3.5], 0);
      mkMuro(6, [0, 1.55, 3.5], Math.PI);

      // schermo col backdrop del film + tende ai lati
      const schermo = new THREE.Mesh(
        new THREE.PlaneGeometry(4.4, 2.48),
        new THREE.MeshBasicMaterial({ color: 0x222233 }),
      );
      schermo.position.set(0, 1.75, -3.44);
      schermo.userData = { tipo: "schermo", indice: i };
      sala.add(schermo);
      this.loader.load(`/api/image/${film.item.id}?h=720&tipo=backdrop`, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = ANISO;
        if (!this.disposto) schermo.material = new THREE.MeshBasicMaterial({ map: tex });
      });
      for (const lato of [-1, 1]) {
        const tenda = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.9, 0.25), matTenda);
        tenda.position.set(lato * 2.6, 1.5, -3.3);
        sala.add(tenda);
      }
      const targa = new THREE.Mesh(
        new THREE.PlaneGeometry(2.2, 0.4),
        new THREE.MeshBasicMaterial({ map: texturaMarquee(i + 1, film.item.title) }),
      );
      targa.position.set(0, 2.85, -3.46);
      targa.userData = { tipo: "schermo", indice: i };
      sala.add(targa);

      // quattro file di poltroncine
      for (let fila = 0; fila < 4; fila++) {
        for (let posto = 0; posto < 6; posto++) {
          const sx = -1.875 + posto * 0.75;
          const sz = -0.6 + fila * 0.9;
          const seduta = new THREE.Mesh(geoSeduta, matSedile);
          seduta.position.set(sx, 0.21, sz);
          sala.add(seduta);
          const schienale = new THREE.Mesh(geoSchienale, matSedile);
          schienale.position.set(sx, 0.55, sz + 0.25);
          sala.add(schienale);
        }
      }

      // porta d'uscita della sala
      const uscitaSala = new THREE.Mesh(
        new THREE.PlaneGeometry(1.2, 0.42),
        new THREE.MeshBasicMaterial({ map: texturaInsegna("USCITA", "🚪", "#66ff99") }),
      );
      uscitaSala.position.set(0, 2.5, 3.46);
      uscitaSala.rotation.y = Math.PI;
      uscitaSala.userData = { tipo: "esci-sala" };
      sala.add(uscitaSala);
      const battente = new THREE.Mesh(new THREE.BoxGeometry(0.95, 2.05, 0.08), matPorta);
      battente.position.set(0, 1.025, 3.46);
      battente.userData = { tipo: "esci-sala" };
      sala.add(battente);

      this.scene.add(sala);
    });
  }

  private costruisciRoulette() {
    const g = new THREE.Group();
    const dati = { tipo: "roulette" };

    const podio = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.64, 1.0, 20), this.matLegno);
    podio.position.y = 0.5;
    podio.userData = dati;
    g.add(podio);

    const disco = new THREE.Mesh(
      new THREE.CylinderGeometry(0.58, 0.58, 0.07, 32),
      [
        new THREE.MeshStandardMaterial({ color: 0x1c1430 }),
        new THREE.MeshBasicMaterial({ map: texturaDiscoRoulette() }),
        new THREE.MeshStandardMaterial({ color: 0x1c1430 }),
      ],
    );
    disco.position.y = 1.05;
    disco.userData = dati;
    this.discoRoulette = disco;
    g.add(disco);

    const insegna = new THREE.Mesh(
      new THREE.PlaneGeometry(1.7, 0.5),
      new THREE.MeshBasicMaterial({ map: texturaInsegna("INDECISO?", "🎲", "#ffd166") }),
    );
    insegna.position.set(0, 2.15, 0);
    insegna.rotation.y = Math.PI / 2;
    insegna.userData = dati;
    g.add(insegna);

    const palo = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 0.85, 8),
      new THREE.MeshStandardMaterial({ color: 0x3a3f45 }),
    );
    palo.position.y = 1.5;
    g.add(palo);

    g.position.set(-3.9, 0, 1.4);
    this.scene.add(g);
  }

  private costruisciUnita(shelf: Shelf, lato: -1 | 1, z: number): Unita {
    const tema = temaDi(shelf.id);
    const group = new THREE.Group();
    group.position.set(lato * X_UNITA, 0, z);
    group.rotation.y = lato === -1 ? Math.PI / 2 : -Math.PI / 2;
    // dopo la rotazione, il "davanti" dell'unità guarda il centro corridoio

    const datiCorsia = { tipo: "corsia", shelfId: shelf.id };

    // struttura nel materiale del tema: mogano per il dramma, metallo per la
    // fantascienza, assi dipinte per l'animazione…
    let matTema = this.matLegnoTema.get(shelf.id);
    if (!matTema) {
      matTema = new THREE.MeshStandardMaterial({
        map: texturaLegnoTema(shelf.id, tema.neon),
        roughness: shelf.id === "fantascienza" ? 0.45 : 0.85,
      });
      this.matLegnoTema.set(shelf.id, matTema);
    }
    const mkAsse = (w: number, h: number, d: number, x: number, y: number, zz: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), matTema);
      m.position.set(x, y, zz);
      m.userData = datiCorsia;
      group.add(m);
      return m;
    };
    const H = 2.55;
    mkAsse(0.09, H, 0.5, -LARGHEZZA_UNITA / 2, H / 2, 0);
    mkAsse(0.09, H, 0.5, LARGHEZZA_UNITA / 2, H / 2, 0);
    for (const y of [0.5, 1.25, 2.0]) mkAsse(LARGHEZZA_UNITA, 0.06, 0.5, 0, y - 0.03, 0);
    mkAsse(LARGHEZZA_UNITA + 0.18, 0.1, 0.56, 0, H + 0.03, 0);

    // fondale colorato nel tono del genere
    const fondale = new THREE.Mesh(
      new THREE.BoxGeometry(LARGHEZZA_UNITA, H, 0.05),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(tema.fondo).multiplyScalar(2.2),
        roughness: 0.9,
      }),
    );
    fondale.position.set(0, H / 2, -0.24);
    fondale.userData = datiCorsia;
    group.add(fondale);

    // oggetti d'atmosfera appoggiati sopra lo scaffale, ai lati dell'insegna
    const matEmoji = new THREE.MeshBasicMaterial({
      map: texturaEmoji(tema.icona),
      transparent: true,
    });
    for (const lato2 of [-1, 1]) {
      const prop = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.44), matEmoji);
      prop.position.set(lato2 * (LARGHEZZA_UNITA / 2 - 0.28), 2.9, 0.05);
      prop.userData = datiCorsia;
      group.add(prop);
    }

    // zerbino davanti allo scaffale col nome della sezione
    const zerbino = new THREE.Mesh(
      new THREE.PlaneGeometry(2.7, 0.68),
      new THREE.MeshBasicMaterial({ map: texturaZerbino(shelf.name, tema.neon) }),
    );
    zerbino.rotation.x = -Math.PI / 2;
    zerbino.position.set(0, 0.012, 0.85);
    zerbino.userData = datiCorsia;
    group.add(zerbino);

    // insegna al neon sopra l'unità
    const insegna = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 0.64),
      new THREE.MeshBasicMaterial({ map: texturaInsegna(shelf.name, tema.icona, tema.neon) }),
    );
    insegna.position.set(0, H + 0.5, 0.06);
    insegna.userData = datiCorsia;
    group.add(insegna);

    // le custodie: fronte con copertina (o segnaposto colorato), il resto plastica
    // scura; sotto ognuna, la targhetta col titolo sul bordo del ripiano
    const boxes: THREE.Mesh[] = [];
    const etichette: THREE.Mesh[] = [];
    const geoEtichetta = new THREE.PlaneGeometry(0.48, 0.105);
    const passoX = (LARGHEZZA_UNITA - 0.5) / BOX_PER_RIPIANO;
    for (let r = 0; r < RIPIANI; r++) {
      for (let c = 0; c < BOX_PER_RIPIANO; c++) {
        const x = -((BOX_PER_RIPIANO - 1) / 2) * passoX + c * passoX;
        const box = new THREE.Mesh(this.geoBox, this.materialiBox(this.segnaposto(tema.neon)));
        box.position.set(x, 0.5 + r * 0.75 + 0.51 / 2, 0.14);
        // leggera rotazione casuale, come custodie posate a mano
        box.rotation.y = (Math.random() - 0.5) * 0.06;
        box.visible = false;
        group.add(box);
        boxes.push(box);

        const etichetta = new THREE.Mesh(geoEtichetta, this.matLatoBox);
        etichetta.position.set(x, 0.5 + r * 0.75 - 0.045, 0.2505);
        etichetta.visible = false;
        group.add(etichetta);
        etichette.push(etichetta);
      }
    }

    // frecce pagina (solo se serve)
    const frecce: THREE.Mesh[] = [];
    if (shelf.items.length > PER_PAGINA) {
      for (const dir of [-1, 1] as const) {
        const f = new THREE.Mesh(
          new THREE.PlaneGeometry(0.34, 0.34),
          new THREE.MeshBasicMaterial({ map: texturaFreccia(dir, tema.neon), transparent: true }),
        );
        f.position.set(dir * (LARGHEZZA_UNITA / 2 + 0.28), 1.3, 0.1);
        f.userData = { tipo: "pagina", shelfId: shelf.id, dir };
        group.add(f);
        frecce.push(f);
      }
    }

    this.scene.add(group);

    const unita: Unita = {
      shelf,
      group,
      boxes,
      etichette,
      frecce,
      pagina: 0,
      lato,
      waypoint: {
        pos: new THREE.Vector3(lato * 2.15, OCCHI, z),
        yaw: lato === -1 ? Math.PI / 2 : -Math.PI / 2,
      },
      texAssicurate: false,
    };
    this.applicaPagina(unita);
    return unita;
  }

  private segnaposto(neon: string): THREE.MeshBasicMaterial {
    let m = this.matSegnaposto.get(neon);
    if (!m) {
      const col = new THREE.Color(neon).multiplyScalar(0.35);
      m = new THREE.MeshBasicMaterial({ color: col });
      this.matSegnaposto.set(neon, m);
    }
    return m;
  }

  private materialiBox(fronte: THREE.Material): THREE.Material[] {
    // ordine facce BoxGeometry: +x, -x, +y, -y, +z (fronte), -z
    return [this.matLatoBox, this.matLatoBox, this.matLatoBox, this.matLatoBox, fronte, this.matLatoBox];
  }

  private etichettaMat(item: StoreItem): THREE.MeshBasicMaterial {
    let m = this.matEtichette.get(item.id);
    if (!m) {
      m = new THREE.MeshBasicMaterial({ map: texturaEtichetta(item.title, item.year) });
      this.matEtichette.set(item.id, m);
    }
    return m;
  }

  private applicaPagina(u: Unita) {
    const inizio = u.pagina * PER_PAGINA;
    u.boxes.forEach((box, i) => {
      const item = u.shelf.items[inizio + i];
      const etichetta = u.etichette[i];
      if (!item) {
        box.visible = false;
        box.userData = {};
        if (etichetta) {
          etichetta.visible = false;
          etichetta.userData = {};
        }
        return;
      }
      const dati = { tipo: "box", item, shelfId: u.shelf.id };
      box.visible = true;
      box.userData = dati;
      const tex = this.texCopertine.get(item.id);
      const materiali = box.material as THREE.Material[];
      materiali[4] = tex
        ? new THREE.MeshBasicMaterial({ map: tex })
        : this.segnaposto(temaDi(u.shelf.id).neon);
      if (etichetta) {
        etichetta.visible = true;
        etichetta.userData = dati; // cliccare la targhetta = prendere la custodia
        etichetta.material = this.etichettaMat(item);
      }
    });
    u.texAssicurate = false;
  }

  private assicuraTexture(u: Unita) {
    if (u.texAssicurate) return;
    u.texAssicurate = true;
    const inizio = u.pagina * PER_PAGINA;
    for (const item of u.shelf.items.slice(inizio, inizio + PER_PAGINA)) {
      if (this.texCopertine.has(item.id) || this.texInCarico.has(item.id)) continue;
      this.texInCarico.add(item.id);
      this.loader.load(coverUrl(item.id, 320), (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = ANISO;
        this.texCopertine.set(item.id, tex);
        this.texInCarico.delete(item.id);
        if (this.disposto) return;
        // aggiorna le custodie che mostrano questo titolo
        for (const un of this.unita) {
          for (const box of un.boxes) {
            const dati = box.userData as { item?: StoreItem };
            if (dati.item?.id === item.id) {
              (box.material as THREE.Material[])[4] = new THREE.MeshBasicMaterial({ map: tex });
            }
          }
        }
      });
    }
  }

  private costruisciLuci() {
    this.scene.add(new THREE.AmbientLight(0xbfb4e0, 0.75));
    const emi = new THREE.HemisphereLight(0xf0ead2, 0x17102a, 0.9);
    this.scene.add(emi);
    const dir = new THREE.DirectionalLight(0xfff3d6, 1.1);
    dir.position.set(1.5, 3, 2);
    this.scene.add(dir);
  }

  /* ---- input ---- */

  private puntatore = { giu: false, x: 0, y: 0, mosso: 0 };

  private collegaInput() {
    this.canvas.addEventListener("pointerdown", this.suPointerDown);
    this.canvas.addEventListener("pointermove", this.suPointerMove);
    this.canvas.addEventListener("pointerup", this.suPointerUp);
    addEventListener("keydown", this.suKeyDown);
    addEventListener("keyup", this.suKeyUp);
  }

  private suPointerDown = (e: PointerEvent) => {
    this.puntatore = { giu: true, x: e.clientX, y: e.clientY, mosso: 0 };
    this.canvas.setPointerCapture(e.pointerId);
  };

  private suPointerMove = (e: PointerEvent) => {
    if (!this.puntatore.giu) return;
    const dx = e.clientX - this.puntatore.x;
    const dy = e.clientY - this.puntatore.y;
    this.puntatore.x = e.clientX;
    this.puntatore.y = e.clientY;
    this.puntatore.mosso += Math.abs(dx) + Math.abs(dy);
    if (this.puntatore.mosso > 6) {
      this.glide = null; // trascinare interrompe la planata
      this.yaw -= dx * 0.0042;
      this.pitch = THREE.MathUtils.clamp(this.pitch - dy * 0.0032, -0.6, 0.6);
    }
  };

  private suPointerUp = (e: PointerEvent) => {
    const eraTap = this.puntatore.giu && this.puntatore.mosso <= 6;
    this.puntatore.giu = false;
    if (eraTap) this.tocca(e.clientX, e.clientY);
  };

  private suKeyDown = (e: KeyboardEvent) => {
    if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
      this.tasti.add(e.code);
      this.glide = null;
    }
  };

  private suKeyUp = (e: KeyboardEvent) => this.tasti.delete(e.code);

  private tocca(clientX: number, clientY: number) {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - r.left) / r.width) * 2 - 1,
      -((clientY - r.top) / r.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const colpi = this.raycaster.intersectObjects(this.scene.children, true);
    for (const colpo of colpi) {
      const dati = colpo.object.userData as {
        tipo?: string;
        item?: StoreItem;
        shelfId?: string;
        dir?: -1 | 1;
        indice?: number;
      };
      if (!dati.tipo) continue;

      if (dati.tipo === "box" && dati.item && dati.shelfId) {
        if (colpo.distance <= PORTATA) {
          this.cb.onPickItem(dati.item, dati.shelfId);
        } else {
          this.vaiAllaCorsia(dati.shelfId);
        }
        return;
      }
      if (dati.tipo === "corsia" && dati.shelfId) {
        this.vaiAllaCorsia(dati.shelfId);
        return;
      }
      if (dati.tipo === "pavimento") {
        // punta e cammina: si va dove si tocca la moquette (nei limiti dell'area)
        const lim = this.limitiArea();
        const meta = new THREE.Vector3(
          THREE.MathUtils.clamp(colpo.point.x, lim.xMin, lim.xMax),
          OCCHI,
          THREE.MathUtils.clamp(colpo.point.z, lim.zMin, lim.zMax),
        );
        const dx = meta.x - this.camera.position.x;
        const dz = meta.z - this.camera.position.z;
        const distanza = Math.hypot(dx, dz);
        if (distanza < 0.4) return;
        this.glide = {
          daPos: this.camera.position.clone(),
          aPos: meta,
          daYaw: this.yaw,
          aYaw: Math.atan2(-dx, -dz),
          t: 0,
          durata: THREE.MathUtils.clamp(0.35 + distanza * 0.12, 0.5, 2.6),
          shelfId: null,
        };
        return;
      }
      if (dati.tipo === "roulette") {
        if (colpo.distance <= PORTATA + 1) {
          this.cb.onRoulette();
        } else {
          this.vaiAllaRoulette();
        }
        return;
      }
      if (dati.tipo === "sala" && dati.indice !== undefined) {
        this.entraInSala(dati.indice as number);
        return;
      }
      if (dati.tipo === "schermo" && dati.indice !== undefined) {
        const film = this.filmSale[dati.indice as number];
        if (film) this.cb.onPickItem(film.item, film.shelfId);
        return;
      }
      if (dati.tipo === "esci-sala") {
        this.esciDallaSala();
        return;
      }
      if (dati.tipo === "pagina" && dati.shelfId && dati.dir) {
        const u = this.unita.find((x) => x.shelf.id === dati.shelfId);
        if (u) {
          const pagine = Math.ceil(u.shelf.items.length / PER_PAGINA);
          u.pagina = ((u.pagina + dati.dir) % pagine + pagine) % pagine;
          this.applicaPagina(u);
          this.assicuraTexture(u);
        }
        return;
      }
    }
  }

  /* ---- navigazione ---- */

  /** Passo continuo avanti (+1) o indietro (-1) — usato dai pulsanti touch. */
  impostaPasso(passo: -1 | 0 | 1) {
    this.passoTouch = passo;
    if (passo !== 0) this.glide = null;
  }

  private limitiArea() {
    if (this.area.tipo === "sala") {
      const c = this.saleCentri[this.area.indice];
      if (c) return { xMin: c.x - 2.5, xMax: c.x + 2.5, zMin: c.z - 2.6, zMax: c.z + 2.9 };
    }
    return { xMin: -X_CAMMINO, xMax: X_CAMMINO, zMin: this.zMin, zMax: 2.6 };
  }

  private entraInSala(indice: number) {
    const c = this.saleCentri[indice];
    if (!c) return;
    this.area = { tipo: "sala", indice };
    if (this.corsiaAttuale !== null) {
      this.corsiaAttuale = null;
      this.cb.onArrivo(null);
    }
    this.glide = {
      daPos: this.camera.position.clone(),
      aPos: new THREE.Vector3(c.x, OCCHI, c.z + 2.5),
      daYaw: this.yaw,
      aYaw: 0,
      t: 0,
      durata: 1.5,
      shelfId: null,
    };
  }

  private esciDallaSala() {
    const indice = this.area.tipo === "sala" ? this.area.indice : 0;
    this.area = { tipo: "negozio" };
    const xPorta = THREE.MathUtils.clamp(-4.4 + indice * 1.76, -X_CAMMINO, X_CAMMINO);
    this.glide = {
      daPos: this.camera.position.clone(),
      aPos: new THREE.Vector3(xPorta, OCCHI, this.zMin + 0.8),
      daYaw: this.yaw,
      aYaw: Math.PI,
      t: 0,
      durata: 1.5,
      shelfId: null,
    };
  }

  /** Torna davanti alla porta, guardando il negozio. */
  vaiAllIngresso() {
    this.area = { tipo: "negozio" };
    const meta = new THREE.Vector3(0, OCCHI, 2.2);
    const distanza = this.camera.position.distanceTo(meta);
    this.glide = {
      daPos: this.camera.position.clone(),
      aPos: meta,
      daYaw: this.yaw,
      aYaw: 0,
      t: 0,
      durata: THREE.MathUtils.clamp(0.35 + distanza * 0.12, 0.5, 2.6),
      shelfId: null,
    };
  }

  vaiAllaRoulette() {
    this.area = { tipo: "negozio" };
    const distanza = this.camera.position.distanceTo(this.waypointRoulette.pos);
    this.glide = {
      daPos: this.camera.position.clone(),
      aPos: this.waypointRoulette.pos.clone(),
      daYaw: this.yaw,
      aYaw: this.waypointRoulette.yaw,
      t: 0,
      durata: THREE.MathUtils.clamp(0.35 + distanza * 0.12, 0.5, 2.2),
      shelfId: null,
      dopo: () => this.cb.onRoulette(),
    };
  }

  vaiAllaCorsia(shelfId: string) {
    const u = this.unita.find((x) => x.shelf.id === shelfId);
    if (!u) return;
    this.area = { tipo: "negozio" };
    this.assicuraTexture(u);
    const distanza = this.camera.position.distanceTo(u.waypoint.pos);
    this.glide = {
      daPos: this.camera.position.clone(),
      aPos: u.waypoint.pos.clone(),
      daYaw: this.yaw,
      aYaw: u.waypoint.yaw,
      t: 0,
      durata: THREE.MathUtils.clamp(0.35 + distanza * 0.12, 0.5, 2.2),
      shelfId,
    };
  }

  private anima = () => {
    if (this.disposto) return;
    this.raf = requestAnimationFrame(this.anima);
    const dt = Math.min(this.orologio.getDelta(), 0.05);

    if (this.glide) {
      const g = this.glide;
      g.t += dt / g.durata;
      const k = easeInOut(Math.min(g.t, 1));
      this.camera.position.lerpVectors(g.daPos, g.aPos, k);
      this.yaw = g.daYaw + normalizzaAngolo(g.aYaw - g.daYaw) * k;
      this.pitch *= 1 - k;
      if (g.t >= 1) {
        const arrivo = g.shelfId;
        const dopo = g.dopo;
        this.glide = null;
        if (arrivo && arrivo !== this.corsiaAttuale) {
          this.corsiaAttuale = arrivo;
          this.cb.onArrivo(arrivo);
        } else if (!arrivo && !dopo) {
          // camminata libera: l'etichetta segue la corsia più vicina
          this.aggiornaCorsiaVicina();
        }
        dopo?.();
      }
    } else if (this.tasti.size > 0 || this.passoTouch !== 0) {
      // WASD / frecce / pulsanti touch: camminata libera
      const avanti = (this.tasti.has("KeyW") || this.tasti.has("ArrowUp") ? 1 : 0)
        - (this.tasti.has("KeyS") || this.tasti.has("ArrowDown") ? 1 : 0)
        + this.passoTouch;
      const destra = (this.tasti.has("KeyD") || this.tasti.has("ArrowRight") ? 1 : 0)
        - (this.tasti.has("KeyA") || this.tasti.has("ArrowLeft") ? 1 : 0);
      if (avanti !== 0 || destra !== 0) {
        const vel = 2.6 * dt;
        const sin = Math.sin(this.yaw);
        const cos = Math.cos(this.yaw);
        this.camera.position.x += (-sin * avanti + cos * destra) * vel;
        this.camera.position.z += (-cos * avanti - sin * destra) * vel;
        const lim = this.limitiArea();
        this.camera.position.x = THREE.MathUtils.clamp(this.camera.position.x, lim.xMin, lim.xMax);
        this.camera.position.z = THREE.MathUtils.clamp(this.camera.position.z, lim.zMin, lim.zMax);
        this.aggiornaCorsiaVicina();
      }
    }

    this.camera.rotation.set(this.pitch, this.yaw, 0);

    // la ruota degli indecisi gira piano, in attesa
    if (this.discoRoulette) this.discoRoulette.rotation.y += dt * 0.9;

    // carica le copertine delle corsie vicine, con parsimonia
    const ora = performance.now();
    if (ora - this.ultimaVerificaTexture > 600) {
      this.ultimaVerificaTexture = ora;
      for (const u of this.unita) {
        if (this.camera.position.distanceTo(u.waypoint.pos) < 7.5) this.assicuraTexture(u);
      }
    }

    this.renderer.render(this.scene, this.camera);
  };

  private aggiornaCorsiaVicina() {
    let vicina: Unita | null = null;
    let dMin = 2.6;
    for (const u of this.unita) {
      const d = this.camera.position.distanceTo(u.waypoint.pos);
      if (d < dMin) {
        dMin = d;
        vicina = u;
      }
    }
    const id = vicina?.shelf.id ?? null;
    if (id !== this.corsiaAttuale) {
      this.corsiaAttuale = id;
      this.cb.onArrivo(id);
    }
  }

  private ridimensiona = () => {
    const w = this.canvas.clientWidth || innerWidth;
    const h = this.canvas.clientHeight || innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  dispose() {
    this.disposto = true;
    cancelAnimationFrame(this.raf);
    removeEventListener("resize", this.ridimensiona);
    removeEventListener("keydown", this.suKeyDown);
    removeEventListener("keyup", this.suKeyUp);
    this.canvas.removeEventListener("pointerdown", this.suPointerDown);
    this.canvas.removeEventListener("pointermove", this.suPointerMove);
    this.canvas.removeEventListener("pointerup", this.suPointerUp);
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
      }
    });
    for (const t of this.texCopertine.values()) t.dispose();
    this.renderer.dispose();
  }
}
