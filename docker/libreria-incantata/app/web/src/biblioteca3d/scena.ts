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
} from "./materiali";

export interface SezioneScena {
  id: string;
  nome: string;
  libri: Libro[];
}

export interface CallbacksScena {
  onPickLibro: (libro: Libro) => void;
  onArrivo: (sezioneId: string | null) => void;
  onRuota: () => void;
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
const CORRIDOIO = 3.5; // larghezza libera fra i due lati
const PASSO_MODULO = MODULO.larghezza + 0.035;
const GAP_SEZIONE = 0.32;
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

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.08, 70);
    this.camera.rotation.order = "YXZ";

    this.scene.background = new THREE.Color(0x0a0713);
    this.scene.fog = new THREE.Fog(0x0a0713, 9, 30);

    const piani = this.pianifica(sezioni);
    this.costruisciAmbiente();
    this.costruisciModuli(piani);
    this.costruisciDais();
    this.costruisciLuci();

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

    sezioni.forEach((sez, i) => {
      const lato: -1 | 1 = i % 2 === 0 ? -1 : 1;
      const { moduli } = disponiLibri(sez.libri);
      const zPartenza = cursore[lato];
      for (let m = 0; m < moduli; m++) {
        piani.push({ sezione: sez, indiceModulo: m, lato, z: zPartenza - m * PASSO_MODULO });
      }
      this.nModuli += moduli;

      // waypoint davanti al centro della sezione
      const zCentro = zPartenza - ((moduli - 1) * PASSO_MODULO) / 2;
      const xSosta = lato * (CORRIDOIO / 2 - 1.05);
      const xMobile = lato * (CORRIDOIO / 2);
      this.waypoints.push({
        id: sez.id,
        x: xSosta,
        z: zCentro,
        yaw: yawVerso(xSosta, zCentro, xMobile, zCentro),
      });

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
        new THREE.MeshStandardMaterial({ color: 0x3d1330, roughness: 0.95, envMapIntensity: 0.1 }),
      ),
    );
    tappeto.rotation.x = -Math.PI / 2;
    tappeto.position.set(0, 0.004, zC);
    tappeto.receiveShadow = true;
    this.scene.add(tappeto);
  }

  // ---- mobili e libri ----------------------------------------------------

  private costruisciModuli(piani: PianoModulo[]) {
    const legno = mappeLegno(3, [86, 52, 33]);
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
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = BASSA_POTENZA ? 4 : this.renderer.capabilities.getMaxAnisotropy();
        tex.generateMipmaps = true;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        this.risorse.push(tex);

        const img = tex.image as { width?: number; height?: number } | undefined;
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
        if (img && (img as CanvasImageSource | undefined)) {
          const c = coloreMedio(tex.image as TexImageSource);
          matCorpo.color.copy(c.multiplyScalar(0.55));
          matCorpo.needsUpdate = true;
        }
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
    const colore = tinta.clone().lerp(new THREE.Color(0xfff1dc), 0.72);
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

  // ---- luci --------------------------------------------------------------

  private costruisciLuci() {
    // 1. ambiente: nessuna zona completamente nera
    this.scene.add(new THREE.AmbientLight(0x4a3c6a, 0.35));
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
