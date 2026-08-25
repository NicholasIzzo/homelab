import { scaffaleDi } from "./scaffali.js";
import type { Libro } from "./tipi.js";
import { hashBreve } from "./util.js";

/**
 * Lettura della wishlist Amazon, dal vivo.
 *
 * La pagina serve solo il guscio: i libri arrivano a lotti da un endpoint
 * interno (`showMoreUrl`) con un gettone di paginazione che va rincorso finché
 * non smette di restituire novità. Nel browser quel meccanismo scatta con lo
 * scorrimento; qui si segue direttamente.
 *
 * Le richieste devono somigliare a quelle di un browser: con l'intestazione di
 * un client anonimo Amazon risponde con una pagina di cortesia e nessun
 * articolo.
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const INTESTAZIONI: Record<string, string> = {
  "user-agent": UA,
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "it-IT,it;q=0.9,en;q=0.8",
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "none",
  "upgrade-insecure-requests": "1",
};

/** Quanti lotti al massimo: una rete di sicurezza contro cicli infiniti. */
const MAX_LOTTI = 40;

function decodi(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface ArticoloWishlist {
  itemId: string;
  asin: string | null;
  titolo: string;
  autore: string | null;
  formato: string | null;
  prezzo: string | null;
  copertina: string | null;
}

/**
 * Estrae gli articoli da un pezzo di HTML. Ogni voce è un `<li>` che porta in
 * attributo l'identificativo, il prezzo e l'ASIN; titolo, autore e copertina
 * stanno più sotto, agganciati a quell'identificativo.
 */
export function analizzaArticoli(html: string): ArticoloWishlist[] {
  const out: ArticoloWishlist[] = [];
  for (const pezzo of html.split(/<li\s+data-id=/i).slice(1)) {
    const id = /data-itemId="([^"]+)"/i.exec(pezzo)?.[1];
    // gli identificativi sono alfanumerici: si possono inserire in un pattern
    // senza rischio di interpretazioni impreviste
    if (!id || !/^[A-Za-z0-9]+$/.test(id)) continue;

    const grezzoTitolo = new RegExp(`id="itemName_${id}"[^>]*>([\\s\\S]*?)</a>`, "i").exec(pezzo)?.[1];
    const titolo = grezzoTitolo ? decodi(grezzoTitolo.replace(/<[^>]*>/g, "")) : "";
    if (!titolo) continue;

    const byline = new RegExp(`id="item-byline-${id}"[^>]*>([\\s\\S]*?)</span>`, "i").exec(pezzo)?.[1];
    const testoByline = byline ? decodi(byline.replace(/<[^>]*>/g, "")) : "";
    const autore =
      testoByline
        .replace(/^di\s+/i, "")
        .replace(/\s*\((?:Formato|Copertina)[^)]*\)\s*$/i, "")
        .trim() || null;
    const formato = /\((Formato[^)]*|Copertina[^)]*)\)/i.exec(testoByline)?.[1] ?? null;

    const prezzoNum = /data-price="([\d.]+)"/.exec(pezzo)?.[1];
    const img = new RegExp(`id="itemImage_${id}"[\\s\\S]*?<img[^>]+src="([^"]+)"`, "i").exec(pezzo)?.[1];

    out.push({
      itemId: id,
      asin: /ASIN:([A-Z0-9]{10})/.exec(pezzo)?.[1] ?? null,
      titolo,
      autore,
      formato,
      prezzo:
        prezzoNum && Number(prezzoNum) > 0
          ? `${Number(prezzoNum).toFixed(2).replace(".", ",")} €`
          : null,
      // la variante _SL500_ conserva le proporzioni; quelle "quadrate" di
      // Amazon aggiungono bordi bianchi e deformano i libri sullo scaffale
      copertina: img ? img.replace(/\._[A-Z0-9,_]+_\./, "._SL500_.") : null,
    });
  }
  return out;
}

async function prendi(url: string, extra: Record<string, string> = {}): Promise<string> {
  const res = await fetch(url, {
    headers: { ...INTESTAZIONI, ...extra },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Amazon → HTTP ${res.status}`);
  return res.text();
}

const prossimoLotto = (html: string): string | null => {
  const u = /showMoreUrl["']?\s*[:=]\s*["']([^"']+)/.exec(html)?.[1];
  return u ? u.replace(/&amp;/g, "&") : null;
};

/** Scarica l'intera wishlist, lotto dopo lotto. */
export async function scaricaWishlist(lista: string): Promise<ArticoloWishlist[]> {
  const pagina = await prendi(
    `https://www.amazon.it/hz/wishlist/ls/${encodeURIComponent(lista)}?ref_=wl_share`,
  );

  const trovati = new Map<string, ArticoloWishlist>();
  for (const a of analizzaArticoli(pagina)) trovati.set(a.itemId, a);

  let url = prossimoLotto(pagina);
  for (let i = 0; url && i < MAX_LOTTI; i++) {
    const lotto = await prendi(`https://www.amazon.it${url}`, {
      "x-requested-with": "XMLHttpRequest",
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
    });
    let nuovi = 0;
    for (const a of analizzaArticoli(lotto)) {
      if (!trovati.has(a.itemId)) {
        trovati.set(a.itemId, a);
        nuovi++;
      }
    }
    const successivo = prossimoLotto(lotto);
    // ci si ferma quando il gettone non cambia o il lotto non porta novità:
    // altrimenti si girerebbe a vuoto sull'ultima pagina
    if (!successivo || successivo === url || nuovi === 0) break;
    url = successivo;
  }

  if (trovati.size === 0) throw new Error("wishlist vuota: pagina servita senza articoli");
  return [...trovati.values()];
}

/** Titolo senza sottotitoli commerciali, che sporcherebbero etichette e generi. */
export function titoloPulito(titolo: string): string {
  return (
    titolo
      .replace(/\s*\(\s*Vol\.?\s*\d+\s*\)/gi, "")
      .replace(/\s*\((?:Italian Edition|Libri)\)/gi, "")
      .replace(/\.?\s*Con (?:Ex libris|Segnalibro|Poster|Gadget)\b[^.]*/gi, "")
      .replace(/[\s.:,;-]+$/, "")
      .trim() || titolo
  );
}

/** Trasforma gli articoli grezzi nei libri usati dal resto dell'applicazione. */
export function articoliALibri(articoli: ArticoloWishlist[]): {
  desideri: Libro[];
  copertine: Map<string, string>;
} {
  const copertine = new Map<string, string>();
  const desideri: Libro[] = [];

  for (const a of articoli) {
    const id = `az-${a.asin ?? a.itemId}`;
    if (a.copertina) copertine.set(id, a.copertina);
    const libro: Libro = {
      id,
      titolo: a.titolo,
      titoloBreve: titoloPulito(a.titolo),
      autore: a.autore ?? "",
      serie: null,
      descrizione: "",
      pagine: null,
      votoMedio: null,
      anno: null,
      link: a.asin ? `https://www.amazon.it/dp/${a.asin}` : "",
      scaffale: "sospiri",
      copertinaVer: a.copertina ? hashBreve(a.copertina) : "0",
      fonte: "amazon",
      prezzo: a.prezzo,
      formato: a.formato,
      aggiunto: null,
    };
    libro.scaffale = scaffaleDi(libro);
    desideri.push(libro);
  }

  return { desideri, copertine };
}
