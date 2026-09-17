import https from "node:https";
import zlib from "node:zlib";
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
  "User-Agent": UA,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "it-IT,it;q=0.9,en;q=0.8",
  "Accept-Encoding": "gzip, deflate",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Upgrade-Insecure-Requests": "1",
  Connection: "close",
};

/**
 * La richiesta passa dal modulo `https` e non da `fetch`.
 *
 * Non è un capriccio: misurato affiancando i due sulla stessa macchina e con
 * le stesse intestazioni, `fetch` ha incassato 503 su tutte le richieste
 * mentre `https` (e curl) passavano quasi sempre. Amazon distingue il client
 * sotto il livello delle intestazioni, e il client di `fetch` non le piace.
 * Ogni richiesta apre una connessione nuova, che è la condizione in cui i 503
 * si sono diradati.
 */
function richiesta(
  url: string,
  intestazioni: Record<string, string>,
  redirezioni = 3,
): Promise<{ stato: number; corpo: string; cookie: string[] }> {
  return new Promise((risolvi, rifiuta) => {
    const req = https.request(
      url,
      { headers: intestazioni, agent: new https.Agent({ keepAlive: false }), timeout: 25_000 },
      (res) => {
        const dove = res.headers.location;
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && dove && redirezioni > 0) {
          res.resume();
          risolvi(richiesta(new URL(dove, url).toString(), intestazioni, redirezioni - 1));
          return;
        }
        const codifica = res.headers["content-encoding"];
        const flusso =
          codifica === "gzip"
            ? res.pipe(zlib.createGunzip())
            : codifica === "deflate"
              ? res.pipe(zlib.createInflate())
              : res;
        const pezzi: Buffer[] = [];
        flusso.on("data", (d: Buffer) => pezzi.push(d));
        flusso.on("end", () =>
          risolvi({
            stato: res.statusCode ?? 0,
            corpo: Buffer.concat(pezzi).toString("utf8"),
            cookie: res.headers["set-cookie"] ?? [],
          }),
        );
        flusso.on("error", rifiuta);
      },
    );
    req.on("timeout", () => req.destroy(new Error("tempo scaduto")));
    req.on("error", rifiuta);
    req.end();
  });
}

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

/**
 * Amazon rifiuta a caso: misurato dal vivo, circa una richiesta su due torna
 * 503, e capita anche un 200 con una pagina di cortesia di pochi KB e nessun
 * libro. Non è un blocco: basta riprovare, distanziando i tentativi.
 *
 * Riprovare subito non serve: le raffiche ravvicinate vengono respinte in
 * blocco, mentre con pause ampie la richiesta passa. È un lavoro di sfondo che
 * gira ogni sei ore, quindi può permettersi di avere pazienza.
 */
const TENTATIVI = 6;
const ATTESA_BASE_MS = 5000;
const ATTESA_MAX_MS = 60_000;
const attendi = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** I cookie di sessione raccolti dalla prima pagina e rimandati indietro. */
type Barattolo = Map<string, string>;

function versa(barattolo: Barattolo, cookie: string[]): void {
  for (const c of cookie) {
    const [coppia] = c.split(";");
    const taglio = coppia?.indexOf("=") ?? -1;
    if (coppia && taglio > 0) barattolo.set(coppia.slice(0, taglio), coppia.slice(taglio + 1));
  }
}

async function prendi(
  url: string,
  extra: Record<string, string> = {},
  barattolo?: Barattolo,
): Promise<string> {
  let ultimo = "";
  for (let n = 0; n < TENTATIVI; n++) {
    if (n > 0) {
      const pausa = Math.min(ATTESA_BASE_MS * 2 ** (n - 1), ATTESA_MAX_MS);
      await attendi(pausa + Math.random() * 1000);
    }
    try {
      // valore vuoto = intestazione da togliere (una XHR non manda
      // Upgrade-Insecure-Requests, che vale solo per la navigazione)
      const con: Record<string, string> = {};
      for (const [k, v] of Object.entries({ ...INTESTAZIONI, ...extra })) if (v) con[k] = v;
      if (barattolo?.size) {
        con["Cookie"] = [...barattolo].map(([k, v]) => `${k}=${v}`).join("; ");
      }
      const res = await richiesta(url, con);
      if (barattolo) versa(barattolo, res.cookie);
      if (res.stato >= 200 && res.stato < 300) return res.corpo;
      ultimo = `HTTP ${res.stato}`;
      if (process.env["AMAZON_DEBUG"]) console.error(`  tentativo ${n + 1}: ${ultimo} (${res.corpo.length} byte) ${url.slice(0, 60)}`);
      // 4xx diversi da 429 sono risposte definitive: riprovare non cambia nulla
      if (res.stato < 500 && res.stato !== 429) break;
    } catch (err) {
      ultimo = err instanceof Error ? err.message : String(err);
    }
  }
  throw new Error(`Amazon → ${ultimo}`);
}

const prossimoLotto = (html: string): string | null => {
  const u = /showMoreUrl["']?\s*[:=]\s*["']([^"']+)/.exec(html)?.[1];
  return u ? u.replace(/&amp;/g, "&") : null;
};

/** Scarica l'intera wishlist, lotto dopo lotto. */
export async function scaricaWishlist(lista: string): Promise<ArticoloWishlist[]> {
  const indirizzo = `https://www.amazon.it/hz/wishlist/ls/${encodeURIComponent(lista)}?ref_=wl_share`;

  // La prima pagina va ottenuta davvero: un 200 con la pagina di cortesia non
  // contiene articoli, e senza di essi non c'è nemmeno il gettone dei lotti.
  let pagina = "";
  const barattolo: Barattolo = new Map();
  const trovati = new Map<string, ArticoloWishlist>();
  for (let n = 0; n < 3 && trovati.size === 0; n++) {
    if (n > 0) await attendi(2000 * n);
    pagina = await prendi(indirizzo, {}, barattolo);
    for (const a of analizzaArticoli(pagina)) trovati.set(a.itemId, a);
  }

  let url = prossimoLotto(pagina);
  for (let i = 0; url && i < MAX_LOTTI; i++) {
    // Stessa capitalizzazione di INTESTAZIONI: chiavi con casing diverso
    // finirebbero nella richiesta due volte.
    // Il Referer non è decorativo: dichiarare "same-origin" senza dire da
    // quale pagina si arriva è una combinazione che un browser non produce
    // mai, e l'endpoint dei lotti la respingeva sistematicamente.
    const intestazioniLotto = {
      Accept: "text/html,*/*",
      Referer: indirizzo,
      "X-Requested-With": "XMLHttpRequest",
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-origin",
      "Upgrade-Insecure-Requests": "",
    };

    // Un lotto vuoto è ambiguo: può essere la fine della lista o l'ennesima
    // pagina di cortesia. Si riprova: fermarsi sul dubbio significherebbe
    // servire una wishlist troncata spacciandola per completa.
    let lotto = "";
    let articoli: ArticoloWishlist[] = [];
    for (let n = 0; n < 3 && articoli.length === 0; n++) {
      if (n > 0) await attendi(2000 * n);
      lotto = await prendi(`https://www.amazon.it${url}`, intestazioniLotto, barattolo);
      articoli = analizzaArticoli(lotto);
    }

    let nuovi = 0;
    for (const a of articoli) {
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
