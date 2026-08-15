import * as THREE from "three";
import { coverUrl } from "../api";
import type { Libro } from "../tipi";
import {
  impostaAnisotropia,
  mappaParete,
  mappePavimento,
  mappeLegno,
  texturaAlone,
} from "../biblioteca3d/materiali";
import { BASSA_POTENZA } from "../biblioteca3d/scena";

/**
 * L'Angolo di Lettura: una stanzetta calda con il camino acceso, la poltrona e
 * il libro aperto in grembo. Sulla pagina di sinistra la copertina, su quella
 * di destra la trama impaginata — il testo dei romanzi non ce l'abbiamo (e non
 * andrebbe comunque ridistribuito), quindi si "legge" la quarta di copertina.
 */

export interface CallbacksAngolo {
  /** Comunica alla UI quante pagine ci sono e quale si sta leggendo. */
  onPagine: (totale: number, corrente: number) => void;
}

const LARG = 4.6;
const PROF = 5.0;
const ALT = 2.9;
const Z_CAMINO = -PROF / 2 + 0.3;

const RIGHE_PER_PAGINA = 13;
const CARATTERI_PER_RIGA = 29;

/** Fiamma stilizzata: goccia luminosa che sfuma verso l'alto. */
function texturaFiamma(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 192;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 132, 4, 64, 120, 80);
  g.addColorStop(0, "rgba(255,250,214,0.95)");
  g.addColorStop(0.22, "rgba(255,196,80,0.8)");
  g.addColorStop(0.55, "rgba(240,110,30,0.4)");
  g.addColorStop(1, "rgba(140,40,0,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(64, 8);
  ctx.bezierCurveTo(124, 96, 116, 180, 64, 188);
  ctx.bezierCurveTo(12, 180, 4, 96, 64, 8);
  ctx.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Mattoni irregolari per il camino. */
function texturaMattoni(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#241a16";
  ctx.fillRect(0, 0, 256, 256);
  const h = 26;
  for (let y = 0, r = 0; y < 256; y += h, r++) {
    for (let x = (r % 2) * -32; x < 256; x += 64) {
      const v = 44 + Math.random() * 30;
      ctx.fillStyle = `rgb(${v + 30},${v - 2},${v - 12})`;
      ctx.fillRect(x + 3, y + 3, 58, h - 6);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 1.6);
  return t;
}

/** Pagina di carta antica, con testo già impaginato. */
function texturaPagina(
  righe: string[],
  intestazione: string | null,
  piede: string | null,
): THREE.CanvasTexture {
  const W = 620, H = 840;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;

  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#f5e9cd");
  g.addColorStop(1, "#e3d0a8");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 200; i++) {
    ctx.fillStyle = `rgba(120,90,50,${Math.random() * 0.045})`;
    ctx.beginPath();
    ctx.arc(Math.random() * W, Math.random() * H, 8 + Math.random() * 38, 0, 7);
    ctx.fill();
  }

  ctx.fillStyle = "#3b2a18";
  ctx.textAlign = "left";
  let y = 92;
  if (intestazione) {
    ctx.font = "italic 34px Georgia, serif";
    ctx.fillText(intestazione, 60, y, W - 120);
    y += 22;
    ctx.strokeStyle = "rgba(90,60,30,0.35)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(60, y);
    ctx.lineTo(W - 60, y);
    ctx.stroke();
    y += 48;
  }
  ctx.font = "31px Georgia, serif";
  for (const riga of righe) {
    ctx.fillText(riga, 60, y, W - 120);
    y += 45;
  }
  if (piede) {
    ctx.font = "italic 21px Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(70,50,28,0.7)";
    ctx.fillText(piede, W / 2, H - 44);
  }

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Spezza il testo in righe e poi in pagine. */
function impagina(testo: string): string[][] {
  const parole = testo.split(/\s+/).filter(Boolean);
  const righe: string[] = [];
  let riga = "";
  for (const p of parole) {
    if ((riga + " " + p).trim().length > CARATTERI_PER_RIGA) {
      if (riga.trim()) righe.push(riga.trim());
      riga = p;
    } else {
      riga += " " + p;
    }
  }
  if (riga.trim()) righe.push(riga.trim());

  const pagine: string[][] = [];
  for (let i = 0; i < righe.length; i += RIGHE_PER_PAGINA) {
    pagine.push(righe.slice(i, i + RIGHE_PER_PAGINA));
  }
  return pagine.length > 0 ? pagine : [[]];
}

export class ScenaAngolo {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private orologio = new THREE.Clock();
  private raf = 0;

  private fuoco!: THREE.PointLight;
  private fiamme: { sprite: THREE.Sprite; scala: number; fase: number }[] = [];
  private braci: THREE.Points | null = null;
  private velocitaBraci: Float32Array | null = null;
  private candela!: THREE.PointLight;
  private fiammaCandela!: THREE.Sprite;

  private gruppoLibro = new THREE.Group();
  private matPaginaSx!: THREE.MeshStandardMaterial;
  private matPaginaDx!: THREE.MeshStandardMaterial;
  private texturePagine: THREE.Texture[] = [];

  private pagine: string[][] = [[]];
  private indicePagina = 0;
  private libro: Libro | null = null;

  private risorse: { dispose: () => void }[] = [];
  private loader = new THREE.TextureLoader();

  constructor(
    private canvas: HTMLCanvasElement,
    libro: Libro,
    private cb: CallbacksAngolo,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !BASSA_POTENZA });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, BASSA_POTENZA ? 1.5 : 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.enabled = !BASSA_POTENZA;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    impostaAnisotropia(BASSA_POTENZA ? 4 : this.renderer.capabilities.getMaxAnisotropy());

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.05, 40);
    this.camera.rotation.order = "YXZ";
    this.camera.position.set(0, 1.24, 1.5);
    this.camera.rotation.x = -0.2;

    this.scene.background = new THREE.Color(0x110a06);
    this.scene.fog = new THREE.Fog(0x150c06, 5.5, 14);

    this.costruisciStanza();
    this.costruisciCamino();
    this.costruisciArredo();
    this.costruisciPagine();
    this.costruisciIlluminazione();
    this.impostaLibro(libro);

    this.ridimensiona();
    addEventListener("resize", this.ridimensiona);
    this.raf = requestAnimationFrame(this.tick);
  }

  private traccia<T extends { dispose: () => void }>(r: T): T {
    this.risorse.push(r);
    return r;
  }

  // ---- stanza ------------------------------------------------------------

  private costruisciStanza() {
    const pav = mappePavimento();
    this.risorse.push(pav.map, pav.normalMap, pav.roughnessMap);
    for (const m of [pav.map, pav.normalMap, pav.roughnessMap]) m.repeat.set(2.5, 2.5);
    const pavimento = new THREE.Mesh(
      this.traccia(new THREE.PlaneGeometry(LARG, PROF)),
      this.traccia(
        new THREE.MeshStandardMaterial({
          map: pav.map,
          normalMap: pav.normalMap,
          roughnessMap: pav.roughnessMap,
          roughness: 0.72,
        }),
      ),
    );
    pavimento.rotation.x = -Math.PI / 2;
    pavimento.receiveShadow = true;
    this.scene.add(pavimento);

    const par = mappaParete();
    this.risorse.push(par.map, par.normalMap, par.roughnessMap);
    const matParete = this.traccia(
      new THREE.MeshStandardMaterial({
        map: par.map,
        normalMap: par.normalMap,
        color: 0x7a5540,
        roughness: 0.96,
      }),
    );
    const mk = (w: number, h: number, pos: [number, number, number], ry: number) => {
      const m = new THREE.Mesh(this.traccia(new THREE.PlaneGeometry(w, h)), matParete);
      m.position.set(...pos);
      m.rotation.y = ry;
      m.receiveShadow = true;
      this.scene.add(m);
    };
    mk(LARG, ALT, [0, ALT / 2, -PROF / 2], 0);
    mk(PROF, ALT, [-LARG / 2, ALT / 2, 0], Math.PI / 2);
    mk(PROF, ALT, [LARG / 2, ALT / 2, 0], -Math.PI / 2);
    mk(LARG, ALT, [0, ALT / 2, PROF / 2], Math.PI);

    const soffitto = new THREE.Mesh(
      this.traccia(new THREE.PlaneGeometry(LARG, PROF)),
      this.traccia(new THREE.MeshStandardMaterial({ color: 0x2b1b12, roughness: 1 })),
    );
    soffitto.rotation.x = Math.PI / 2;
    soffitto.position.y = ALT;
    this.scene.add(soffitto);

    const legno = mappeLegno(5, [74, 46, 28]);
    this.risorse.push(legno.map, legno.normalMap, legno.roughnessMap);
    const matTrave = this.traccia(
      new THREE.MeshStandardMaterial({
        map: legno.map,
        normalMap: legno.normalMap,
        roughnessMap: legno.roughnessMap,
        roughness: 0.82,
      }),
    );
    const geoTrave = this.traccia(new THREE.BoxGeometry(LARG, 0.17, 0.17));
    for (let i = -1; i <= 1; i++) {
      const t = new THREE.Mesh(geoTrave, matTrave);
      t.position.set(0, ALT - 0.1, i * 1.5);
      t.castShadow = true;
      this.scene.add(t);
    }

    const tappeto = new THREE.Mesh(
      this.traccia(new THREE.CircleGeometry(1.4, 44)),
      this.traccia(new THREE.MeshStandardMaterial({ color: 0x5e2437, roughness: 0.96 })),
    );
    tappeto.rotation.x = -Math.PI / 2;
    tappeto.position.set(0, 0.006, -0.3);
    tappeto.receiveShadow = true;
    this.scene.add(tappeto);
  }

  // ---- camino ------------------------------------------------------------

  private costruisciCamino() {
    const mattoni = this.traccia(texturaMattoni());
    const matMuro = this.traccia(new THREE.MeshStandardMaterial({ map: mattoni, roughness: 0.96 }));

    // spalle e architrave, così il focolare resta un vano vuoto
    const geoSpalla = this.traccia(new THREE.BoxGeometry(0.62, 1.15, 0.56));
    for (const s of [-1, 1]) {
      const m = new THREE.Mesh(geoSpalla, matMuro);
      m.position.set(s * 0.94, 0.575, Z_CAMINO);
      m.castShadow = true;
      m.receiveShadow = true;
      this.scene.add(m);
    }
    const architrave = new THREE.Mesh(
      this.traccia(new THREE.BoxGeometry(2.5, 1.75, 0.56)),
      matMuro,
    );
    architrave.position.set(0, 2.025, Z_CAMINO);
    architrave.castShadow = true;
    architrave.receiveShadow = true;
    this.scene.add(architrave);

    // fondo del focolare, annerito
    const fondo = new THREE.Mesh(
      this.traccia(new THREE.PlaneGeometry(1.3, 1.15)),
      this.traccia(new THREE.MeshStandardMaterial({ color: 0x0c0705, roughness: 1 })),
    );
    fondo.position.set(0, 0.575, Z_CAMINO - 0.27);
    this.scene.add(fondo);

    // mensola
    const legno = mappeLegno(7, [70, 42, 24]);
    this.risorse.push(legno.map, legno.normalMap, legno.roughnessMap);
    const mensola = new THREE.Mesh(
      this.traccia(new THREE.BoxGeometry(2.8, 0.14, 0.42)),
      this.traccia(
        new THREE.MeshStandardMaterial({
          map: legno.map,
          normalMap: legno.normalMap,
          roughnessMap: legno.roughnessMap,
          roughness: 0.62,
        }),
      ),
    );
    mensola.position.set(0, 1.22, Z_CAMINO + 0.12);
    mensola.castShadow = true;
    mensola.receiveShadow = true;
    this.scene.add(mensola);

    // ceppi incrociati, con brace che filtra
    const geoCeppo = this.traccia(new THREE.CylinderGeometry(0.07, 0.085, 0.9, 10));
    const matCeppo = this.traccia(
      new THREE.MeshStandardMaterial({
        color: 0x2e1c0f,
        roughness: 0.92,
        emissive: 0x3a1202,
        emissiveIntensity: 0.6,
      }),
    );
    const ceppi: [number, number, number][] = [
      [0, 0.09, 0.35],
      [0, 0.09, -0.35],
      [0.18, 0.2, 0],
    ];
    for (const [x, y, rot] of ceppi) {
      const c = new THREE.Mesh(geoCeppo, matCeppo);
      c.rotation.z = Math.PI / 2;
      c.rotation.y = rot;
      c.position.set(x, y, Z_CAMINO - 0.08);
      c.castShadow = true;
      this.scene.add(c);
    }

    // fiamme: sprite additivi animati
    const texFiamma = this.traccia(texturaFiamma());
    const disposizione: [number, number, number][] = [
      [0, 0.5, 1.5],
      [-0.32, 0.42, 1.1],
      [0.32, 0.43, 1.15],
      [-0.15, 0.6, 0.95],
      [0.17, 0.62, 0.9],
    ];
    disposizione.forEach(([x, y, s], i) => {
      const sprite = new THREE.Sprite(
        this.traccia(
          new THREE.SpriteMaterial({
            map: texFiamma,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            opacity: 0.9,
          }),
        ),
      );
      sprite.position.set(x, y, Z_CAMINO - 0.06);
      sprite.scale.set(0.34 * s, 0.52 * s, 1);
      this.scene.add(sprite);
      this.fiamme.push({ sprite, scala: s, fase: i * 1.3 });
    });

    // braci che salgono
    const N = BASSA_POTENZA ? 26 : 60;
    const pos = new Float32Array(N * 3);
    const vel = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 0.9;
      pos[i * 3 + 1] = 0.15 + Math.random() * 0.9;
      pos[i * 3 + 2] = Z_CAMINO - 0.1 + (Math.random() - 0.5) * 0.2;
      vel[i] = 0.12 + Math.random() * 0.3;
    }
    const geo = this.traccia(new THREE.BufferGeometry());
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.velocitaBraci = vel;
    this.braci = new THREE.Points(
      geo,
      this.traccia(
        new THREE.PointsMaterial({
          map: this.traccia(texturaAlone("#ffb066", 0.2)),
          color: 0xffb066,
          size: 0.03,
          transparent: true,
          opacity: 0.85,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      ),
    );
    this.scene.add(this.braci);
  }

  // ---- arredo ------------------------------------------------------------

  private costruisciArredo() {
    const matStoffa = this.traccia(
      new THREE.MeshStandardMaterial({ color: 0x4a2438, roughness: 0.95 }),
    );
    const legno = mappeLegno(11, [60, 36, 20]);
    this.risorse.push(legno.map, legno.normalMap, legno.roughnessMap);
    const matLegno = this.traccia(
      new THREE.MeshStandardMaterial({
        map: legno.map,
        normalMap: legno.normalMap,
        roughnessMap: legno.roughnessMap,
        roughness: 0.7,
      }),
    );

    // poltrona: si intravedono i braccioli ai lati di chi legge
    const bracciolo = this.traccia(new THREE.BoxGeometry(0.24, 0.26, 0.95));
    for (const s of [-1, 1]) {
      const b = new THREE.Mesh(bracciolo, matStoffa);
      b.position.set(s * 0.56, 0.66, 1.5);
      b.castShadow = true;
      b.receiveShadow = true;
      this.scene.add(b);
    }
    const seduta = new THREE.Mesh(this.traccia(new THREE.BoxGeometry(1.36, 0.22, 0.95)), matStoffa);
    seduta.position.set(0, 0.5, 1.5);
    seduta.receiveShadow = true;
    this.scene.add(seduta);
    const schienale = new THREE.Mesh(this.traccia(new THREE.BoxGeometry(1.36, 0.95, 0.22)), matStoffa);
    schienale.position.set(0, 0.95, 1.97);
    schienale.castShadow = true;
    this.scene.add(schienale);

    // tavolino con candela e tazza
    const piano = new THREE.Mesh(this.traccia(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 24)), matLegno);
    piano.position.set(-1.15, 0.62, 0.9);
    piano.castShadow = true;
    piano.receiveShadow = true;
    this.scene.add(piano);
    const gamba = new THREE.Mesh(this.traccia(new THREE.CylinderGeometry(0.05, 0.07, 0.6, 12)), matLegno);
    gamba.position.set(-1.15, 0.3, 0.9);
    this.scene.add(gamba);

    const cera = new THREE.Mesh(
      this.traccia(new THREE.CylinderGeometry(0.035, 0.04, 0.17, 14)),
      this.traccia(new THREE.MeshStandardMaterial({ color: 0xf0e2c0, roughness: 0.7 })),
    );
    cera.position.set(-1.15, 0.73, 0.9);
    cera.castShadow = true;
    this.scene.add(cera);

    this.fiammaCandela = new THREE.Sprite(
      this.traccia(
        new THREE.SpriteMaterial({
          map: this.traccia(texturaAlone("#ffd9a0", 0.25)),
          color: 0xffd9a0,
          transparent: true,
          opacity: 0.95,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      ),
    );
    this.fiammaCandela.scale.set(0.07, 0.11, 1);
    this.fiammaCandela.position.set(-1.15, 0.85, 0.9);
    this.scene.add(this.fiammaCandela);

    const tazza = new THREE.Mesh(
      this.traccia(new THREE.CylinderGeometry(0.055, 0.045, 0.09, 16)),
      this.traccia(new THREE.MeshStandardMaterial({ color: 0xd8cfc0, roughness: 0.45 })),
    );
    tazza.position.set(-1.02, 0.69, 1.02);
    tazza.castShadow = true;
    this.scene.add(tazza);

    // una piccola libreria sulla parete di destra, per non lasciarla nuda
    const geoRip = this.traccia(new THREE.BoxGeometry(0.9, 0.04, 0.26));
    for (let i = 0; i < 3; i++) {
      const r = new THREE.Mesh(geoRip, matLegno);
      r.position.set(LARG / 2 - 0.15, 0.85 + i * 0.42, -0.6);
      r.rotation.y = -Math.PI / 2;
      r.castShadow = true;
      r.receiveShadow = true;
      this.scene.add(r);
      // dorsi di libri appena accennati
      for (let k = 0; k < 7; k++) {
        const d = new THREE.Mesh(
          this.traccia(new THREE.BoxGeometry(0.035 + Math.random() * 0.02, 0.19 + Math.random() * 0.07, 0.16)),
          this.traccia(
            new THREE.MeshStandardMaterial({
              color: new THREE.Color().setHSL(0.02 + Math.random() * 0.12, 0.4, 0.18 + Math.random() * 0.12),
              roughness: 0.85,
            }),
          ),
        );
        d.position.set(LARG / 2 - 0.15, 0.87 + i * 0.42 + 0.1, -0.95 + k * 0.06);
        d.rotation.y = -Math.PI / 2;
        this.scene.add(d);
      }
    }
  }

  // ---- libro aperto ------------------------------------------------------

  private costruisciPagine() {
    // Misure pensate per l'inquadratura: il libro dev'essere tutto dentro il
    // fotogramma, pagine comprese, senza coprire il camino.
    const geoPagina = this.traccia(new THREE.PlaneGeometry(0.25, 0.34));
    this.matPaginaSx = this.traccia(
      new THREE.MeshStandardMaterial({ color: 0xf0e3c6, roughness: 0.85 }),
    );
    this.matPaginaDx = this.traccia(
      new THREE.MeshStandardMaterial({ color: 0xf0e3c6, roughness: 0.85 }),
    );

    const sx = new THREE.Mesh(geoPagina, this.matPaginaSx);
    sx.position.set(-0.1265, 0, 0.004);
    sx.rotation.y = 0.06;
    const dx = new THREE.Mesh(geoPagina, this.matPaginaDx);
    dx.position.set(0.1265, 0, 0.004);
    dx.rotation.y = -0.06;

    // Copertina rigida più stretta delle pagine e arretrata: così fra le due
    // facciate resta solo una piega d'ombra, non una fascia che mangia la
    // copertina.
    const matCop = this.traccia(
      new THREE.MeshStandardMaterial({ color: 0x2a1420, roughness: 0.6 }),
    );
    const cop = new THREE.Mesh(this.traccia(new THREE.BoxGeometry(0.495, 0.355, 0.014)), matCop);
    cop.position.set(0, 0, -0.03);

    this.gruppoLibro.add(cop, sx, dx);
    // in grembo, inclinato verso chi legge
    this.gruppoLibro.position.set(0, 0.88, 0.86);
    this.gruppoLibro.rotation.x = -1.06;
    this.gruppoLibro.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    this.scene.add(this.gruppoLibro);
  }

  /** Carica il libro: copertina a sinistra, trama impaginata a destra. */
  impostaLibro(libro: Libro) {
    this.libro = libro;
    const trama = libro.descrizione?.trim()
      ? libro.descrizione.trim()
      : "Di questo libro non conosciamo ancora la storia. Aprilo davvero: è lì che comincia.";
    this.pagine = impagina(trama);
    this.indicePagina = 0;

    // pagina sinistra: la copertina vera
    this.loader.load(
      coverUrl(libro),
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        this.risorse.push(tex);
        this.matPaginaSx.map = tex;
        this.matPaginaSx.color.set(0xffffff);
        this.matPaginaSx.needsUpdate = true;
      },
      undefined,
      () => {
        /* resta la carta chiara */
      },
    );

    this.aggiornaPagina();
  }

  private aggiornaPagina() {
    if (!this.libro) return;
    const tot = this.pagine.length;
    const i = Math.max(0, Math.min(tot - 1, this.indicePagina));
    const intestazione = i === 0 ? this.libro.titoloBreve : null;
    const piede = tot > 1 ? `${i + 1} / ${tot}` : null;
    const tex = texturaPagina(this.pagine[i] ?? [], intestazione, piede);
    this.texturePagine.push(tex);
    this.risorse.push(tex);
    const vecchia = this.matPaginaDx.map;
    this.matPaginaDx.map = tex;
    this.matPaginaDx.color.set(0xffffff);
    this.matPaginaDx.needsUpdate = true;
    if (vecchia && vecchia !== tex) vecchia.dispose();
    this.cb.onPagine(tot, i);
  }

  giraPagina(delta: number) {
    const nuovo = this.indicePagina + delta;
    if (nuovo < 0 || nuovo >= this.pagine.length) return;
    this.indicePagina = nuovo;
    this.aggiornaPagina();
  }

  // ---- luci --------------------------------------------------------------

  private costruisciIlluminazione() {
    this.scene.add(new THREE.AmbientLight(0x6a4526, 0.9));
    this.scene.add(new THREE.HemisphereLight(0x8a6238, 0x241408, 0.7));

    // il camino è la luce principale della stanza
    this.fuoco = new THREE.PointLight(0xff8b3c, 14, 14, 2);
    this.fuoco.position.set(0, 0.6, Z_CAMINO + 0.14);
    this.fuoco.castShadow = !BASSA_POTENZA;
    if (this.fuoco.shadow) {
      this.fuoco.shadow.mapSize.set(BASSA_POTENZA ? 512 : 1024, BASSA_POTENZA ? 512 : 1024);
      this.fuoco.shadow.bias = -0.004;
      this.fuoco.shadow.camera.far = 12;
    }
    this.scene.add(this.fuoco);

    // rimbalzo caldo sul lettore, perché la pagina resti leggibile
    const rimbalzo = new THREE.PointLight(0xffc590, 3.2, 4, 2);
    rimbalzo.position.set(0, 1.55, 1.05);
    this.scene.add(rimbalzo);

    this.candela = new THREE.PointLight(0xffc27a, 1.1, 2.6, 2);
    this.candela.position.set(-1.15, 0.87, 0.9);
    this.scene.add(this.candela);
  }

  // ---- loop --------------------------------------------------------------

  private tick = () => {
    this.raf = requestAnimationFrame(this.tick);
    const dt = Math.min(this.orologio.getDelta(), 0.05);
    const t = this.orologio.elapsedTime;

    // fuoco: tremolio irregolare, mai regolare come un'onda pura
    const guizzo =
      Math.sin(t * 8.3) * 0.16 + Math.sin(t * 17.7) * 0.09 + Math.sin(t * 31.3) * 0.05;
    this.fuoco.intensity = 14 * (0.86 + guizzo);
    for (const f of this.fiamme) {
      const s = f.scala * (0.9 + Math.sin(t * 9 + f.fase) * 0.1 + Math.sin(t * 21 + f.fase) * 0.05);
      f.sprite.scale.set(0.34 * s, 0.52 * s * (1 + Math.sin(t * 12 + f.fase) * 0.08), 1);
      (f.sprite.material as THREE.SpriteMaterial).opacity = 0.75 + Math.sin(t * 14 + f.fase) * 0.2;
    }

    if (this.braci && this.velocitaBraci) {
      const attr = this.braci.geometry.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < attr.count; i++) {
        let y = attr.getY(i) + this.velocitaBraci[i]! * dt;
        let x = attr.getX(i) + Math.sin(t * 2 + i) * 0.0016;
        if (y > 1.5) {
          y = 0.16;
          x = (Math.random() - 0.5) * 0.9;
        }
        attr.setY(i, y);
        attr.setX(i, x);
      }
      attr.needsUpdate = true;
    }

    const sfarfallio = 0.9 + Math.sin(t * 11) * 0.08 + Math.sin(t * 23) * 0.04;
    this.candela.intensity = 1.1 * sfarfallio;
    this.fiammaCandela.scale.set(0.07, 0.11 * sfarfallio, 1);

    // il libro respira appena, come se lo si tenesse in mano
    this.gruppoLibro.rotation.z = Math.sin(t * 0.7) * 0.012;
    this.gruppoLibro.position.y = 0.92 + Math.sin(t * 0.9) * 0.004;

    this.renderer.render(this.scene, this.camera);
  };

  private ridimensiona = () => {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, BASSA_POTENZA ? 1.5 : 2));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    removeEventListener("resize", this.ridimensiona);
    for (const r of this.risorse) {
      try {
        r.dispose();
      } catch {
        /* già liberata */
      }
    }
    this.risorse.length = 0;
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else if (mat) (mat as THREE.Material).dispose();
    });
    this.scene.clear();
    this.renderer.dispose();
  }
}
