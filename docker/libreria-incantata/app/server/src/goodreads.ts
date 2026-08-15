import { XMLParser } from "fast-xml-parser";
import type { Libro } from "./tipi.js";
import { scaffaleDi } from "./scaffali.js";
import { hashBreve } from "./util.js";

/** Risultato del parsing: i libri + la mappa id→URL remoto della copertina. */
export interface Catalogo {
  lettrice: string;
  libri: Libro[];
  copertine: Map<string, string>;
}

const parser = new XMLParser({
  ignoreAttributes: true,
  cdataPropName: "__cdata",
  trimValues: true,
});

/** fast-xml-parser mette il testo o dentro __cdata o direttamente: uniformiamo. */
function testo(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("__cdata" in o) return testo(o["__cdata"]);
    if ("#text" in o) return testo(o["#text"]);
  }
  return "";
}

const ENTITÀ: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&nbsp;": " ",
};

function ripulisciHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&#?\w+;/g, (m) => ENTITÀ[m] ?? " ")
    .replace(/\s+/g, " ")
    .trim();
}

function numero(v: unknown): number | null {
  const n = Number(testo(v).trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Estrae "(Serie #1)" dal titolo: → { breve, serie }. */
function scomponiTitolo(titolo: string): { breve: string; serie: string | null } {
  const m = titolo.match(/^(.*?)\s*\(([^()]*#\s*[\d.]+[^()]*)\)\s*$/);
  if (m && m[1] && m[2]) return { breve: m[1].trim(), serie: m[2].trim() };
  return { breve: titolo, serie: null };
}

/** RFC-822 (o formati vari) → ISO, o null. */
function dataIso(v: unknown): string | null {
  const s = testo(v).trim();
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

export function analizzaRss(xml: string): Catalogo {
  const doc = parser.parse(xml) as {
    rss?: { channel?: { title?: unknown; item?: unknown } };
  };
  const channel = doc.rss?.channel ?? {};
  const grezzi = channel.item;
  const items: Record<string, unknown>[] = Array.isArray(grezzi)
    ? (grezzi as Record<string, unknown>[])
    : grezzi
      ? [grezzi as Record<string, unknown>]
      : [];

  // Il titolo del canale è tipo "Alinalegge's bookshelf: to-read".
  const lettrice = testo(channel.title).replace(/['’]s bookshelf.*$/i, "").trim();

  const copertine = new Map<string, string>();
  const libri: Libro[] = [];

  for (const it of items) {
    const bookId = testo(it["book_id"]).trim();
    if (!bookId) continue;
    const id = `gr-${bookId}`;

    const titolo = testo(it["title"]).trim();
    const { breve, serie } = scomponiTitolo(titolo);
    const book = it["book"] as Record<string, unknown> | undefined;

    const cover = testo(it["book_large_image_url"]).trim() || testo(it["book_medium_image_url"]).trim();
    if (cover) copertine.set(id, cover);

    const votoMedio = numero(it["average_rating"]);
    const link = testo(it["link"]).trim().replace(/[?&]utm_[^&]*/g, "").replace(/[?&]$/, "");

    const libro: Libro = {
      id,
      titolo,
      titoloBreve: breve,
      autore: testo(it["author_name"]).trim() || "Autore ignoto",
      serie,
      descrizione: ripulisciHtml(testo(it["book_description"])),
      pagine: numero(book?.["num_pages"]),
      votoMedio,
      anno: numero(it["book_published"]),
      link: link || `https://www.goodreads.com/book/show/${bookId}`,
      scaffale: "sospiri",
      copertinaVer: cover ? hashBreve(cover) : "0",
      fonte: "goodreads",
      prezzo: null,
      formato: null,
      aggiunto: dataIso(it["user_date_added"]),
    };
    libro.scaffale = scaffaleDi(libro);
    libri.push(libro);
  }

  return { lettrice, libri, copertine };
}

export function urlRss(userId: string, shelf: string): string {
  return `https://www.goodreads.com/review/list_rss/${encodeURIComponent(userId)}?shelf=${encodeURIComponent(shelf)}&per_page=100`;
}

export async function scaricaCatalogo(userId: string, shelf: string): Promise<Catalogo> {
  const res = await fetch(urlRss(userId, shelf), {
    headers: { "user-agent": "Mozilla/5.0 (LibreriaIncantata/0.1; homelab)" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Goodreads RSS → HTTP ${res.status}`);
  const xml = await res.text();
  return analizzaRss(xml);
}
