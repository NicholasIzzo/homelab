import type { PlayDevice, StoreItem } from "./types.js";

/**
 * Dati finti per sviluppare la UI senza API key Jellyfin.
 * Titoli inventati: niente diritti, niente copertine vere.
 */
const MOCK_DEFS: [title: string, year: number, genre: string, type: "movie" | "series"][] = [
  ["Luna di Cromo", 1987, "Fantascienza", "movie"],
  ["Il Viandante Stellare", 1979, "Fantascienza", "movie"],
  ["Nebulosa 9", 1994, "Fantascienza", "movie"],
  ["La Casa sul Crinale", 1981, "Horror", "movie"],
  ["Notte di Cera", 1988, "Horror", "movie"],
  ["Il Sussurro", 1996, "Horror", "movie"],
  ["Operazione Falco", 1990, "Azione", "movie"],
  ["Codice Vulcano", 1993, "Azione", "movie"],
  ["L'Ultimo Confine", 1985, "Avventura", "movie"],
  ["Un Matrimonio Quasi Perfetto", 1992, "Commedia", "movie"],
  ["Ferie Pericolose", 1989, "Commedia", "movie"],
  ["Il Contabile di Notte", 1995, "Thriller", "movie"],
  ["Doppio Indizio", 1991, "Giallo", "movie"],
  ["Le Stagioni di Anna", 1986, "Dramma", "movie"],
  ["Lettere da Torino", 1998, "Romantico", "movie"],
  ["Pixel il Robottino", 1997, "Animazione", "movie"],
  ["La Foresta Cantante", 1993, "Animazione", "movie"],
  ["Avventure in Cortile", 1994, "Famiglia", "movie"],
  ["Cronache del Faro", 1999, "Dramma", "series"],
  ["Distretto 12", 1997, "Crime", "series"],
  ["Stellaris", 2001, "Fantascienza", "series"],
];

export function mockLibrary(): StoreItem[] {
  return MOCK_DEFS.map(([title, year, genre, type], i) => ({
    id: `mock-${i}`,
    title,
    type,
    year,
    overview:
      "Trama di prova per lo sviluppo del negozio. Quando colleghi la API key di Jellyfin qui compare la sinossi vera del titolo, presa dai metadati della tua libreria.",
    genres: [genre],
    officialRating: i % 3 === 0 ? "T" : null,
    communityRating: 5 + ((i * 7) % 50) / 10,
    runtimeMinutes: type === "movie" ? 88 + ((i * 13) % 60) : null,
    hasImage: true,
    dateCreated: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(),
  }));
}

export function mockDevices(): PlayDevice[] {
  return [
    {
      sessionId: "mock-tv",
      deviceName: "TV Salotto (finta)",
      client: "Wholphin",
      userName: "nicholas",
      nowPlaying: null,
      lastActivity: new Date().toISOString(),
    },
  ];
}

const PALETTE = ["#c0392b", "#8e44ad", "#2471a3", "#1e8449", "#b7950b", "#a04000", "#5d6d7e"];

/** Copertina segnaposto: SVG con titolo, stile scatola VHS. */
export function mockCoverSvg(id: string, title: string): string {
  const idx = Number(id.replace("mock-", "")) || 0;
  const bg = PALETTE[idx % PALETTE.length];
  const words = title.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > 12) {
      lines.push(line.trim());
      line = w;
    } else {
      line = (line + " " + w).trim();
    }
  }
  if (line) lines.push(line);
  const tspans = lines
    .map((l, i) => `<tspan x="150" dy="${i === 0 ? 0 : 34}">${l.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</tspan>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450">
  <rect width="300" height="450" fill="${bg}"/>
  <rect x="14" y="14" width="272" height="422" fill="none" stroke="#ffffff55" stroke-width="3"/>
  <text x="150" y="${225 - (lines.length - 1) * 17}" text-anchor="middle" font-family="Georgia, serif" font-size="28" font-weight="bold" fill="#fff">${tspans}</text>
  <text x="150" y="410" text-anchor="middle" font-family="monospace" font-size="14" fill="#ffffffaa">VIDEOTECA · DEMO</text>
</svg>`;
}
