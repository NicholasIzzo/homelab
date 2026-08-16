/**
 * Motore di layout degli scaffali — matematica pura, niente Three.js.
 *
 * Il flusso è: dimensioni del mobile → ripiani reali → capacità → assegnazione
 * dei libri. Ogni libro riceve una posizione calcolata a partire dallo spazio
 * realmente disponibile, mai coordinate fisse: aggiungendo titoli il layout si
 * ridispone da solo e, quando un modulo è pieno, si passa al successivo.
 *
 * Sistema di riferimento locale al modulo: origine al centro della base,
 * X in larghezza, Y in altezza, Z in profondità (fronte = +Z).
 */

export interface DimModulo {
  /** Ingombro esterno. */
  larghezza: number;
  altezza: number;
  profondita: number;
  /** Spessore dei fianchi e del cappello. */
  spessoreFianco: number;
  /** Spessore dei ripiani. */
  spessoreRipiano: number;
  /** Altezza dello zoccolo (il primo ripiano non parte da terra). */
  zoccolo: number;
  /** Numero di piani utili. */
  nRipiani: number;
  /** Margine di sicurezza ai lati dell'interno. */
  margineLaterale: number;
  /** Aria fra la cima del libro e il ripiano sopra. */
  aria: number;
  /** Spazio minimo fra due libri accostati. */
  gap: number;
  /** Quanto i libri stanno arretrati rispetto al filo anteriore. */
  rientroFronte: number;
}

export const MODULO: DimModulo = {
  // Vani stretti e alti: con pochi libri esposti di piatto uno scaffale largo
  // resterebbe mezzo vuoto, mentre così ogni ripiano appare pieno e ordinato.
  larghezza: 0.78,
  altezza: 2.16,
  profondita: 0.32,
  spessoreFianco: 0.028,
  spessoreRipiano: 0.024,
  // Base chiusa alta: i ripiani vicini al pavimento non si guardano e i libri
  // lì sotto non si distinguono. Meglio un mobile con credenza sotto e i libri
  // tutti fra la vita e gli occhi, che sei ripiani di cui due inservibili.
  zoccolo: 0.72,
  nRipiani: 5,
  margineLaterale: 0.022,
  aria: 0.035,
  gap: 0.012,
  rientroFronte: 0.025,
};

/** Passo verticale fra un ripiano e il successivo, costante fra i mobili. */
export const PASSO_RIPIANO =
  (MODULO.altezza - MODULO.spessoreFianco - MODULO.zoccolo) / MODULO.nRipiani;

/**
 * Mobile su misura per la sezione: quanti ripiani servono davvero.
 *
 * Un mobile alto uguale per tutti lascia mezzi scaffali vuoti alle sezioni
 * piccole, e la sala sembra sguarnita a tratti. Qui l'altezza segue il
 * contenuto — come in una libreria vera, dove i mobili non sono tutti uguali —
 * mantenendo però identici passo dei ripiani, larghezza e base.
 */
export function dimensioniPerSezione(nLibri: number, d: DimModulo = MODULO): DimModulo {
  const perRipiano = 3; // stima prudente: ci stanno 3 volumi per ripiano
  const nRipiani = Math.max(2, Math.min(d.nRipiani, Math.ceil(nLibri / perRipiano)));
  return {
    ...d,
    nRipiani,
    altezza: d.zoccolo + nRipiani * PASSO_RIPIANO + d.spessoreFianco,
  };
}

/** Proporzioni ammesse per una copertina (altezza/larghezza). */
export const ASPETTO_MIN = 1.28; // copertina più "larga" ammessa
export const ASPETTO_MAX = 1.85; // copertina più "stretta" ammessa
export const ASPETTO_STD = 1.5; // finché la texture non è caricata

export interface RipianoGeom {
  indice: number;
  /** Quota del piano d'appoggio (faccia superiore del ripiano). */
  superficie: number;
  /** Spazio libero sopra il piano, fino al ripiano successivo. */
  altezzaUtile: number;
  /** Estremi utilizzabili in X (margini già sottratti). */
  xMin: number;
  xMax: number;
  /** Faccia interna del fondo e filo anteriore, in Z. */
  zFondo: number;
  zFronte: number;
}

export function ripianiDi(d: DimModulo): RipianoGeom[] {
  const yBase = d.zoccolo;
  const yCima = d.altezza - d.spessoreFianco;
  const disponibile = yCima - yBase;
  const passo = disponibile / d.nRipiani;

  const xMax = d.larghezza / 2 - d.spessoreFianco - d.margineLaterale;
  const zFronte = d.profondita / 2;
  const zFondo = -d.profondita / 2 + d.spessoreFianco;

  const ripiani: RipianoGeom[] = [];
  for (let i = 0; i < d.nRipiani; i++) {
    ripiani.push({
      indice: i,
      superficie: yBase + i * passo + d.spessoreRipiano,
      altezzaUtile: passo - d.spessoreRipiano,
      xMin: -xMax,
      xMax,
      zFondo,
      zFronte,
    });
  }
  return ripiani;
}

/** Rumore deterministico 0..1 da una stringa: stessa scena a ogni ricarica. */
export function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

export interface LibroMisurabile {
  id: string;
}

export interface Posto {
  id: string;
  /** Sezione di appartenenza: due sezioni diverse sono mobili diversi. */
  gruppo?: string;
  /** Indice del modulo nella sezione. */
  modulo: number;
  ripiano: number;
  /** Centro del libro: x orizzontale, y = base appoggiata, z profondità. */
  x: number;
  yBase: number;
  z: number;
  /** Ingombro effettivo. */
  larghezza: number;
  altezza: number;
  spessore: number;
  /** Larghezza dello spazio riservato: il libro può crescere fin qui e non oltre. */
  slot: number;
}

export interface RisultatoLayout {
  posti: Posto[];
  /** Quanti moduli servono per contenere tutti i libri. */
  moduli: number;
  ripiani: RipianoGeom[];
}

interface Misura {
  id: string;
  altezza: number;
  larghezza: number;
  spessore: number;
  slot: number;
}

/** Ingombro di un libro: stabile nel tempo, ricavato dal suo id. */
function misura(libro: LibroMisurabile, r: RipianoGeom, d: DimModulo): Misura {
  // Altezza: sfrutta il ripiano lasciando aria, con una variazione stabile
  // per libro così lo scaffale non sembra stampato a macchina.
  const hMax = Math.min(r.altezzaUtile - d.aria, 0.265);
  const altezza = Math.max(0.16, hMax * (0.86 + hash01(libro.id + "h") * 0.14));
  return {
    id: libro.id,
    altezza,
    // Lo slot riservato usa la copertina più larga ammessa: qualunque sia
    // l'immagine reale, il libro resterà dentro il suo posto.
    slot: altezza / ASPETTO_MIN,
    larghezza: altezza / ASPETTO_STD,
    spessore: 0.026 + hash01(libro.id + "s") * 0.03,
  };
}

/**
 * Divide i libri fra i ripiani rispettando un tetto per ripiano (uno per
 * ripiano, in ordine) e la larghezza realmente disponibile. Chi non entra
 * scala al ripiano dopo, senza mai stringere i libri oltre il loro spazio.
 */
function assegnaAiRipiani(
  misure: Misura[],
  ripiani: RipianoGeom[],
  d: DimModulo,
  limiti: number[] | number,
): Misura[][] {
  const righe: Misura[][] = [];
  let corrente: Misura[] = [];
  let usato = 0;
  let indice = 0;
  const larghezzaUtile = ripiani[0]!.xMax - ripiani[0]!.xMin;
  const tetto = (i: number) =>
    typeof limiti === "number" ? limiti : (limiti[i] ?? limiti[limiti.length - 1] ?? 1);

  const chiudi = () => {
    righe.push(corrente);
    corrente = [];
    usato = 0;
    indice++;
  };

  // ripiani a cui non spetta nessun libro (sezioni piccole): restano vuoti
  while (tetto(indice) === 0 && indice < (Array.isArray(limiti) ? limiti.length : 0)) chiudi();

  for (const m of misure) {
    const aggiunta = m.slot + (corrente.length > 0 ? d.gap : 0);
    const pieno = corrente.length >= tetto(indice) || usato + aggiunta > larghezzaUtile + 1e-9;
    if (pieno && corrente.length > 0) {
      chiudi();
      while (tetto(indice) === 0 && indice < (Array.isArray(limiti) ? limiti.length : 0)) chiudi();
    }
    corrente.push(m);
    usato += m.slot + (corrente.length > 1 ? d.gap : 0);
  }
  if (corrente.length > 0) chiudi();
  return righe;
}

/**
 * Quanti libri per ripiano, per riempire il mobile in modo uniforme.
 * Con pochi titoli si parte dai ripiani in alto, quelli all'altezza degli
 * occhi: meglio due libri ben in vista che due libri persi vicino al pavimento.
 */
function tettiPerRipiano(n: number, ripianiTotali: number): number[] {
  const limiti = new Array<number>(ripianiTotali).fill(0);
  if (n <= 0) return limiti;
  if (n < ripianiTotali) {
    for (let i = 0; i < n; i++) limiti[ripianiTotali - 1 - i] = 1;
    return limiti;
  }
  const base = Math.floor(n / ripianiTotali);
  const extra = n % ripianiTotali;
  for (let i = 0; i < ripianiTotali; i++) limiti[i] = base + (i < extra ? 1 : 0);
  return limiti;
}

/**
 * Dispone i libri negli scaffali.
 *
 * I libri vengono ripartiti su tutti i ripiani invece di essere ammucchiati in
 * basso, e ogni fila è centrata: uno scaffale mezzo vuoto sembrerebbe
 * abbandonato, non una libreria. Quando lo spazio finisce davvero si passa al
 * ripiano e poi al modulo successivo. Nessun libro viene scartato.
 */
export function disponiLibri(libri: LibroMisurabile[], d: DimModulo = MODULO): RisultatoLayout {
  const ripiani = ripianiDi(d);
  const posti: Posto[] = [];
  if (libri.length === 0) return { posti, moduli: 1, ripiani };

  const misure = libri.map((l) => misura(l, ripiani[0]!, d));

  // 1° passaggio: quante file servono riempiendo a saturazione.
  const sature = assegnaAiRipiani(misure, ripiani, d, Number.MAX_SAFE_INTEGER);
  const moduliNecessari = Math.max(1, Math.ceil(sature.length / ripiani.length));

  // 2° passaggio: con lo stesso numero di moduli, distribuiamo i libri su tutti
  // i ripiani disponibili. Se la ripartizione non stesse (file troppo lunghe),
  // si torna alla disposizione a saturazione.
  const ripianiTotali = moduliNecessari * ripiani.length;
  const distribuite = assegnaAiRipiani(
    misure,
    ripiani,
    d,
    tettiPerRipiano(misure.length, ripianiTotali),
  );
  const righe = distribuite.length <= ripianiTotali ? distribuite : sature;

  righe.forEach((fila, indiceFila) => {
    const modulo = Math.floor(indiceFila / ripiani.length);
    const iRip = indiceFila % ripiani.length;
    const r = ripiani[iRip]!;

    // fila centrata nel vano
    const totale = fila.reduce((s, m) => s + m.slot, 0) + d.gap * Math.max(0, fila.length - 1);
    let cursore = -totale / 2;

    for (const m of fila) {
      posti.push({
        id: m.id,
        modulo,
        ripiano: iRip,
        x: cursore + m.slot / 2,
        yBase: r.superficie,
        z: r.zFronte - d.rientroFronte - m.spessore / 2,
        larghezza: m.larghezza,
        altezza: m.altezza,
        spessore: m.spessore,
        slot: m.slot,
      });
      cursore += m.slot + d.gap;
    }
  });

  const moduli = Math.max(1, Math.ceil(righe.length / ripiani.length));
  return { posti, moduli, ripiani };
}

/** Quanti libri entrano in un modulo, con le altezze tipiche. */
export function capacitaModulo(d: DimModulo = MODULO): number {
  const finti = Array.from({ length: 400 }, (_, i) => ({ id: `capienza-${i}` }));
  const r = disponiLibri(finti, d);
  return r.posti.filter((p) => p.modulo === 0).length;
}

export interface Violazione {
  id: string;
  motivo: string;
}

/**
 * Controllo automatico dei limiti: ogni libro deve stare dentro il proprio
 * ripiano e non toccare il vicino. Usato in sviluppo e dal test della scena.
 */
export function verificaPosti(
  posti: Posto[],
  ripiani: RipianoGeom[],
  d: DimModulo = MODULO,
): Violazione[] {
  const eps = 1e-4;
  const violazioni: Violazione[] = [];
  const perRipiano = new Map<string, Posto[]>();

  for (const p of posti) {
    const r = ripiani[p.ripiano];
    if (!r) {
      violazioni.push({ id: p.id, motivo: `ripiano ${p.ripiano} inesistente` });
      continue;
    }
    if (p.x - p.larghezza / 2 < r.xMin - eps || p.x + p.larghezza / 2 > r.xMax + eps) {
      violazioni.push({ id: p.id, motivo: "esce lateralmente dal mobile" });
    }
    if (p.yBase < r.superficie - eps) {
      violazioni.push({ id: p.id, motivo: "affonda nel ripiano" });
    }
    if (p.yBase + p.altezza > r.superficie + r.altezzaUtile + eps) {
      violazioni.push({ id: p.id, motivo: "sfonda il ripiano superiore" });
    }
    if (p.z + p.spessore / 2 > r.zFronte + eps) {
      violazioni.push({ id: p.id, motivo: "sporge dal fronte" });
    }
    if (p.z - p.spessore / 2 < r.zFondo - eps) {
      violazioni.push({ id: p.id, motivo: "attraversa il fondo" });
    }
    if (p.larghezza > p.slot + eps) {
      violazioni.push({ id: p.id, motivo: "più largo dello spazio riservato" });
    }
    // Il confronto ha senso solo fra libri dello stesso ripiano dello stesso
    // mobile: sezioni diverse sono mobili diversi, in punti diversi della sala.
    const chiave = `${p.gruppo ?? ""}:${p.modulo}:${p.ripiano}`;
    const lista = perRipiano.get(chiave) ?? [];
    lista.push(p);
    perRipiano.set(chiave, lista);
  }

  for (const lista of perRipiano.values()) {
    const ordinati = [...lista].sort((a, b) => a.x - b.x);
    for (let i = 1; i < ordinati.length; i++) {
      const prec = ordinati[i - 1]!;
      const cur = ordinati[i]!;
      if (cur.x - cur.larghezza / 2 < prec.x + prec.larghezza / 2 - eps) {
        violazioni.push({ id: cur.id, motivo: `si sovrappone a ${prec.id}` });
      }
    }
  }

  void d;
  return violazioni;
}

/**
 * Misure definitive di un libro quando si conosce la proporzione reale della
 * copertina.
 *
 * La proporzione dell'immagine viene rispettata sempre: mai una copertina
 * schiacciata o stirata. Se con l'altezza prevista il libro sfonderebbe lo
 * spazio riservato (copertine quadrate o panoramiche), invece di deformarla si
 * abbassa il libro — resta appoggiato al ripiano, semplicemente più basso.
 */
export function adattaLibro(
  altezza: number,
  aspetto: number,
  slot: number,
): { larghezza: number; altezza: number } {
  const a = aspetto > 0.05 && Number.isFinite(aspetto) ? aspetto : ASPETTO_STD;
  let h = altezza;
  let w = h / a;
  if (w > slot) {
    w = slot;
    h = slot * a;
  }
  return { larghezza: w, altezza: h };
}
