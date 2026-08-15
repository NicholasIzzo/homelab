import type { Libro } from "./tipi.js";
import { scaffaleDi } from "./scaffali.js";

/** Qualche titolo finto per sviluppare la UI senza Goodreads (MOCK=1). */
const SEMI: { titolo: string; autore: string; anno: number; voto: number; pagine: number }[] = [
  { titolo: "La Regina dei Draghi Sopiti (Fiamme d'Ambra #1)", autore: "Elowen Vance", anno: 2021, voto: 4.3, pagine: 512 },
  { titolo: "Corte di Spine e Rugiada (I Fae di Vetro #2)", autore: "Maris Thornwood", anno: 2022, voto: 4.5, pagine: 448 },
  { titolo: "Il Patto del Demone Gentile", autore: "Ravenna Sole", anno: 2020, voto: 3.9, pagine: 388 },
  { titolo: "Sangue e Inchiostro d'Ombra", autore: "Cassia Nero", anno: 2023, voto: 4.1, pagine: 401 },
  { titolo: "Il Codice della Torre Silente (Enigmi #1)", autore: "Dorian Vesper", anno: 2019, voto: 4.0, pagine: 356 },
  { titolo: "La Canzone dell'Impero Caduto", autore: "Aurelio Fenn", anno: 2018, voto: 4.4, pagine: 623 },
  { titolo: "Cuori di Brace e Neve (Campus Reale #1)", autore: "Lia Sorrentino", anno: 2024, voto: 4.2, pagine: 298 },
  { titolo: "Una Promessa sotto la Luna d'Inverno", autore: "Bianca Ferro", anno: 2021, voto: 3.8, pagine: 274 },
  { titolo: "Uncino e Marea", autore: "Selene Marlowe", anno: 2022, voto: 4.6, pagine: 512 },
  { titolo: "L'Accademia delle Streghe Perdute", autore: "Nyx Ambrose", anno: 2020, voto: 4.0, pagine: 430 },
];

export function catalogoMock(): { lettrice: string; libri: Libro[] } {
  const libri = SEMI.map((s, i): Libro => {
    const m = s.titolo.match(/^(.*?)\s*\(([^()]*#\s*\d+)\)\s*$/);
    const libro: Libro = {
      id: `mock-${i}`,
      titolo: s.titolo,
      titoloBreve: m?.[1]?.trim() ?? s.titolo,
      autore: s.autore,
      serie: m?.[2]?.trim() ?? null,
      descrizione: "Un titolo di prova per la modalità dimostrativa della biblioteca incantata.",
      pagine: s.pagine,
      votoMedio: s.voto,
      anno: s.anno,
      link: "https://www.goodreads.com",
      scaffale: "sospiri",
      copertinaVer: "mock",
      fonte: "goodreads",
      prezzo: null,
      formato: null,
      aggiunto: new Date(Date.now() - i * 86400_000).toISOString(),
    };
    libro.scaffale = scaffaleDi(libro);
    return libro;
  });
  return { lettrice: "Ospite", libri };
}

const COLORI = ["#3a1d5e", "#5e1d3a", "#1d3a5e", "#1d5e3a", "#5e451d", "#45215e"];

export function copertinaMockSvg(id: string, titolo: string): string {
  const c = COLORI[Math.abs([...id].reduce((a, ch) => a + ch.charCodeAt(0), 0)) % COLORI.length];
  const righe = titolo.split(/\s+/).reduce<string[]>((acc, w) => {
    const ultima = acc[acc.length - 1];
    if (ultima && (ultima + " " + w).length <= 14) acc[acc.length - 1] = ultima + " " + w;
    else acc.push(w);
    return acc;
  }, []).slice(0, 6);
  const testo = righe
    .map((r, i) => `<text x="160" y="${170 + i * 42}" text-anchor="middle" font-family="Georgia, serif" font-size="26" fill="#f3e9d2">${r.replace(/[<&>]/g, "")}</text>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="480" viewBox="0 0 320 480">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${c}"/><stop offset="1" stop-color="#12091f"/></linearGradient></defs>
  <rect width="320" height="480" fill="url(#g)"/>
  <rect x="10" y="10" width="300" height="460" fill="none" stroke="#c9a24b" stroke-width="3" opacity="0.7"/>
  <circle cx="160" cy="70" r="26" fill="none" stroke="#c9a24b" stroke-width="2" opacity="0.6"/>
  <text x="160" y="80" text-anchor="middle" font-size="30" fill="#c9a24b">✦</text>
  ${testo}
</svg>`;
}
