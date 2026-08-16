/**
 * Personalizzazione della biblioteca: essenza del legno, luce dei ripiani e
 * atmosfera della sala. Le scelte restano su questo dispositivo
 * (localStorage), così ognuno può avere la "sua" biblioteca.
 */

export interface Essenza {
  id: string;
  nome: string;
  /** Tinta base del legno, in RGB 0-255. */
  rgb: [number, number, number];
  /** Seme del disegno delle venature. */
  seme: number;
  /** Anteprima per il pannello. */
  campione: string;
}

export const ESSENZE: Essenza[] = [
  { id: "noce", nome: "Noce scuro", rgb: [86, 52, 33], seme: 3, campione: "#56341f" },
  { id: "rovere", nome: "Rovere chiaro", rgb: [150, 112, 68], seme: 8, campione: "#967044" },
  { id: "ebano", nome: "Ebano", rgb: [48, 40, 40], seme: 21, campione: "#302828" },
  { id: "ciliegio", nome: "Ciliegio", rgb: [124, 60, 40], seme: 14, campione: "#7c3c28" },
  { id: "betulla", nome: "Betulla chiara", rgb: [178, 148, 104], seme: 31, campione: "#b29468" },
  { id: "verdespina", nome: "Verde spina", rgb: [66, 84, 62], seme: 27, campione: "#42543e" },
];

export interface Luce {
  id: string;
  nome: string;
  /** Colore della striscia LED; null = usa il colore del tema della sezione. */
  colore: string | null;
}

export const LUCI: Luce[] = [
  { id: "calda", nome: "Candela calda", colore: "#fff1dc" },
  { id: "neutra", nome: "Bianco neutro", colore: "#f4f7ff" },
  { id: "incantata", nome: "Incantata (colore del genere)", colore: null },
];

export interface Atmosfera {
  id: string;
  nome: string;
  /** Colore di fondo e nebbia. */
  fondo: number;
  /** Tinta della luce ambientale. */
  ambiente: number;
  /** Colore delle pareti. */
  pareti: number;
  /** Colore del tappeto centrale. */
  tappeto: number;
  campione: string;
}

export const ATMOSFERE: Atmosfera[] = [
  { id: "notte", nome: "Notte stellata", fondo: 0x0a0713, ambiente: 0x4a3c6a, pareti: 0xffffff, tappeto: 0x3d1330, campione: "#1a1030" },
  { id: "bosco", nome: "Bosco incantato", fondo: 0x061410, ambiente: 0x2f5a46, pareti: 0x9fd8bd, tappeto: 0x24402c, campione: "#0d2a20" },
  { id: "tramonto", nome: "Tramonto d'ambra", fondo: 0x180a06, ambiente: 0x7a4a2a, pareti: 0xffd9b0, tappeto: 0x5a2418, campione: "#3a1a0c" },
  { id: "ghiaccio", nome: "Regno di ghiaccio", fondo: 0x061019, ambiente: 0x3c5a78, pareti: 0xbcdcf5, tappeto: 0x1c3a52, campione: "#0e2438" },
];

export interface Preferenze {
  essenza: string;
  luce: string;
  atmosfera: string;
  /** Decori fantasy (lanterne, candelabri, rune, ampolle). */
  decori: boolean;
}

export const PREFERENZE_INIZIALI: Preferenze = {
  essenza: "noce",
  luce: "calda",
  atmosfera: "notte",
  decori: true,
};

const CHIAVE = "biblioteca-incantata:preferenze";

export function leggiPreferenze(): Preferenze {
  try {
    const grezzo = localStorage.getItem(CHIAVE);
    if (!grezzo) return PREFERENZE_INIZIALI;
    const p = JSON.parse(grezzo) as Partial<Preferenze>;
    return {
      essenza: ESSENZE.some((e) => e.id === p.essenza) ? p.essenza! : PREFERENZE_INIZIALI.essenza,
      luce: LUCI.some((l) => l.id === p.luce) ? p.luce! : PREFERENZE_INIZIALI.luce,
      atmosfera: ATMOSFERE.some((a) => a.id === p.atmosfera)
        ? p.atmosfera!
        : PREFERENZE_INIZIALI.atmosfera,
      decori: typeof p.decori === "boolean" ? p.decori : PREFERENZE_INIZIALI.decori,
    };
  } catch {
    return PREFERENZE_INIZIALI;
  }
}

export function salvaPreferenze(p: Preferenze) {
  try {
    localStorage.setItem(CHIAVE, JSON.stringify(p));
  } catch {
    /* modalità privata o spazio esaurito: pazienza, restano per questa sessione */
  }
}

export const essenzaDi = (id: string): Essenza => ESSENZE.find((e) => e.id === id) ?? ESSENZE[0]!;
export const luceDi = (id: string): Luce => LUCI.find((l) => l.id === id) ?? LUCI[0]!;
export const atmosferaDi = (id: string): Atmosfera =>
  ATMOSFERE.find((a) => a.id === id) ?? ATMOSFERE[0]!;
