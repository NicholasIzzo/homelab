/** Tema visivo di ogni corsia: colori dell'insegna e decorazione. */
export interface TemaScaffale {
  /** Colore neon dell'insegna di corsia. */
  neon: string;
  /** Sfumatura di fondo della corsia. */
  fondo: string;
  /** Emoji decorativa dell'insegna. */
  icona: string;
  /** Frase da vetrina, stile cartello scritto a mano. */
  slogan: string;
}

const TEMI: Record<string, TemaScaffale> = {
  novita: { neon: "#ffd166", fondo: "#2a1e05", icona: "✨", slogan: "Appena arrivati!" },
  horror: { neon: "#ff2244", fondo: "#1a050b", icona: "🩸", slogan: "Vietato ai deboli di cuore" },
  fantascienza: { neon: "#22ddff", fondo: "#041a22", icona: "🛸", slogan: "Da un'altra galassia" },
  animazione: { neon: "#ff88dd", fondo: "#1e0a1a", icona: "🎈", slogan: "Colori a volontà" },
  azione: { neon: "#ff8822", fondo: "#211003", icona: "💥", slogan: "Adrenalina pura" },
  thriller: { neon: "#99aaff", fondo: "#0a0d1e", icona: "🔍", slogan: "Chi è stato?" },
  commedia: { neon: "#ffee44", fondo: "#201d04", icona: "🎭", slogan: "Risate garantite" },
  dramma: { neon: "#ff6688", fondo: "#1e070d", icona: "🌹", slogan: "Fazzoletti consigliati" },
  famiglia: { neon: "#66ff99", fondo: "#052012", icona: "🧸", slogan: "Per grandi e piccini" },
  serie: { neon: "#cc88ff", fondo: "#140a1e", icona: "📺", slogan: "Una puntata tira l'altra" },
  recenti: { neon: "#7dff6a", fondo: "#0a2005", icona: "🆕", slogan: "Appena scaffalati" },
  varie: { neon: "#aaaaaa", fondo: "#141414", icona: "🎬", slogan: "Perle nascoste" },
};

const FALLBACK: TemaScaffale = TEMI["varie"]!;

export const temaDi = (shelfId: string): TemaScaffale => TEMI[shelfId] ?? FALLBACK;
