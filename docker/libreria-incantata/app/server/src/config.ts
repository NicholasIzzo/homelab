export interface Config {
  host: string;
  port: number;
  publicDir: string;
  /** Id numerico del profilo Goodreads (dalla URL della lista). */
  goodreadsUserId: string;
  /** Scaffale Goodreads da leggere (di norma "to-read"). */
  goodreadsShelf: string;
  /** Percorso del JSON con i desideri Amazon. */
  desideriPath: string;
  /** Nome mostrato sull'insegna della biblioteca. */
  lettrice: string;
  /** Forza i dati finti anche con Goodreads raggiungibile (sviluppo UI). */
  mockMode: boolean;
  /**
   * Istanza esposta a Internet: attiva il limite di richieste. Non cambia i
   * dati mostrati — per una demo pubblica va comunque abbinata a MOCK=1, così
   * non si pubblica la biblioteca di casa.
   */
  pubblica: boolean;
}

export function loadConfig(): Config {
  return {
    host: process.env["HTTP_HOST"] ?? "0.0.0.0",
    port: Number(process.env["HTTP_PORT"] ?? 8092),
    publicDir: process.env["PUBLIC_DIR"] ?? "",
    goodreadsUserId: (process.env["GOODREADS_USER_ID"] ?? "130636342").trim(),
    goodreadsShelf: (process.env["GOODREADS_SHELF"] ?? "to-read").trim(),
    desideriPath: process.env["DESIDERI_PATH"] ?? "",
    lettrice: process.env["LETTRICE"] ?? "",
    mockMode: process.env["MOCK"] === "1",
    pubblica: process.env["PUBBLICA"] === "1",
  };
}
