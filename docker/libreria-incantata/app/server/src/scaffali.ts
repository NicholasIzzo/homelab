import type { Libro, Scaffale } from "./tipi.js";

/**
 * Gli scaffali tematici della biblioteca.
 *
 * L'RSS di Goodreads non espone i generi, quindi la classificazione avviene in
 * tre passaggi, dal più preciso al più generico:
 *   1. mappa curata titolo → scaffale (generi verificati a mano, uno per uno);
 *   2. regole per autore/serie (una saga sta tutta sullo stesso scaffale);
 *   3. euristica a parole chiave, per i libri aggiunti in futuro.
 * Così i titoli di oggi stanno al posto giusto e quelli nuovi non finiscono
 * comunque nel vuoto.
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
    parole: ["drago", "draghi", "dragon", "dragonier", "wyvern", "drake"],
  },
  {
    id: "fae",
    nome: "Le Corti dei Fae",
    parole: ["fae", "faerie", "fairy", "fata", "folletto", "seelie", "elf", "elfi", "corte dei"],
  },
  {
    id: "creature",
    nome: "Creature della Notte",
    parole: [
      "vampir", "licantrop", "lupo", "wolf", "werewolf", "demone", "demoni", "demon",
      "angel", "angelo", "fantasma", "spettr", "ghost", "morti", "non-morti", "shifter",
    ],
  },
  {
    id: "oscuri",
    nome: "I Patti Oscuri",
    parole: [
      "dark", "oscur", "wicked", "twisted", "psycho", "sin ", "peccat", "vendetta",
      "mafia", "killer", "sicari", "cattiv", "villain", "corrupt", "cruel", "spietat",
    ],
  },
  {
    id: "magia",
    nome: "Magia & Accademie",
    parole: [
      "strega", "streghe", "witch", "wicca", "magia", "magic", "incantesim", "spell",
      "academy", "accademia", "school", "scuola", "college", "sortileg", "rune",
    ],
  },
  {
    id: "miti",
    nome: "Miti & Leggende",
    parole: [
      "achille", "olimpo", "olymp", "hades", "ade ", "persefone", "persephone", "zeus",
      "dio ", "dei ", "dea ", "god", "goddess", "mito", "myth", "titan", "eros", "medusa",
    ],
  },
  {
    id: "epica",
    nome: "Saghe & Imperi",
    parole: [
      "impero", "empire", "trono", "throne", "regno", "kingdom", "corona", "crown",
      "guerra", "war", "spada", "sword", "sangue e", "ember", "ashes", "cenere",
      "profezia", "prophecy", "ribell", "rebel", "hierarchy",
    ],
  },
  {
    id: "distopie",
    nome: "Mondi Spezzati",
    parole: ["distop", "dystop", "post-apocali", "apocali", "resistenza", "ribellione"],
  },
  {
    id: "misteri",
    nome: "Gli Enigmi Sussurrati",
    parole: [
      "mistero", "mystery", "giallo", "thriller", "indagin", "detective", "omicidi",
      "murder", "caso ", "delitto", "scomparsa", "codice",
    ],
  },
  {
    id: "cuori",
    nome: "I Cuori in Fiamme",
    parole: [
      "love", "loving", "amore", "amare", "kiss", "bacio", "baci", "heart", "cuore",
      "romance", "romant", "bride", "sposa", "wedding", "matrimonio", "campus",
      "beach", "summer", "estate", "promise", "promessa", "you", "me ", "her ", "him ",
    ],
  },
];

/** Etichette degli scaffali "speciali", non tematici. */
export const NOMI_SPECIALI: Record<string, string> = {
  sospiri: "Lo Scaffale dei Sospiri",
  recenti: "Appena Sussurrati",
  desideri: "Il Sentiero dei Desideri",
};

/** Normalizza un titolo per il confronto: minuscolo, senza accenti né punteggiatura. */
export function normalizza(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Generi verificati a mano (fonte: schede editore, Goodreads, recensioni).
 * La chiave è il titolo normalizzato, confrontato per intero o come prefisso:
 * basta la parte distintiva, senza sottotitoli ed edizioni.
 */
const PER_TITOLO: Record<string, string> = {
  // — draghi
  "volo di drago": "draghi",
  "when the moon hatched": "draghi",

  // — fae
  "a treachery of swans": "fae",
  "il principe crudele": "fae", // Folk of the Air, Holly Black
  "wicked": "fae", // Wicked Trilogy, fae di New Orleans
  "luna d inverno": "fae", // Winter Fe' Saga
  "la corte di sangue e vincoli": "fae", // Fae Isle
  "gleam": "fae", // Plated Prisoner
  "glint": "fae",
  "la prigioniera d oro": "fae",

  // — creature della notte
  "il serpente e le ali della notte": "creature", // vampiri, Crowns of Nyaxia
  "bitten": "creature", // licantropi
  "cuore di demone": "creature",
  "fallen gods": "creature",
  "loving the demon": "creature",
  "quasi morti del tutto": "creature", // misteri del cimitero di Grimdale

  // — patti oscuri (dark romance)
  "unrepentaint": "oscuri",
  "twisted game": "oscuri", // Filthy Wicked Psychos
  "silence noise": "oscuri", // dark romance, non un giallo
  "priceless": "oscuri",
  "la casa di sale e lacrime": "oscuri", // gotico
  "uncino": "oscuri", // Hooked, retelling dark di Peter Pan
  "house of bane and blood": "oscuri",

  // — magia & accademie
  "koster academy": "magia",
  "la cacciatrice": "magia", // Witch Academy
  "wicca creed": "magia",
  "caraval": "magia",

  // — miti & leggende
  "la canzone di achille": "miti",
  "a touch of darkness": "miti", // Ade & Persefone
  "a promise of fire": "miti", // Kingmaker Chronicles

  // — saghe & imperi
  "the will of the many": "epica",
  "an ember in the ashes": "epica",
  "shield of sparrows": "epica", // romantasy epico
  "the dagger and the flame": "epica",
  "figli di sangue e ossa": "epica",
  "dungeon crawler carl": "epica",

  // — mondi spezzati (distopie)
  "shatter me": "distopie",
  "e17": "distopie", // E17. La vera storia di Coraline

  // — enigmi (thriller/giallo)
  "il caso alaska sanders": "misteri",
  "il codice da vinci": "misteri",

  // — cuori in fiamme (romance contemporaneo/new adult)
  "royal tale": "cuori",
  "una ragazza d altri tempi": "cuori",
  "supermad": "cuori",
  "the bride test": "cuori",
  "the heart principle": "cuori",
  "beach read": "cuori",
  "if you promise": "cuori",
  "il ladro di baci": "cuori",
  "giulietta e romeo": "cuori",
  "mile high": "cuori",
  "meet me here": "cuori",
  "chained love": "cuori", // hockey romance
  "wings": "cuori", // Red Oak Manor, romance contemporaneo
  "my baby": "cuori",

  // — fuori genere
  "il miglio verde": "sospiri",
};

/** Una saga o un autore stanno sempre sullo stesso scaffale. */
const PER_AUTORE: { autore: string; scaffale: string }[] = [
  { autore: "raven kennedy", scaffale: "fae" },
  { autore: "helen hoang", scaffale: "cuori" },
  { autore: "emily henry", scaffale: "cuori" },
  { autore: "holly black", scaffale: "fae" },
  { autore: "carissa broadbent", scaffale: "creature" },
  { autore: "scarlett st clair", scaffale: "miti" },
  { autore: "madeline miller", scaffale: "miti" },
  { autore: "joel dicker", scaffale: "misteri" },
  { autore: "dan brown", scaffale: "misteri" },
  { autore: "anne mccaffrey", scaffale: "draghi" },
];

const IDS_VALIDI = new Set([...SCAFFALI.map((s) => s.id), "sospiri"]);

/** Chiavi curate ordinate dalla più lunga: "wicca creed" batte "wicca". */
const CHIAVI_TITOLO = Object.keys(PER_TITOLO).sort((a, b) => b.length - a.length);

export function scaffaleDi(libro: Libro): string {
  const titolo = normalizza(libro.titolo);
  const breve = normalizza(libro.titoloBreve);

  // 1. mappa curata: prima esatta, poi per prefisso (salta sottotitoli/edizioni)
  const esatta = PER_TITOLO[breve] ?? PER_TITOLO[titolo];
  if (esatta) return esatta;
  for (const chiave of CHIAVI_TITOLO) {
    if (breve === chiave || breve.startsWith(chiave + " ") || titolo.startsWith(chiave + " ")) {
      return PER_TITOLO[chiave]!;
    }
  }

  // 2. autore/serie
  const autore = normalizza(libro.autore);
  for (const regola of PER_AUTORE) {
    if (autore.includes(regola.autore)) return regola.scaffale;
  }

  // 3. euristica a parole chiave su titolo + serie (la trama è troppo rumorosa:
  //    ogni quarta di copertina fantasy nomina "corte", "sangue", "oscurità").
  const testo = `${titolo} ${normalizza(libro.serie ?? "")} `;
  for (const def of SCAFFALI) {
    if (def.parole.some((p) => testo.includes(normalizza(p)))) return def.id;
  }
  return "sospiri";
}

/** Rete di sicurezza: uno scaffale inesistente farebbe sparire il libro. */
export function scaffaleValido(id: string): string {
  return IDS_VALIDI.has(id) ? id : "sospiri";
}

const RECENTI_SIZE = 10;

/**
 * Raggruppa i libri negli scaffali tematici, più "Appena Sussurrati" con gli
 * ultimi arrivi. Nessun libro può andare perso: quelli senza scaffale finiscono
 * comunque fra i "Sospiri".
 */
export function costruisciScaffali(libri: Libro[]): Scaffale[] {
  const perScaffale = new Map<string, Libro[]>();
  for (const libro of libri) {
    const id = scaffaleValido(libro.scaffale);
    const list = perScaffale.get(id) ?? [];
    list.push(libro);
    perScaffale.set(id, list);
  }

  const scaffali: Scaffale[] = [];

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
