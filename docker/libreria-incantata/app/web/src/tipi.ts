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
  fonte: "goodreads" | "amazon";
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
