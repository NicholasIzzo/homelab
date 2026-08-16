import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import { coverUrl } from "../api";
import { temaDi } from "../temi";
import type { Libro } from "../tipi";
import {
  MODULO,
  adattaLibro,
  disponiLibri,
  hash01,
  verificaPosti,
  type Posto,
  type RipianoGeom,
} from "./layout";
import {
  coloreMedio,
  copertinaSegnaposto,
  impostaAnisotropia,
  mappaParete,
  mappePavimento,
  mappeLegno,
  texturaAlone,
  texturaInsegna,
  texturaOmbraContatto,
  texturaRune,
} from "./materiali";
import {
  atmosferaDi,
  essenzaDi,
  luceDi,
  PREFERENZE_INIZIALI,
  type Preferenze,
} from "../personalizza";

export interface SezioneScena {
  id: string;
  nome: string;
  libri: Libro[];
}

export interface CallbacksScena {
  onPickLibro: (libro: Libro) => void;
  onArrivo: (sezioneId: string | null) => void;
  onRuota: () => void;
  onRuotaDesideri: () => void;
  onDesideri: () => void;
}

/** Su GPU deboli e telefoni si abbassa la resa, non la correttezza. */
export const BASSA_POTENZA = (() => {
  if (typeof navigator === "undefined") return false;
  const mem = (navigator as { deviceMemory?: number }).deviceMemory ?? 4;
  const tocco = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;
  return mem <= 4 || tocco;
})();

const OCCHI = 1.6;
const CORRIDOIO = 3.9; // larghezza libera fra i due lati
// Aria fra un mobile e l'altro: accostati sembravano una parete unica.
const PASSO_MODULO = MODULO.larghezza + 0.2;
const GAP_SEZIONE = 0.7;
const ALTEZZA_STANZA = 3.5;
const RAGGIO_CAMERA = 0.42; // per non entrare dentro i mobili

interface PianoModulo {
  sezione: SezioneScena;
  indiceModulo: number;
  lato: -1 | 1;
  z: number;
}

interface LuceRipiano {
  x: number;
  y: number;
  z: number;
  yaw: number;
  larghezza: number;
}

/** Yaw da dare a una camera perché guardi il punto p (le camere guardano -Z). */
function yawVerso(cx: number, cz: number, px: number, pz: number): number {
  return Math.atan2(-(px - cx), -(pz - cz));
}

/**
 * Yaw da dare a un oggetto perché la sua faccia (+Z locale) sia rivolta verso
 * p. È l'opposto del caso camera: confonderli gira i cartelli contro il muro.
 */
function facciaVerso(cx: number, cz: number, px: number, pz: number): number {
  return Math.atan2(px - cx, pz - cz);
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
  private pmrem: THREE.PMREMGenerator | null = null;

  private pos = new THREE.Vector3();
  private posBersaglio = new THREE.Vector3();
  private yaw = 0;
  private yawBersaglio = 0;
  private pitch = -0.04;
  private ruotaVerso = false;
  private passo = 0;
  private tasti = new Set<string>();

  private zMin = 0;
  private zMax = 0;

  private interattivi: THREE.Object3D[] = [];
  private pavimento!: THREE.Mesh;
  private waypoints: Waypoint[] = [];
  private sezioneAttuale: string | null = null;

  private orb!: THREE.Mesh;
  private orbLuce!: THREE.PointLight;
  private candele: { luce: THREE.PointLight; base: number; fase: number }[] = [];
  private polvere: THREE.Points | null = null;

  private luciRipiano: LuceRipiano[] = [];
  private pool: THREE.RectAreaLight[] = [];
  private prossimoRicalcolo = 0;
  private haDesideri = false;
  private sferaDesideri: THREE.Mesh | null = null;
  private rune: THREE.Mesh[] = [];

  private loader = new THREE.TextureLoader();
  private risorse: { dispose: () => void }[] = [];
  private libriMesh: { posto: Posto; corpo: THREE.Mesh; cop: THREE.Mesh }[] = [];
  private nModuli = 0;

  // trascinamento vs clic
  private giu = false;
  private trascinato = false;
  private ultimoX = 0;
  private ultimoY = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    sezioni: SezioneScena[],
    private cb: CallbacksScena,
    private pref: Preferenze = PREFERENZE_INIZIALI,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !BASSA_POTENZA,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, BASSA_POTENZA ? 1.5 : 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    // Le ombre proiettate costano una passata di rendering in più: sui telefoni
    // si rinuncia, tanto i libri restano ancorati dalle ombre di contatto.
    this.renderer.shadowMap.enabled = !BASSA_POTENZA;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    impostaAnisotropia(BASSA_POTENZA ? 4 : this.renderer.capabilities.getMaxAnisotropy());
    RectAreaLightUniformsLib.init();

    // Campo visivo stretto: col grandangolo le copertine ai bordi si inclinano
    // e sembrano storte, pur essendo perfettamente dritte. Si vede un filo di
    // meno, ma i libri si leggono come in una libreria vera.
    this.camera = new THREE.PerspectiveCamera(48, 1, 0.08, 70);
    this.camera.rotation.order = "YXZ";

    const atm = atmosferaDi(this.pref.atmosfera);
    this.scene.background = new THREE.Color(atm.fondo);
    this.scene.fog = new THREE.Fog(atm.fondo, 10, 34);

    const piani = this.pianifica(sezioni);
    this.costruisciAmbiente();
    this.costruisciModuli(piani);
    this.costruisciDais();
    this.costruisciLeggioDesideri();
    this.costruisciLuci();
    this.costruisciDecori(piani);

    this.pos.set(0, 0, this.zMax - 0.6);
    this.posBersaglio.copy(this.pos);

    this.ridimensiona();
    addEventListener("resize", this.ridimensiona);
    canvas.addEventListener("pointerdown", this.onDown);
    canvas.addEventListener("pointermove", this.onMove);
    canvas.addEventListener("pointerup", this.onUp);
    canvas.addEventListener("pointercancel", this.onUp);
    addEventListener("keydown", this.onKeyDown);
    addEventListener("keyup", this.onKeyUp);

    this.raf = requestAnimationFrame(this.tick);
  }

  // ---- pianificazione ----------------------------------------------------

  /** Decide quanti moduli servono a ogni sezione e dove piazzarli. */
  private pianifica(sezioni: SezioneScena[]): PianoModulo[] {
    const piani: PianoModulo[] = [];
    const cursore: Record<-1 | 1, number> = { [-1]: -0.4, [1]: -0.4 };

    sezioni.forEach((sez) => {
      const { moduli } = disponiLibri(sez.libri);
      // Sul lato più corto: alternare a turno sbilancerebbe la sala, perché una
      // sezione può valere un modulo e un'altra otto (la wishlist).
      const lato: -1 | 1 = cursore[-1] >= cursore[1] ? -1 : 1;
      const zPartenza = cursore[lato];
      for (let m = 0; m < moduli; m++) {
        piani.push({ sezione: sez, indiceModulo: m, lato, z: zPartenza - m * PASSO_MODULO });
      }
      this.nModuli += moduli;

      // Waypoint davanti al centro della sezione, un po' arretrato: da lontano
      // le copertine si vedono più frontali e meno deformate.
      const zCentro = zPartenza - ((moduli - 1) * PASSO_MODULO) / 2;
      const xSosta = lato * (CORRIDOIO / 2 - 1.35);
      const xMobile = lato * (CORRIDOIO / 2);
      this.waypoints.push({
        id: sez.id,
        x: xSosta,
        z: zCentro,
        yaw: yawVerso(xSosta, zCentro, xMobile, zCentro),
      });

      if (sez.id === "desideri") this.haDesideri = true;

      cursore[lato] = zPartenza - moduli * PASSO_MODULO - GAP_SEZIONE;
    });

    this.zMin = Math.min(cursore[-1], cursore[1]) - 1.6;
    this.zMax = 1.9;
    return piani;
  }

  // ---- ambiente ----------------------------------------------------------

  private traccia<T extends { dispose: () => void }>(r: T): T {
    this.risorse.push(r);
    return r;
  }

  private costruisciAmbiente() {
    const atm = atmosferaDi(this.pref.atmosfera);
    // Illuminazione d'ambiente fisica: dà riflessi credibili al legno senza
    // schiarire la scena come uno showroom.
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    const env = this.pmrem.fromScene(new RoomEnvironment(), 0.04);
    this.scene.environment = env.texture;
    this.scene.environmentIntensity = 0.22;
    this.risorse.push(env.texture);

    const lung = this.zMax - this.zMin;
    const zC = (this.zMax + this.zMin) / 2;
    const largh = CORRIDOIO + MODULO.profondita * 2 + 0.4;

    const pav = mappePavimento();
    this.risorse.push(pav.map, pav.normalMap, pav.roughnessMap);
    const pavimento = new THREE.Mesh(
      this.traccia(new THREE.PlaneGeometry(largh, lung)),
      this.traccia(
        new THREE.MeshStandardMaterial({
          map: pav.map,
          normalMap: pav.normalMap,
          roughnessMap: pav.roughnessMap,
          roughness: 0.78,
          metalness: 0.02,
          envMapIntensity: 0.35,
        }),
      ),
    );
    pavimento.rotation.x = -Math.PI / 2;
    pavimento.position.set(0, 0, zC);
    pavimento.receiveShadow = true;
    this.scene.add(pavimento);
    this.pavimento = pavimento;

    const par = mappaParete();
    this.risorse.push(par.map, par.normalMap, par.roughnessMap);
    const matParete = this.traccia(
      new THREE.MeshStandardMaterial({
        map: par.map,
        normalMap: par.normalMap,
        roughnessMap: par.roughnessMap,
        color: atm.pareti,
        roughness: 0.95,
        envMapIntensity: 0.15,
      }),
    );
    const geoParete = this.traccia(new THREE.PlaneGeometry(lung, ALTEZZA_STANZA));
    for (const lato of [-1, 1] as const) {
      const m = new THREE.Mesh(geoParete, matParete);
      m.position.set(lato * (largh / 2), ALTEZZA_STANZA / 2, zC);
      m.rotation.y = lato < 0 ? Math.PI / 2 : -Math.PI / 2;
      m.receiveShadow = true;
      this.scene.add(m);
    }
    const geoTesta = this.traccia(new THREE.PlaneGeometry(largh, ALTEZZA_STANZA));
    const fondo = new THREE.Mesh(geoTesta, matParete);
    fondo.position.set(0, ALTEZZA_STANZA / 2, this.zMin);
    fondo.receiveShadow = true;
    this.scene.add(fondo);
    const ingresso = new THREE.Mesh(geoTesta, matParete);
    ingresso.position.set(0, ALTEZZA_STANZA / 2, this.zMax + 0.4);
    ingresso.rotation.y = Math.PI;
    this.scene.add(ingresso);

    const soffitto = new THREE.Mesh(
      this.traccia(new THREE.PlaneGeometry(largh, lung)),
      this.traccia(new THREE.MeshStandardMaterial({ color: 0x140e22, roughness: 1 })),
    );
    soffitto.rotation.x = Math.PI / 2;
    soffitto.position.set(0, ALTEZZA_STANZA, zC);
    this.scene.add(soffitto);

    // tappeto centrale, spezza il parquet e scalda la corsia
    const tappeto = new THREE.Mesh(
      this.traccia(new THREE.PlaneGeometry(1.9, lung - 1.2)),
      this.traccia(
        new THREE.MeshStandardMaterial({ color: atm.tappeto, roughness: 0.95, envMapIntensity: 0.1 }),
      ),
    );
    tappeto.rotation.x = -Math.PI / 2;
    tappeto.position.set(0, 0.004, zC);
    tappeto.receiveShadow = true;
    this.scene.add(tappeto);
  }

  // ---- mobili e libri ----------------------------------------------------

  private costruisciModuli(piani: PianoModulo[]) {
    const ess = essenzaDi(this.pref.essenza);
    const legno = mappeLegno(ess.seme, ess.rgb);
    this.risorse.push(legno.map, legno.normalMap, legno.roughnessMap);
    const matLegno = this.traccia(
      new THREE.MeshStandardMaterial({
        map: legno.map,
        normalMap: legno.normalMap,
        roughnessMap: legno.roughnessMap,
        roughness: 0.75,
        metalness: 0.04,
        envMapIntensity: 0.3,
      }),
    );
    const matFondo = this.traccia(
      new THREE.MeshStandardMaterial({ color: 0x1d1209, roughness: 0.95, envMapIntensity: 0.12 }),
    );

    const geoBox = this.traccia(new THREE.BoxGeometry(1, 1, 1));
    const geoPiano = this.traccia(new THREE.PlaneGeometry(1, 1));
    const texOmbra = this.traccia(texturaOmbraContatto());
    const matOmbra = this.traccia(
      new THREE.MeshBasicMaterial({
        map: texOmbra,
        transparent: true,
        depthWrite: false,
        opacity: 0.85,
      }),
    );

    // una sola volta per sezione: layout dei libri e insegna
    const layoutPerSezione = new Map<string, ReturnType<typeof disponiLibri>>();
    const insegnaFatta = new Set<string>();

    for (const piano of piani) {
      const { sezione, indiceModulo, lato, z } = piano;
      let layout = layoutPerSezione.get(sezione.id);
      if (!layout) {
        layout = disponiLibri(sezione.libri);
        for (const p of layout.posti) p.gruppo = sezione.id;
        layoutPerSezione.set(sezione.id, layout);
      }

      const g = new THREE.Group();
      g.position.set(lato * (CORRIDOIO / 2 + MODULO.profondita / 2), 0, z);
      g.rotation.y = lato < 0 ? Math.PI / 2 : -Math.PI / 2;
      this.scene.add(g);

      this.costruisciCarcassa(g, matLegno, matFondo, geoBox, layout.ripiani);

      const tema = temaDi(sezione.id);
      const luce = new THREE.Color(tema.luce);

      // libri di questo modulo
      const dellaSezione = layout.posti.filter((p) => p.modulo === indiceModulo);
      for (const posto of dellaSezione) {
        const libro = sezione.libri.find((l) => l.id === posto.id);
        if (libro) this.costruisciLibro(g, posto, libro, geoBox, geoPiano, matOmbra);
      }

      // striscia LED sotto ogni ripiano superiore + candidati luce
      for (const r of layout.ripiani) {
        this.costruisciStriscia(g, r, luce);
        const cima = r.superficie + r.altezzaUtile;
        const locale = new THREE.Vector3(0, cima - 0.03, r.zFronte - 0.055);
        const mondo = locale.clone().applyMatrix4(g.matrixWorld);
        this.luciRipiano.push({
          x: mondo.x,
          y: mondo.y,
          z: mondo.z,
          yaw: g.rotation.y,
          larghezza: (r.xMax - r.xMin) * 0.95,
        });
      }

      // insegna: una per sezione, sopra il primo modulo
      if (!insegnaFatta.has(sezione.id)) {
        insegnaFatta.add(sezione.id);
        this.costruisciInsegna(g, sezione, tema.luce);
      }
    }
  }

  /** Fianchi, cappello, zoccolo, fondo e ripiani di un modulo. */
  private costruisciCarcassa(
    g: THREE.Group,
    matLegno: THREE.Material,
    matFondo: THREE.Material,
    geoBox: THREE.BoxGeometry,
    ripiani: RipianoGeom[],
  ) {
    const d = MODULO;
    const aggiungi = (
      sx: number, sy: number, sz: number,
      px: number, py: number, pz: number,
      mat: THREE.Material = matLegno,
    ) => {
      const m = new THREE.Mesh(geoBox, mat);
      m.scale.set(sx, sy, sz);
      m.position.set(px, py, pz);
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
      return m;
    };

    const mezzaL = d.larghezza / 2;
    // fianchi
    for (const s of [-1, 1]) {
      aggiungi(d.spessoreFianco, d.altezza, d.profondita,
        s * (mezzaL - d.spessoreFianco / 2), d.altezza / 2, 0);
    }
    // cappello e zoccolo
    aggiungi(d.larghezza, d.spessoreFianco, d.profondita, 0, d.altezza - d.spessoreFianco / 2, 0);
    aggiungi(d.larghezza, d.zoccolo, d.profondita * 0.94, 0, d.zoccolo / 2, 0);
    // fondo (schiena)
    aggiungi(d.larghezza - d.spessoreFianco * 2, d.altezza - d.zoccolo, 0.012,
      0, (d.altezza + d.zoccolo) / 2, -d.profondita / 2 + d.spessoreFianco, matFondo);
    // ripiani
    for (const r of ripiani) {
      aggiungi(d.larghezza - d.spessoreFianco * 2, d.spessoreRipiano, d.profondita - 0.02,
        0, r.superficie - d.spessoreRipiano / 2, 0);
    }
  }

  /** Un libro: corpo tinto come la copertina, copertina, ombra di contatto. */
  private costruisciLibro(
    g: THREE.Group,
    posto: Posto,
    libro: Libro,
    geoBox: THREE.BoxGeometry,
    geoPiano: THREE.PlaneGeometry,
    matOmbra: THREE.Material,
  ) {
    const segnaposto = copertinaSegnaposto(Math.floor(hash01(libro.id) * 6));

    const matCorpo = this.traccia(
      new THREE.MeshStandardMaterial({ color: 0x2a1d28, roughness: 0.72, envMapIntensity: 0.25 }),
    );
    const corpo = new THREE.Mesh(geoBox, matCorpo);
    corpo.scale.set(posto.larghezza, posto.altezza, posto.spessore);
    corpo.position.set(posto.x, posto.yBase + posto.altezza / 2, posto.z);
    corpo.userData = { libro };
    corpo.castShadow = false;
    corpo.receiveShadow = true;
    g.add(corpo);

    const matCop = this.traccia(
      new THREE.MeshStandardMaterial({
        map: segnaposto,
        roughness: 0.52,
        metalness: 0.0,
        envMapIntensity: 0.4,
      }),
    );
    const cop = new THREE.Mesh(geoPiano, matCop);
    cop.scale.set(posto.larghezza * 0.98, posto.altezza * 0.98, 1);
    cop.position.set(posto.x, posto.yBase + posto.altezza / 2, posto.z + posto.spessore / 2 + 0.0012);
    cop.userData = { libro };
    cop.receiveShadow = true;
    g.add(cop);

    const ombra = new THREE.Mesh(geoPiano, matOmbra);
    ombra.rotation.x = -Math.PI / 2;
    ombra.scale.set(posto.larghezza * 1.5, posto.spessore * 3.4, 1);
    ombra.position.set(posto.x, posto.yBase + 0.0018, posto.z);
    g.add(ombra);

    this.interattivi.push(corpo, cop);
    this.libriMesh.push({ posto, corpo, cop });

    // Copertina reale: stesso-origine, quindi utilizzabile come texture.
    this.loader.load(
      coverUrl(libro),
      (piena) => {
        // Sullo scaffale un libro occupa poche decine di pixel: tenere le
        // copertine a piena risoluzione, per centinaia di volumi, riempirebbe
        // la memoria video (soprattutto sul telefono). Si rimpiccioliscono.
        const tex = this.texturaRidotta(piena);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = BASSA_POTENZA ? 4 : this.renderer.capabilities.getMaxAnisotropy();
        tex.generateMipmaps = true;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        this.risorse.push(tex);

        const img = piena.image as { width?: number; height?: number } | undefined;
        const w = img?.width ?? 2;
        const h = img?.height ?? 3;
        // Proporzione reale rispettata sempre: la copertina non viene mai
        // deformata e il libro resta dentro lo spazio riservato dal layout.
        const misure = adattaLibro(posto.altezza, h / w, posto.slot);
        posto.larghezza = misure.larghezza;
        posto.altezza = misure.altezza;

        matCop.map = tex;
        matCop.needsUpdate = true;
        const cy = posto.yBase + posto.altezza / 2;
        cop.scale.set(posto.larghezza * 0.98, posto.altezza * 0.98, 1);
        cop.position.y = cy;
        corpo.scale.set(posto.larghezza, posto.altezza, posto.spessore);
        corpo.position.y = cy;
        ombra.scale.set(posto.larghezza * 1.5, posto.spessore * 3.4, 1);

        // dorso e bordi in tinta con la copertina
        if (img) {
          const c = coloreMedio(piena.image as TexImageSource);
          matCorpo.color.copy(c.multiplyScalar(0.55));
          matCorpo.needsUpdate = true;
        }
        piena.dispose(); // la copia grande non serve più
      },
      undefined,
      () => {
        /* il segnaposto resta: nessun libro bianco */
      },
    );
  }

  /** Striscia LED calda incassata sotto il ripiano superiore. */
  private costruisciStriscia(g: THREE.Group, r: RipianoGeom, tinta: THREE.Color) {
    const cima = r.superficie + r.altezzaUtile;
    const scelta = luceDi(this.pref.luce).colore;
    const colore = scelta
      ? new THREE.Color(scelta)
      : tinta.clone().lerp(new THREE.Color(0xfff1dc), 0.45);
    const barra = new THREE.Mesh(
      new THREE.BoxGeometry(r.xMax - r.xMin, 0.012, 0.02),
      new THREE.MeshBasicMaterial({ color: colore }),
    );
    barra.position.set(0, cima - 0.014, r.zFronte - 0.05);
    g.add(barra);
    this.risorse.push(barra.geometry, barra.material as THREE.Material);

    const alone = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.aloneCondiviso(),
        color: colore,
        transparent: true,
        opacity: 0.22,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    alone.scale.set((r.xMax - r.xMin) * 1.1, 0.16, 1);
    alone.position.set(0, cima - 0.05, r.zFronte - 0.03);
    g.add(alone);
    this.risorse.push(alone.material);
  }

  /**
   * Copia rimpicciolita di una copertina. Con quasi duecento volumi in scena
   * la somma delle texture a piena risoluzione sarebbe di centinaia di MB;
   * a questa dimensione un libro sullo scaffale resta comunque nitido.
   */
  private texturaRidotta(tex: THREE.Texture): THREE.Texture {
    const img = tex.image as (CanvasImageSource & { width?: number; height?: number }) | undefined;
    const maxLarghezza = BASSA_POTENZA ? 128 : 192;
    if (!img?.width || !img.height || img.width <= maxLarghezza) return tex.clone();
    const scala = maxLarghezza / img.width;
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.width * scala));
    c.height = Math.max(1, Math.round(img.height * scala));
    const ctx = c.getContext("2d");
    if (!ctx) return tex.clone();
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return new THREE.CanvasTexture(c);
  }

  private aloneTex: THREE.Texture | null = null;
  private aloneCondiviso(): THREE.Texture {
    if (!this.aloneTex) {
      this.aloneTex = texturaAlone("#ffffff", 0.18);
      this.risorse.push(this.aloneTex);
    }
    return this.aloneTex;
  }

  private costruisciInsegna(g: THREE.Group, sez: SezioneScena, luce: string) {
    const tema = temaDi(sez.id);
    const tex = this.traccia(texturaInsegna(sez.nome, tema.icona, luce, tema.motto));
    const larghezza = Math.min(MODULO.larghezza * 1.02, 1.08);
    const insegna = new THREE.Mesh(
      this.traccia(new THREE.PlaneGeometry(larghezza, larghezza * 0.3125)),
      this.traccia(new THREE.MeshBasicMaterial({ map: tex, transparent: true })),
    );
    insegna.position.set(0, MODULO.altezza + 0.2, MODULO.profondita / 2 - 0.01);
    insegna.userData = { sezioneId: sez.id, azione: sez.id === "desideri" ? "desideri" : undefined };
    g.add(insegna);
    this.interattivi.push(insegna);

    const luceInsegna = new THREE.PointLight(new THREE.Color(luce), 0.5, 2.4, 2);
    luceInsegna.position.set(0, MODULO.altezza + 0.2, MODULO.profondita / 2 + 0.25);
    g.add(luceInsegna);
  }

  // ---- dais della Ruota --------------------------------------------------

  private costruisciDais() {
    const z = this.zMin + 1.25;
    const legno = mappeLegno(9, [70, 40, 60]);
    this.risorse.push(legno.map, legno.normalMap, legno.roughnessMap);
    const mat = this.traccia(
      new THREE.MeshStandardMaterial({
        map: legno.map,
        normalMap: legno.normalMap,
        roughnessMap: legno.roughnessMap,
        roughness: 0.6,
        metalness: 0.15,
        envMapIntensity: 0.4,
      }),
    );

    const base = new THREE.Mesh(this.traccia(new THREE.CylinderGeometry(0.95, 1.12, 0.22, 40)), mat);
    base.position.set(0, 0.11, z);
    base.receiveShadow = true;
    base.castShadow = true;
    this.scene.add(base);

    const colonna = new THREE.Mesh(
      this.traccia(new THREE.CylinderGeometry(0.16, 0.24, 0.95, 24)),
      mat,
    );
    colonna.position.set(0, 0.68, z);
    colonna.castShadow = true;
    this.scene.add(colonna);

    this.orb = new THREE.Mesh(
      this.traccia(new THREE.IcosahedronGeometry(0.3, 2)),
      this.traccia(
        new THREE.MeshStandardMaterial({
          color: 0xffd98a,
          emissive: 0xff9d3c,
          emissiveIntensity: 1.1,
          roughness: 0.18,
          metalness: 0.55,
        }),
      ),
    );
    this.orb.position.set(0, 1.5, z);
    this.orb.userData = { azione: "ruota" };
    this.scene.add(this.orb);
    this.interattivi.push(this.orb);

    const anello = new THREE.Mesh(
      this.traccia(new THREE.TorusGeometry(0.46, 0.018, 10, 48)),
      this.traccia(new THREE.MeshStandardMaterial({ color: 0xd6b260, metalness: 0.9, roughness: 0.25 })),
    );
    anello.position.copy(this.orb.position);
    anello.rotation.x = Math.PI / 2;
    anello.userData = { azione: "ruota" };
    this.scene.add(anello);
    this.interattivi.push(anello);

    const alone = new THREE.Sprite(
      this.traccia(
        new THREE.SpriteMaterial({
          map: this.aloneCondiviso(),
          color: 0xffc073,
          transparent: true,
          opacity: 0.5,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      ),
    );
    alone.scale.set(2.6, 2.6, 1);
    alone.position.copy(this.orb.position);
    this.scene.add(alone);

    this.orbLuce = new THREE.PointLight(0xffb35c, 3.2, 9, 2);
    this.orbLuce.position.set(0, 1.75, z);
    this.scene.add(this.orbLuce);

    const tex = this.traccia(
      texturaInsegna("La Ruota del Destino", "🔮", "#ffcf7a", "Scegli tu per me"),
    );
    const cartello = new THREE.Mesh(
      this.traccia(new THREE.PlaneGeometry(1.7, 0.53)),
      this.traccia(new THREE.MeshBasicMaterial({ map: tex, transparent: true })),
    );
    cartello.position.set(0, 2.25, z - 0.35);
    cartello.userData = { azione: "ruota" };
    this.scene.add(cartello);
    this.interattivi.push(cartello);

    this.waypoints.push({ id: "__ruota", x: 0, z: z + 1.9, yaw: yawVerso(0, z + 1.9, 0, z) });
  }

  /**
   * Leggio della Ruota dei Desideri: sta all'ingresso, sulla destra di chi
   * entra, così le due ruote non finiscono una addosso all'altra (quella del
   * Destino resta in fondo, al centro).
   */
  private costruisciLeggioDesideri() {
    if (!this.haDesideri) return;
    const x = CORRIDOIO / 2 - 0.35; // destra entrando, appena fuori dal passaggio
    const z = this.zMax - 1.5;
    // guarda verso chi entra, non verso il muro
    const versoCorsia = facciaVerso(x, z, 0, this.zMax - 0.5);

    const legno = mappeLegno(13, [78, 52, 26]);
    this.risorse.push(legno.map, legno.normalMap, legno.roughnessMap);
    const mat = this.traccia(
      new THREE.MeshStandardMaterial({
        map: legno.map,
        normalMap: legno.normalMap,
        roughnessMap: legno.roughnessMap,
        roughness: 0.62,
        metalness: 0.12,
        envMapIntensity: 0.4,
      }),
    );

    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = versoCorsia;

    const base = new THREE.Mesh(this.traccia(new THREE.CylinderGeometry(0.3, 0.36, 0.09, 24)), mat);
    base.position.y = 0.045;
    base.castShadow = true;
    base.receiveShadow = true;
    g.add(base);

    const stelo = new THREE.Mesh(this.traccia(new THREE.CylinderGeometry(0.06, 0.09, 1.1, 16)), mat);
    stelo.position.y = 0.6;
    stelo.castShadow = true;
    g.add(stelo);

    const coppa = new THREE.Mesh(this.traccia(new THREE.CylinderGeometry(0.17, 0.09, 0.12, 20)), mat);
    coppa.position.y = 1.21;
    coppa.castShadow = true;
    g.add(coppa);

    const oro = temaDi("desideri").luce;
    const sfera = new THREE.Mesh(
      this.traccia(new THREE.IcosahedronGeometry(0.16, 2)),
      this.traccia(
        new THREE.MeshStandardMaterial({
          color: 0xffc472,
          emissive: new THREE.Color(oro),
          emissiveIntensity: 0.75,
          roughness: 0.2,
          metalness: 0.5,
        }),
      ),
    );
    sfera.position.y = 1.46;
    sfera.userData = { azione: "ruotaDesideri" };
    g.add(sfera);
    this.interattivi.push(sfera);
    this.sferaDesideri = sfera;

    const alone = new THREE.Sprite(
      this.traccia(
        new THREE.SpriteMaterial({
          map: this.aloneCondiviso(),
          color: new THREE.Color(oro),
          transparent: true,
          opacity: 0.55,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      ),
    );
    alone.scale.set(1.5, 1.5, 1);
    alone.position.y = 1.46;
    g.add(alone);

    const luce = new THREE.PointLight(new THREE.Color(oro), 1.6, 4.5, 2);
    luce.position.y = 1.5;
    g.add(luce);

    const tex = this.traccia(
      texturaInsegna("Ruota dei Desideri", "⭐", oro, "Cosa compro adesso?"),
    );
    const cartello = new THREE.Mesh(
      this.traccia(new THREE.PlaneGeometry(0.74, 0.23)),
      this.traccia(new THREE.MeshBasicMaterial({ map: tex, transparent: true })),
    );
    cartello.position.set(0, 1.82, 0);
    cartello.userData = { azione: "ruotaDesideri" };
    g.add(cartello);
    this.interattivi.push(cartello);

    this.scene.add(g);

    // punto di sosta davanti al leggio, abbastanza indietro da inquadrarlo
    const xSosta = -0.15;
    const zSosta = z + 0.55;
    this.waypoints.push({
      id: "__ruotaDesideri",
      x: xSosta,
      z: zSosta,
      yaw: yawVerso(xSosta, zSosta, x, z),
    });
  }

  /**
   * Decori fantasy: lanterne sospese sopra la corsia, candelabri accesi sui
   * mobili, ampolle colorate e cerchi di rune sul pavimento. Geometrie e
   * materiali sono condivisi, così l'aggiunta non pesa sul framerate.
   */
  private costruisciDecori(piani: PianoModulo[]) {
    if (!this.pref.decori) return;
    const lung = this.zMax - this.zMin;

    const oro = this.traccia(
      new THREE.MeshStandardMaterial({ color: 0xb8912f, metalness: 0.85, roughness: 0.3 }),
    );
    const fiammaMat = () =>
      this.traccia(
        new THREE.SpriteMaterial({
          map: this.aloneCondiviso(),
          color: 0xffc477,
          transparent: true,
          opacity: 0.9,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );

    // --- lanterne sospese lungo la corsia
    const geoCatena = this.traccia(new THREE.CylinderGeometry(0.006, 0.006, 0.5, 5));
    const geoGabbia = this.traccia(new THREE.CylinderGeometry(0.09, 0.11, 0.2, 6, 1, true));
    const geoCappello = this.traccia(new THREE.ConeGeometry(0.13, 0.09, 6));
    const nLanterne = Math.max(2, Math.round(lung / 3.4));
    for (let i = 0; i < nLanterne; i++) {
      const z = this.zMax - 1.6 - (i * (lung - 2.6)) / Math.max(1, nLanterne - 1);
      const x = i % 2 === 0 ? -0.75 : 0.75;
      const g = new THREE.Group();
      g.position.set(x, 0, z);

      const catena = new THREE.Mesh(geoCatena, oro);
      catena.position.y = ALTEZZA_STANZA - 0.25;
      g.add(catena);
      const gabbia = new THREE.Mesh(geoGabbia, oro);
      gabbia.position.y = ALTEZZA_STANZA - 0.6;
      g.add(gabbia);
      const cappello = new THREE.Mesh(geoCappello, oro);
      cappello.position.y = ALTEZZA_STANZA - 0.46;
      g.add(cappello);

      const fiamma = new THREE.Sprite(fiammaMat());
      fiamma.scale.set(0.22, 0.28, 1);
      fiamma.position.y = ALTEZZA_STANZA - 0.6;
      g.add(fiamma);

      const luce = new THREE.PointLight(0xffb877, 1.1, 5.5, 2);
      luce.position.y = ALTEZZA_STANZA - 0.6;
      g.add(luce);
      this.candele.push({ luce, base: 1.1, fase: i * 2.1 });

      this.scene.add(g);
    }

    // --- candelabri e ampolle sopra i mobili
    const geoCera = this.traccia(new THREE.CylinderGeometry(0.022, 0.026, 0.16, 8));
    const geoPiatto = this.traccia(new THREE.CylinderGeometry(0.07, 0.08, 0.02, 10));
    const geoAmpolla = this.traccia(new THREE.SphereGeometry(0.055, 10, 8));
    const geoCollo = this.traccia(new THREE.CylinderGeometry(0.016, 0.022, 0.06, 8));
    const cera = this.traccia(
      new THREE.MeshStandardMaterial({ color: 0xf2e6c8, roughness: 0.75 }),
    );
    const tinteAmpolle = [0x6ad4b0, 0xd46a9a, 0x7a9cff, 0xffc46a];

    piani.forEach((piano, i) => {
      if (piano.indiceModulo !== 0) return; // uno ogni sezione, non su ogni mobile
      const cima = MODULO.altezza + 0.01;
      const g = new THREE.Group();
      g.position.set(
        piano.lato * (CORRIDOIO / 2 + MODULO.profondita / 2),
        0,
        piano.z,
      );
      g.rotation.y = piano.lato < 0 ? Math.PI / 2 : -Math.PI / 2;

      if (i % 2 === 0) {
        // candelabro a tre bracci
        const piatto = new THREE.Mesh(geoPiatto, oro);
        piatto.position.set(0, cima, 0.02);
        g.add(piatto);
        for (let k = -1; k <= 1; k++) {
          const c = new THREE.Mesh(geoCera, cera);
          c.position.set(k * 0.06, cima + 0.09 + (k === 0 ? 0.03 : 0), 0.02);
          c.castShadow = true;
          g.add(c);
          const f = new THREE.Sprite(fiammaMat());
          f.scale.set(0.06, 0.1, 1);
          f.position.set(k * 0.06, cima + 0.19 + (k === 0 ? 0.03 : 0), 0.02);
          g.add(f);
        }
        const luce = new THREE.PointLight(0xffb466, 0.7, 2.6, 2);
        luce.position.set(0, cima + 0.22, 0.05);
        g.add(luce);
        this.candele.push({ luce, base: 0.7, fase: i * 1.3 });
      } else {
        // ampolle da alchimista
        for (let k = -1; k <= 1; k++) {
          const tinta = tinteAmpolle[(i + k + 4) % tinteAmpolle.length]!;
          const mat = this.traccia(
            new THREE.MeshStandardMaterial({
              color: tinta,
              emissive: tinta,
              emissiveIntensity: 0.35,
              roughness: 0.15,
              metalness: 0.1,
              transparent: true,
              opacity: 0.85,
            }),
          );
          const a = new THREE.Mesh(geoAmpolla, mat);
          a.position.set(k * 0.13, cima + 0.055, 0.02);
          g.add(a);
          const collo = new THREE.Mesh(geoCollo, mat);
          collo.position.set(k * 0.13, cima + 0.13, 0.02);
          g.add(collo);
        }
      }
      this.scene.add(g);
    });

    // --- cerchi di rune sul pavimento
    const runeTex = this.traccia(texturaRune("#d8b45e"));
    const matRune = this.traccia(
      new THREE.MeshBasicMaterial({
        map: runeTex,
        transparent: true,
        opacity: 0.3,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    const geoRune = this.traccia(new THREE.PlaneGeometry(1.5, 1.5));
    const nRune = Math.max(1, Math.round(lung / 5));
    for (let i = 0; i < nRune; i++) {
      const z = this.zMax - 2.4 - (i * (lung - 4)) / Math.max(1, nRune - 1);
      const r = new THREE.Mesh(geoRune, matRune);
      r.rotation.x = -Math.PI / 2;
      r.position.set(0, 0.012, z);
      this.scene.add(r);
      this.rune.push(r);
    }
  }

  // ---- luci --------------------------------------------------------------

  private costruisciLuci() {
    // 1. ambiente: nessuna zona completamente nera
    this.scene.add(new THREE.AmbientLight(atmosferaDi(this.pref.atmosfera).ambiente, 0.4));
    this.scene.add(new THREE.HemisphereLight(0x6a5a9a, 0x2a1a10, 0.45));

    // 2. luce principale: dà volume ai mobili e proietta ombre morbide
    const chiave = new THREE.DirectionalLight(0xffe2b8, 1.15);
    chiave.position.set(2.6, ALTEZZA_STANZA + 1.5, this.zMax - 2);
    chiave.target.position.set(-1, 0.8, (this.zMax + this.zMin) / 2);
    chiave.castShadow = !BASSA_POTENZA;
    const lung = this.zMax - this.zMin;
    chiave.shadow.mapSize.set(BASSA_POTENZA ? 1024 : 2048, BASSA_POTENZA ? 1024 : 2048);
    chiave.shadow.camera.left = -6;
    chiave.shadow.camera.right = 6;
    chiave.shadow.camera.top = lung / 2 + 2;
    chiave.shadow.camera.bottom = -lung / 2 - 2;
    chiave.shadow.camera.near = 0.5;
    chiave.shadow.camera.far = 26;
    chiave.shadow.bias = -0.0012;
    chiave.shadow.normalBias = 0.02;
    this.scene.add(chiave, chiave.target);

    // 3. candele calde lungo la corsia: atmosfera, non illuminazione principale
    const nCandele = Math.max(3, Math.min(6, Math.round(lung / 3.2)));
    for (let i = 0; i < nCandele; i++) {
      const z = this.zMax - 1.5 - (i * (lung - 2)) / Math.max(1, nCandele - 1);
      const x = (i % 2 === 0 ? -1 : 1) * 0.95;
      const luce = new THREE.PointLight(0xffa955, 1.5, 6.5, 2);
      luce.position.set(x, 2.5, z);
      this.scene.add(luce);
      this.candele.push({ luce, base: 1.5, fase: i * 1.7 });

      const fiamma = new THREE.Sprite(
        this.traccia(
          new THREE.SpriteMaterial({
            map: this.aloneCondiviso(),
            color: 0xffcb88,
            transparent: true,
            opacity: 0.75,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        ),
      );
      fiamma.scale.set(0.42, 0.55, 1);
      fiamma.position.set(x, 2.5, z);
      this.scene.add(fiamma);
    }

    // 4. LED dei ripiani: poche RectAreaLight riassegnate ai ripiani più vicini.
    //    Sono la resa migliore per una striscia luminosa, ma costano: invece di
    //    metterne una per ogni ripiano (decine), se ne tiene un gruppetto che
    //    seg  ue chi cammina. I ripiani lontani restano leggibili grazie a
    //    strisce emissive, ambiente ed environment.
    const nPool = BASSA_POTENZA ? 4 : 10;
    for (let i = 0; i < nPool; i++) {
      const l = new THREE.RectAreaLight(0xfff0d6, 0, 0.9, 0.06);
      l.visible = false;
      this.scene.add(l);
      this.pool.push(l);
    }

    // 5. polvere magica
    const N = BASSA_POTENZA ? 150 : 380;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * (CORRIDOIO + 1);
      pos[i * 3 + 1] = 0.4 + Math.random() * 2.8;
      pos[i * 3 + 2] = this.zMin + Math.random() * lung;
    }
    const geo = this.traccia(new THREE.BufferGeometry());
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const matP = this.traccia(
      new THREE.PointsMaterial({
        map: this.aloneCondiviso(),
        color: 0xffd98a,
        size: 0.035,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
      }),
    );
    this.polvere = new THREE.Points(geo, matP);
    this.scene.add(this.polvere);
  }

  /** Riassegna il gruppetto di LED ai ripiani più vicini a chi guarda. */
  private aggiornaLuciRipiano() {
    if (this.pool.length === 0 || this.luciRipiano.length === 0) return;
    const vicini = [...this.luciRipiano]
      .map((l) => ({ l, d: (l.x - this.pos.x) ** 2 + (l.z - this.pos.z) ** 2 }))
      .sort((a, b) => a.d - b.d)
      .slice(0, this.pool.length);

    this.pool.forEach((luce, i) => {
      const v = vicini[i];
      if (!v) {
        luce.visible = false;
        return;
      }
      const { l } = v;
      luce.visible = true;
      luce.width = l.larghezza;
      luce.height = 0.05;
      luce.intensity = 16;
      luce.position.set(l.x, l.y, l.z);
      // punta verso il basso e leggermente in fuori, sulle copertine
      const avanti = new THREE.Vector3(Math.sin(l.yaw), 0, Math.cos(l.yaw));
      luce.lookAt(l.x + avanti.x * 0.5, l.y - 0.5, l.z + avanti.z * 0.5);
    });
  }

  // ---- input -------------------------------------------------------------

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
    this.yaw -= dx * 0.0042;
    this.yawBersaglio = this.yaw;
    this.pitch = Math.max(-0.75, Math.min(0.75, this.pitch - dy * 0.0042));
  };

  private onUp = (e: PointerEvent) => {
    if (!this.giu) return;
    this.giu = false;
    if (this.trascinato) return;

    this.raycaster.setFromCamera(this.ndc(e), this.camera);
    const hit = this.raycaster.intersectObjects(this.interattivi, false)[0];
    if (hit) {
      const u = hit.object.userData as {
        libro?: Libro;
        sezioneId?: string;
        azione?: string;
      };
      if (u.libro) return this.cb.onPickLibro(u.libro);
      if (u.azione === "ruota") return this.cb.onRuota();
      if (u.azione === "ruotaDesideri") return this.cb.onRuotaDesideri();
      if (u.azione === "desideri") return this.cb.onDesideri();
      if (u.sezioneId) return this.vaiAScaffale(u.sezioneId);
    }
    const suolo = this.raycaster.intersectObject(this.pavimento, false)[0];
    if (suolo) {
      this.posBersaglio.set(suolo.point.x, 0, suolo.point.z);
      this.limita(this.posBersaglio);
    }
  };

  private onKeyDown = (e: KeyboardEvent) => this.tasti.add(e.key.toLowerCase());
  private onKeyUp = (e: KeyboardEvent) => this.tasti.delete(e.key.toLowerCase());

  /** Tiene chi cammina nel corridoio: mai dentro i mobili né oltre le pareti. */
  private limita(p: THREE.Vector3) {
    const meta = CORRIDOIO / 2 - RAGGIO_CAMERA;
    p.x = Math.max(-meta, Math.min(meta, p.x));
    p.z = Math.max(this.zMin + 0.8, Math.min(this.zMax - 0.3, p.z));
  }

  impostaPasso(v: number) {
    this.passo = v;
  }

  /**
   * Sospende il ciclo di disegno. Serve quando si apre l'angolo di lettura:
   * due scene WebGL che disegnano insieme sprecherebbero GPU (e batteria) per
   * mostrarne una sola.
   */
  pausa() {
    if (this.raf === 0) return;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  riprendi() {
    if (this.raf !== 0) return;
    this.orologio.getDelta(); // scarta il tempo trascorso da fermi
    this.raf = requestAnimationFrame(this.tick);
  }

  vaiAScaffale(id: string) {
    const w = this.waypoints.find((x) => x.id === id);
    if (!w) return;
    this.posBersaglio.set(w.x, 0, w.z);
    this.limita(this.posBersaglio);
    this.yawBersaglio = w.yaw;
    this.ruotaVerso = true;
  }
  vaiAllaRuota() {
    this.vaiAScaffale("__ruota");
  }
  vaiAiDesideri() {
    this.vaiAScaffale("desideri");
  }
  /** Si ferma davanti al leggio della Ruota dei Desideri. */
  vaiAllaRuotaDesideri() {
    this.vaiAScaffale("__ruotaDesideri");
  }
  vaiAllIngresso() {
    this.posBersaglio.set(0, 0, this.zMax - 0.6);
    this.yawBersaglio = 0;
    this.ruotaVerso = true;
  }

  /** Diagnostica per il controllo finale: conteggi e violazioni di bounds. */
  diagnostica() {
    const perSezione = new Map<string, Posto[]>();
    for (const { posto } of this.libriMesh) {
      const k = `${posto.modulo}`;
      const l = perSezione.get(k) ?? [];
      l.push(posto);
      perSezione.set(k, l);
    }
    const ripiani = disponiLibri([]).ripiani;
    const violazioni = verificaPosti(
      this.libriMesh.map((l) => l.posto),
      ripiani,
    );
    return {
      libri: this.libriMesh.length,
      moduli: this.nModuli,
      luciRipiano: this.luciRipiano.length,
      poolLuci: this.pool.length,
      violazioni,
    };
  }

  // ---- loop --------------------------------------------------------------

  private tick = () => {
    this.raf = requestAnimationFrame(this.tick);
    const dt = Math.min(this.orologio.getDelta(), 0.05);
    const t = this.orologio.elapsedTime;

    const avanti =
      (this.tasti.has("w") || this.tasti.has("arrowup") ? 1 : 0) +
      (this.tasti.has("s") || this.tasti.has("arrowdown") ? -1 : 0) +
      this.passo;
    const lat = (this.tasti.has("d") ? 1 : 0) + (this.tasti.has("a") ? -1 : 0);

    if (avanti !== 0 || lat !== 0) {
      const v = 2.4 * dt;
      const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
      this.pos.x += (-sin * avanti + cos * lat) * v;
      this.pos.z += (-cos * avanti + sin * lat) * v;
      this.limita(this.pos);
      this.posBersaglio.copy(this.pos);
      this.ruotaVerso = false;
    } else {
      this.pos.lerp(this.posBersaglio, 1 - Math.pow(0.0009, dt));
    }
    this.limita(this.pos);

    if (this.ruotaVerso) {
      const d = normalizzaAngolo(this.yawBersaglio - this.yaw);
      this.yaw += d * (1 - Math.pow(0.004, dt));
      if (Math.abs(d) < 0.008) this.ruotaVerso = false;
    }

    const bob = avanti !== 0 ? Math.sin(t * 6.5) * 0.011 : 0;
    this.camera.position.set(this.pos.x, OCCHI + bob, this.pos.z);
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;

    // sezione più vicina → HUD
    let vicino: string | null = null;
    let distMin = 2.1;
    for (const w of this.waypoints) {
      if (w.id.startsWith("__")) continue;
      const d = Math.hypot(this.pos.x - w.x, this.pos.z - w.z);
      if (d < distMin) {
        distMin = d;
        vicino = w.id;
      }
    }
    if (vicino !== this.sezioneAttuale) {
      this.sezioneAttuale = vicino;
      this.cb.onArrivo(vicino);
    }

    if (t > this.prossimoRicalcolo) {
      this.prossimoRicalcolo = t + 0.25;
      this.aggiornaLuciRipiano();
    }

    for (const c of this.candele) {
      c.luce.intensity = c.base * (0.82 + Math.sin(t * 7 + c.fase) * 0.1 + Math.sin(t * 17 + c.fase) * 0.04);
    }
    this.orb.rotation.y += dt * 0.5;
    this.orb.rotation.x += dt * 0.2;
    this.orb.position.y = 1.5 + Math.sin(t * 1.3) * 0.045;
    this.orbLuce.intensity = 3.0 + Math.sin(t * 2.6) * 0.5;
    if (this.sferaDesideri) {
      this.sferaDesideri.rotation.y -= dt * 0.6;
      this.sferaDesideri.position.y = 1.46 + Math.sin(t * 1.6) * 0.03;
    }
    for (let i = 0; i < this.rune.length; i++) {
      const r = this.rune[i]!;
      r.rotation.z = t * 0.06 * (i % 2 === 0 ? 1 : -1);
      (r.material as THREE.MeshBasicMaterial).opacity = 0.22 + Math.sin(t * 0.9 + i) * 0.1;
    }
    if (this.polvere) this.polvere.rotation.y = t * 0.014;

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
    removeEventListener("keydown", this.onKeyDown);
    removeEventListener("keyup", this.onKeyUp);
    this.canvas.removeEventListener("pointerdown", this.onDown);
    this.canvas.removeEventListener("pointermove", this.onMove);
    this.canvas.removeEventListener("pointerup", this.onUp);
    this.canvas.removeEventListener("pointercancel", this.onUp);

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
    this.pmrem?.dispose();
    this.renderer.dispose();
  }
}
