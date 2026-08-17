import { fetchBiblioteca } from "./api";
import { elencoVoci, type VoceArchivio } from "./epub/archivio";
import { nomeScaffale, regole } from "./epub/generi";
import type { BibliotecaPayload, Libro, Scaffale } from "./tipi";

/**
 * Da dove arrivano i libri.
 *
 * La scena 3D non lo sa e non deve saperlo: riceve scaffali già pronti. Questo
 * modulo è l'unico punto in cui cambia la provenienza — la biblioteca personale
 * servita dal server, oppure gli EPUB importati su questo dispositivo.
 */
export type NomeSorgente = "server" | "epub";

const RECENTI = 10;

/** Costruisce gli scaffali dai libri, come fa il server per Goodreads. */
function raggruppa(libri: Libro[], nome: (id: string) => string): Scaffale[] {
  const per = new Map<string, Libro[]>();
  for (const l of libri) {
    const lista = per.get(l.scaffale) ?? [];
    lista.push(l);
    per.set(l.scaffale, lista);
  }
  const scaffali: Scaffale[] = [];

  const recenti = [...libri]
    .filter((l) => l.aggiunto)
    .sort((a, b) => (b.aggiunto ?? "").localeCompare(a.aggiunto ?? ""))
    .slice(0, RECENTI);
  if (recenti.length > 0) scaffali.push({ id: "recenti", nome: "Appena Sussurrati", libri: recenti });

  for (const [id, lista] of [...per].sort((a, b) => b[1].length - a[1].length)) {
    if (id === "sospiri") continue;
    scaffali.push({ id, nome: nome(id), libri: lista });
  }
  const sospiri = per.get("sospiri");
  if (sospiri?.length) scaffali.push({ id: "sospiri", nome: nome("sospiri"), libri: sospiri });
  return scaffali;
}

/** Una voce dell'archivio locale diventa un libro come gli altri. */
export function vocaALibro(v: VoceArchivio): Libro {
  return {
    id: v.id,
    titolo: v.titolo,
    titoloBreve: v.titolo.replace(/\s*\([^)]*\)\s*$/, "").trim() || v.titolo,
    autore: v.autore,
    serie: null,
    descrizione: v.descrizione,
    pagine: null,
    votoMedio: null,
    anno: v.anno,
    link: "",
    scaffale: v.scaffale,
    copertinaVer: "locale",
    copertinaUrl: v.copertina ? URL.createObjectURL(v.copertina) : undefined,
    capitoli: v.capitoli,
    fonte: "epub",
    prezzo: null,
    formato: v.nomeFile.replace(/^.*\./, "").toUpperCase(),
    aggiunto: v.aggiunto,
  };
}

export async function caricaBiblioteca(sorgente: NomeSorgente): Promise<BibliotecaPayload> {
  if (sorgente === "server") return fetchBiblioteca();

  const [voci, r] = await Promise.all([elencoVoci(), regole()]);
  const libri = voci.map(vocaALibro);
  return {
    lettrice: "la tua biblioteca",
    scaffali: raggruppa(libri, (id) => nomeScaffale(id, r)),
    desideri: [],
    mock: false,
  };
}

/** Quanti libri ci sono già sul dispositivo: decide la schermata d'ingresso. */
export async function libriLocali(): Promise<number> {
  try {
    return (await elencoVoci()).length;
  } catch {
    return 0;
  }
}
