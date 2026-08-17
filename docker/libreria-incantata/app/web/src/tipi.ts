export interface Libro {
  id: string;
  titolo: string;
  titoloBreve: string;
  autore: string;
  serie: string | null;
  descrizione: string;
  pagine: number | null;
  votoMedio: number | null;
  anno: number | null;
  link: string;
  scaffale: string;
  /** Impronta della copertina: entra nell'URL per invalidare la cache. */
  copertinaVer: string;
  /**
   * Copertina già disponibile localmente (EPUB importati): un blob URL da usare
   * al posto del proxy, perché quei file non passano dal server.
   */
  copertinaUrl?: string;
  /** Capitoli leggibili, presenti solo per i libri EPUB. */
  capitoli?: { percorso: string; tipo: string }[];
  fonte: "goodreads" | "amazon" | "epub";
  prezzo: string | null;
  formato: string | null;
  aggiunto: string | null;
}

export interface Scaffale {
  id: string;
  nome: string;
  libri: Libro[];
}

export interface BibliotecaPayload {
  lettrice: string;
  scaffali: Scaffale[];
  desideri: Libro[];
  mock: boolean;
}
