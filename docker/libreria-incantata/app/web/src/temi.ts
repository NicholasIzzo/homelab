/** Tema visivo di ogni scaffale: colore della luce, sigillo e motto inciso. */
export interface TemaScaffale {
  /** Colore della striscia luminosa e dell'insegna. */
  luce: string;
  /** Emoji-sigillo dell'insegna. */
  icona: string;
  /** Motto inciso sul legno. */
  motto: string;
}

const TEMI: Record<string, TemaScaffale> = {
  recenti: { luce: "#ffd98a", icona: "✦", motto: "Appena sussurrati dal destino" },
  draghi: { luce: "#ff8a3c", icona: "🐉", motto: "Qui dormono le fiamme" },
  fae: { luce: "#57e3c2", icona: "🧚", motto: "Non fidarti di una corte gentile" },
  creature: { luce: "#8f7bff", icona: "🧛", motto: "Solo dopo il tramonto" },
  oscuri: { luce: "#e0507f", icona: "🖤", motto: "Ogni patto ha un prezzo" },
  magia: { luce: "#7fb3ff", icona: "⚡", motto: "Lezione uno: non evocare nulla" },
  miti: { luce: "#e8c46a", icona: "🏛️", motto: "Gli dèi ascoltano ancora" },
  epica: { luce: "#d9a34b", icona: "⚔️", motto: "Troni che tremano, imperi che cadono" },
  distopie: { luce: "#9fb4c8", icona: "🌆", motto: "Il mondo, dopo la crepa" },
  misteri: { luce: "#a68bff", icona: "🔮", motto: "Chi ha spento le candele?" },
  cuori: { luce: "#ff6f9d", icona: "❤️‍🔥", motto: "Batticuore garantito" },
  sospiri: { luce: "#c0aeea", icona: "✨", motto: "Storie senza scaffale" },
  desideri: { luce: "#f6b45a", icona: "⭐", motto: "Ancora da conquistare" },
};

const FALLBACK: TemaScaffale = TEMI["sospiri"]!;

export const temaDi = (scaffaleId: string): TemaScaffale => TEMI[scaffaleId] ?? FALLBACK;
