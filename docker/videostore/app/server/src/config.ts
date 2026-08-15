export interface Config {
  host: string;
  port: number;
  publicDir: string;
  jellyfinUrl: string;
  jellyfinApiKey: string;
  /** Facoltativa: per il tabellone delle uscite reali del mese (TMDb). */
  tmdbApiKey: string;
  /** Alternativa senza account TMDb: passa da Jellyseerr, che già ce l'ha. */
  jellyseerrUrl: string;
  jellyseerrApiKey: string;
  /** Senza API key il server risponde con dati finti: utile per sviluppare la UI. */
  mockMode: boolean;
}

export function loadConfig(): Config {
  const jellyfinApiKey = process.env["JELLYFIN_API_KEY"] ?? "";
  return {
    host: process.env["HTTP_HOST"] ?? "0.0.0.0",
    port: Number(process.env["HTTP_PORT"] ?? 8091),
    publicDir: process.env["PUBLIC_DIR"] ?? "",
    jellyfinUrl: (process.env["JELLYFIN_URL"] ?? "http://192.168.0.33:8096").replace(/\/+$/, ""),
    jellyfinApiKey,
    tmdbApiKey: process.env["TMDB_API_KEY"] ?? "",
    jellyseerrUrl: (process.env["JELLYSEERR_URL"] ?? "").replace(/\/+$/, ""),
    jellyseerrApiKey: process.env["JELLYSEERR_API_KEY"] ?? "",
    mockMode: jellyfinApiKey === "",
  };
}
