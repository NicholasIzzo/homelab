/** Tema visivo di ogni scaffale: colore dell'insegna incantata e decorazione. */
export interface TemaScaffale {
  /** Colore dell'insegna luminosa (rune dorate/gemme). */
  luce: string;
  /** Emoji-sigillo dell'insegna. */
  icona: string;
  /** Motto inciso sul legno. */
  motto: string;
}

const TEMI: Record<string, TemaScaffale> = {
  recenti: { luce: "#ffd98a", icona: "✦", motto: "Appena sussurrati dal destino" },
  draghi: { luce: "#ff7a3c", icona: "🐉", motto: "Qui dormono le fiamme" },
  fae: { luce: "#46e0c0", icona: "🧚", motto: "Non fidarti di una corte gentile" },
  oscuri: { luce: "#d8467e", icona: "🖤", motto: "Ogni patto ha un prezzo" },
  misteri: { luce: "#9a7bff", icona: "🔮", motto: "Chi ha spento le candele?" },
  epica: { luce: "#e0a94a", icona: "⚔️", motto: "Troni che tremano, imperi che cadono" },
  cuori: { luce: "#ff5d8f", icona: "❤️‍🔥", motto: "Batticuore garantito" },
  sospiri: { luce: "#b9a7ff", icona: "✨", motto: "Desideri senza nome" },
  desideri: { luce: "#f6b45a", icona: "⭐", motto: "Ancora da conquistare" },
};

const FALLBACK: TemaScaffale = TEMI["sospiri"]!;

export const temaDi = (scaffaleId: string): TemaScaffale => TEMI[scaffaleId] ?? FALLBACK;
