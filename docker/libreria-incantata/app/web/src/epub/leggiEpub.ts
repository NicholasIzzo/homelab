import { unzip } from "fflate";

/**
 * Lettura di un EPUB nel browser.
 *
 * Un EPUB è uno ZIP con dentro un pacchetto OPF che dichiara metadati, indice
 * delle risorse (manifest) e ordine di lettura (spine). Qui si estrae solo ciò
 * che serve — mai l'intero archivio, che con le illustrazioni può pesare
 * decine di MB — in tre passaggi mirati: il puntatore all'OPF, l'OPF, la
 * copertina.
 *
 * Tutto resta sul dispositivo: nessun byte di questi file va sulla rete.
 */

export interface CapitoloEpub {
  /** Percorso interno allo ZIP. */
  percorso: string;
  /** Tipo dichiarato nel manifest (di norma application/xhtml+xml). */
  tipo: string;
}

export interface LibroEpub {
  titolo: string;
  autore: string;
  /** Categorie dichiarate dall'editore (dc:subject): utili per lo scaffale. */
  soggetti: string[];
  lingua: string | null;
  anno: number | null;
  descrizione: string;
  /** Copertina estratta, se l'EPUB ne dichiara una. */
  copertina: Blob | null;
  /** Capitoli in ordine di lettura. */
  capitoli: CapitoloEpub[];
  /** Cartella base dell'OPF: i percorsi del manifest sono relativi a questa. */
  radice: string;
}

/** Estrae dallo ZIP solo i file che passano il filtro. */
function estrai(
  dati: Uint8Array,
  filtro: (nome: string) => boolean,
): Promise<Record<string, Uint8Array>> {
  return new Promise((risolvi, rifiuta) => {
    unzip(dati, { filter: (f) => filtro(f.name) }, (err, out) => {
      if (err) rifiuta(err);
      else risolvi(out);
    });
  });
}

const testo = (b: Uint8Array) => new TextDecoder("utf-8").decode(b);

function xml(sorgente: string): Document {
  return new DOMParser().parseFromString(sorgente, "application/xml");
}

/** Primo valore utile fra i tag indicati, cercando in qualunque namespace. */
function primo(doc: Document | Element, ...nomi: string[]): string {
  for (const nome of nomi) {
    const el = doc.getElementsByTagName(nome)[0] ?? doc.getElementsByTagName(`dc:${nome}`)[0];
    const v = el?.textContent?.trim();
    if (v) return v;
  }
  return "";
}

function tutti(doc: Document, nome: string): string[] {
  const out: string[] = [];
  for (const tag of [nome, `dc:${nome}`]) {
    for (const el of Array.from(doc.getElementsByTagName(tag))) {
      const v = el.textContent?.trim();
      if (v) out.push(v);
    }
  }
  return [...new Set(out)];
}

/** Normalizza un percorso con "..", perché i manifest ne fanno uso. */
function risolviPercorso(radice: string, relativo: string): string {
  const parti = (radice ? radice.split("/") : []).filter(Boolean);
  for (const pezzo of relativo.split("/")) {
    if (!pezzo || pezzo === ".") continue;
    if (pezzo === "..") parti.pop();
    else parti.push(pezzo);
  }
  return parti.join("/");
}

function ripulisci(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#?\w+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function leggiEpub(file: File): Promise<LibroEpub> {
  const dati = new Uint8Array(await file.arrayBuffer());

  // 1. container.xml dice dov'è l'OPF
  const passo1 = await estrai(dati, (n) => n === "META-INF/container.xml" || n.endsWith(".opf"));
  const contenitore = passo1["META-INF/container.xml"];
  let percorsoOpf = "";
  if (contenitore) {
    const doc = xml(testo(contenitore));
    percorsoOpf = doc.getElementsByTagName("rootfile")[0]?.getAttribute("full-path") ?? "";
  }
  if (!percorsoOpf) {
    // EPUB malformati: si ripiega sul primo .opf trovato
    percorsoOpf = Object.keys(passo1).find((n) => n.endsWith(".opf")) ?? "";
  }
  if (!percorsoOpf) throw new Error("non sembra un EPUB: manca il pacchetto OPF");

  const grezzoOpf = passo1[percorsoOpf] ?? (await estrai(dati, (n) => n === percorsoOpf))[percorsoOpf];
  if (!grezzoOpf) throw new Error("pacchetto OPF illeggibile");
  const opf = xml(testo(grezzoOpf));
  const radice = percorsoOpf.includes("/") ? percorsoOpf.replace(/\/[^/]*$/, "") : "";

  // 2. metadati
  const titolo = primo(opf, "title") || file.name.replace(/\.epub$/i, "");
  const autore = primo(opf, "creator");
  const soggetti = tutti(opf, "subject");
  const lingua = primo(opf, "language") || null;
  const data = primo(opf, "date");
  const anno = /\d{4}/.exec(data)?.[0] ? Number(/\d{4}/.exec(data)![0]) : null;
  const descrizione = ripulisci(primo(opf, "description"));

  // 3. manifest e spine
  const manifest = new Map<string, { href: string; tipo: string; proprieta: string }>();
  for (const item of Array.from(opf.getElementsByTagName("item"))) {
    const id = item.getAttribute("id");
    const href = item.getAttribute("href");
    if (!id || !href) continue;
    manifest.set(id, {
      href,
      tipo: item.getAttribute("media-type") ?? "",
      proprieta: item.getAttribute("properties") ?? "",
    });
  }

  const capitoli: CapitoloEpub[] = [];
  for (const rif of Array.from(opf.getElementsByTagName("itemref"))) {
    const idref = rif.getAttribute("idref");
    const voce = idref ? manifest.get(idref) : undefined;
    if (!voce) continue;
    capitoli.push({ percorso: risolviPercorso(radice, voce.href), tipo: voce.tipo });
  }

  // 4. copertina: dichiarata come <meta name="cover"> (EPUB 2) o con
  //    properties="cover-image" (EPUB 3); in mancanza, si tenta per nome.
  let hrefCopertina: string | null = null;
  for (const meta of Array.from(opf.getElementsByTagName("meta"))) {
    if (meta.getAttribute("name") === "cover") {
      const id = meta.getAttribute("content");
      const voce = id ? manifest.get(id) : undefined;
      if (voce) hrefCopertina = voce.href;
    }
  }
  if (!hrefCopertina) {
    for (const [, voce] of manifest) {
      if (voce.proprieta.includes("cover-image")) {
        hrefCopertina = voce.href;
        break;
      }
    }
  }
  if (!hrefCopertina) {
    for (const [, voce] of manifest) {
      if (voce.tipo.startsWith("image/") && /cover/i.test(voce.href)) {
        hrefCopertina = voce.href;
        break;
      }
    }
  }

  let copertina: Blob | null = null;
  if (hrefCopertina) {
    const percorso = risolviPercorso(radice, hrefCopertina);
    const trovato = await estrai(dati, (n) => n === percorso);
    const bytes = trovato[percorso];
    if (bytes) {
      const tipo = manifest.get([...manifest].find(([, v]) => v.href === hrefCopertina)?.[0] ?? "")?.tipo;
      copertina = new Blob([bytes as BlobPart], { type: tipo || "image/jpeg" });
    }
  }

  return { titolo, autore, soggetti, lingua, anno, descrizione, copertina, capitoli, radice };
}

/** Testo di un capitolo, estratto su richiesta dal file originale. */
export async function leggiCapitolo(file: File, percorso: string): Promise<string> {
  const dati = new Uint8Array(await file.arrayBuffer());
  const trovato = await estrai(dati, (n) => n === percorso);
  const bytes = trovato[percorso];
  if (!bytes) return "";
  return testo(bytes);
}
