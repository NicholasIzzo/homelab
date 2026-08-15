/** Un libro, comune a Goodreads (da leggere) e Amazon (desideri). */
export interface Libro {
  id: string;
  titolo: string;
  /** Titolo senza la parte "(Serie #n)" — per etichette compatte sugli scaffali. */
  titoloBreve: string;
  autore: string;
  serie: string | null;
  descrizione: string;
  pagine: number | null;
  votoMedio: number | null;
  anno: number | null;
  /** Pagina esterna del libro (Goodreads o Amazon). */
  link: string;
  /** Id dello scaffale tematico. */
  scaffale: string;
  fonte: "goodreads" | "amazon";
  /** Solo desideri Amazon. */
  prezzo: string | null;
  formato: string | null;
  /** Data di aggiunta alla lista (ISO), per l'ordine "aggiunti di recente". */
  aggiunto: string | null;
}

export interface Scaffale {
  id: string;
  nome: string;
  libri: Libro[];
}

export interface BibliotecaPayload {
  /** Nome del profilo Goodreads, per personalizzare l'insegna. */
  lettrice: string;
  scaffali: Scaffale[];
  desideri: Libro[];
  mock: boolean;
}
