import { leggiVoce } from "./archivio";
import { leggiCapitolo } from "./leggiEpub";

/**
 * Testo leggibile di un libro EPUB.
 *
 * Con Goodreads si può mostrare solo la trama: il contenuto dei romanzi non è
 * nostro. Con un EPUB portato dall'utente il testo c'è, sta sul suo dispositivo
 * ed è una sua copia — quindi l'angolo del camino può mostrare i capitoli veri.
 */

/** Trasforma l'XHTML di un capitolo in paragrafi di testo semplice. */
export function paragrafi(xhtml: string): string[] {
  const doc = new DOMParser().parseFromString(xhtml, "text/html");
  for (const via of Array.from(doc.querySelectorAll("script,style,nav,header,footer"))) {
    via.remove();
  }
  const blocchi = Array.from(doc.querySelectorAll("p,h1,h2,h3,h4,li,blockquote"));
  const out: string[] = [];
  for (const b of blocchi) {
    const t = (b.textContent ?? "").replace(/\s+/g, " ").trim();
    if (t) out.push(/^h[1-4]$/i.test(b.tagName) ? `§ ${t}` : t);
  }
  // Capitoli senza markup di paragrafo: si ripiega sul testo grezzo.
  if (out.length === 0) {
    const t = (doc.body?.textContent ?? "").replace(/\s+/g, " ").trim();
    if (t) out.push(t);
  }
  return out;
}

export interface TestoLibro {
  /** Paragrafi in ordine di lettura, capitolo dopo capitolo. */
  paragrafi: string[];
  /** Vero se il file non è più disponibile e va riportato. */
  mancante: boolean;
}

/**
 * Estrae il testo dei primi capitoli. Non si carica tutto il libro in memoria:
 * si procede a blocchi, quanto basta per riempire un po' di pagine.
 */
export async function testoDi(idLibro: string, maxCapitoli = 6): Promise<TestoLibro> {
  const voce = await leggiVoce(idLibro);
  if (!voce) return { paragrafi: [], mancante: true };
  if (!voce.file) return { paragrafi: [], mancante: true };

  const file = new File([voce.file], voce.nomeFile, { type: "application/epub+zip" });
  const out: string[] = [];
  const leggibili = voce.capitoli.filter(
    (c) => !c.tipo || c.tipo.includes("xhtml") || c.tipo.includes("html"),
  );
  for (const cap of leggibili.slice(0, maxCapitoli)) {
    try {
      const xhtml = await leggiCapitolo(file, cap.percorso);
      if (xhtml) out.push(...paragrafi(xhtml));
    } catch {
      /* capitolo illeggibile: si passa al successivo */
    }
  }
  return { paragrafi: out, mancante: false };
}
