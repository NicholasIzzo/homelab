import type { Libro, Scaffale } from "./tipi.js";

/**
 * La libreria "da leggere" non porta con sé i generi (Goodreads non li espone
 * nell'RSS di uno scaffale). Li deduciamo con parole chiave su titolo, serie e
 * descrizione: un'euristica leggera, giusto per dare atmosfera agli scaffali.
 * Ogni libro finisce nel PRIMO scaffale che combacia, nell'ordine qui sotto;
 * chi non combacia va nel catch-all "sospiri".
 */
export interface DefScaffale {
  id: string;
  nome: string;
  parole: string[];
}

export const SCAFFALI: DefScaffale[] = [
  {
    id: "draghi",
    nome: "L'Antro dei Draghi",
    parole: ["drago", "draghi", "dragon", "dragonier", "wyvern", "drake", "pern", "moon hatched", "hatch"],
  },
  {
    id: "fae",
    nome: "Le Corti dei Fae",
    parole: ["fae", "fata", "fate", "faerie", "fairy", "corte", "court", "elf", "elfi", "seelie", "sparrow", "swan", "cigno", "fantome", "nebbia", "wicca", "gleam", "glint", "glimmer", "gild", "prigioniera d'oro", "wings", "ali della notte", "serpente"],
  },
  {
    id: "oscuri",
    nome: "I Patti Oscuri",
    parole: ["demon", "demone", "dark", "oscur", "wicked", "psycho", "twisted", "sin", "hell", "inferno", "vampir", "hades", "morte", "morti", "death", "bane", "blood", "sangue", "cimitero", "grim", "shadow", "ombra", "impenit", "unrepent", "darkness", "salt", "sale", "lacrime", "uncino", "hook"],
  },
  {
    id: "misteri",
    nome: "Gli Enigmi Sussurrati",
    parole: ["code", "codice", "caso", "case", "sanders", "vinci", "mystery", "mistero", "murder", "silence", "noise", "coraline", "treachery", "tradiment"],
  },
  {
    id: "epica",
    nome: "Saghe & Imperi",
    parole: ["ember", "ashes", "cenere", "sword", "spada", "throne", "trono", "war", "guerra", "hierarchy", "many", "empire", "impero", "shield", "scudo", "academy", "koster", "magic", "flame", "fiamma", "fuoco", "fire", "island", "isle", "will of", "ossa", "sangue e ossa", "achille", "canzone", "winter", "inverno", "luna", "moon", "caraval", "gods", "dei ", "fallen", "shatter"],
  },
  {
    id: "cuori",
    nome: "I Cuori in Fiamme",
    parole: ["love", "loving", "amore", "kiss", "bacio", "baci", "heart", "cuore", "bride", "sposa", "beach read", "romance", "romant", "promise", "promessa", "belle", "principe", "royal", "reale", "wedding", "matrimonio", "quotient", "quill", "supermad", "campus", "driver", "baby", "illusione", "d'altri tempi", "ragazza", "if you", "giulietta", "romeo", "mile high", "meet me", "priceless", "denari"],
  },
];

/** Etichette leggibili anche per gli scaffali "speciali" non tematici. */
export const NOMI_SPECIALI: Record<string, string> = {
  sospiri: "Lo Scaffale dei Sospiri",
  recenti: "Appena Sussurrati",
};

function testo(l: Libro): string {
  // Solo titolo, serie e autore: la descrizione è troppo rumorosa (ogni quarta
  // di copertina fantasy nomina "corte", "sangue", "oscurità"…) e squilibrerebbe
  // gli scaffali. Il titolo, invece, di solito dice bene di che pasta è il libro.
  return `${l.titolo} ${l.serie ?? ""} ${l.autore}`.toLowerCase();
}

export function scaffaleDi(libro: Libro): string {
  const t = testo(libro);
  for (const def of SCAFFALI) {
    if (def.parole.some((p) => t.includes(p))) return def.id;
  }
  return "sospiri";
}

const RECENTI_SIZE = 10;

/** Raggruppa i libri negli scaffali tematici, più uno scaffale "Appena Sussurrati". */
export function costruisciScaffali(libri: Libro[]): Scaffale[] {
  const perScaffale = new Map<string, Libro[]>();
  for (const libro of libri) {
    const list = perScaffale.get(libro.scaffale) ?? [];
    list.push(libro);
    perScaffale.set(libro.scaffale, list);
  }

  const scaffali: Scaffale[] = [];

  // Scaffale "Appena Sussurrati": gli ultimi aggiunti alla lista, in cima.
  const recenti = [...libri]
    .filter((l) => l.aggiunto !== null)
    .sort((a, b) => (b.aggiunto ?? "").localeCompare(a.aggiunto ?? ""))
    .slice(0, RECENTI_SIZE);
  if (recenti.length > 0) {
    scaffali.push({ id: "recenti", nome: NOMI_SPECIALI["recenti"]!, libri: recenti });
  }

  for (const def of SCAFFALI) {
    const list = perScaffale.get(def.id);
    if (list && list.length > 0) {
      scaffali.push({ id: def.id, nome: def.nome, libri: list });
    }
  }

  const sospiri = perScaffale.get("sospiri");
  if (sospiri && sospiri.length > 0) {
    scaffali.push({ id: "sospiri", nome: NOMI_SPECIALI["sospiri"]!, libri: sospiri });
  }

  return scaffali;
}
