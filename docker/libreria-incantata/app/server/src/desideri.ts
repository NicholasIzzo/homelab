import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { Libro } from "./tipi.js";
import { scaffaleDi } from "./scaffali.js";
import { hashBreve } from "./util.js";

interface DesiderioJson {
  asin?: string;
  titolo: string;
  autore?: string;
  formato?: string;
  prezzo?: string;
  copertina?: string;
  link?: string;
}

export interface Desiderata {
  desideri: Libro[];
  copertine: Map<string, string>;
}

const QUI = dirname(fileURLToPath(import.meta.url));

/** Cerca desideri.json: prima l'env, poi i posti probabili (dev e container). */
function trovaFile(explicit: string): string | null {
  const candidati = [
    explicit,
    "/app/data/desideri.json",
    resolve(process.cwd(), "data/desideri.json"),
    resolve(QUI, "../../../data/desideri.json"),
    resolve(QUI, "../../data/desideri.json"),
  ].filter(Boolean);
  for (const c of candidati) {
    if (existsSync(c)) return c;
  }
  return null;
}

export async function caricaDesideri(pathEnv: string): Promise<Desiderata> {
  const file = trovaFile(pathEnv);
  if (!file) return { desideri: [], copertine: new Map() };

  const raw = await readFile(file, "utf8");
  const dati = JSON.parse(raw) as { libri?: DesiderioJson[] };
  const copertine = new Map<string, string>();
  const desideri: Libro[] = [];

  for (const d of dati.libri ?? []) {
    const id = `az-${d.asin ?? d.titolo.replace(/\W+/g, "").slice(0, 16)}`;
    if (d.copertina) copertine.set(id, d.copertina);
    // Titolo "pulito": via sottotitoli commerciali ("Con Ex libris. Con Segnalibro")
    // e indicazioni di volume, che sporcherebbero etichette e classificazione.
    const breve = d.titolo
      .replace(/\s*\(\s*Vol\.?\s*\d+\s*\)/gi, "") // "(Vol. 1)"
      .replace(/\s*\((?:Italian Edition|Libri)\)/gi, "")
      .replace(/\.?\s*Con (?:Ex libris|Segnalibro|Poster|Gadget)\b[^.]*/gi, "")
      .replace(/[\s.:,;-]+$/, "")
      .trim();
    const libro: Libro = {
      id,
      titolo: d.titolo,
      titoloBreve: breve || d.titolo,
      autore: d.autore ?? "",
      serie: null,
      descrizione: "",
      pagine: null,
      votoMedio: null,
      anno: null,
      link: d.link ?? "",
      scaffale: "sospiri",
      copertinaVer: d.copertina ? hashBreve(d.copertina) : "0",
      fonte: "amazon",
      prezzo: d.prezzo ?? null,
      formato: d.formato ?? null,
      aggiunto: null,
    };
    // Anche i desideri hanno un genere: serve alla scheda (colore e sigillo).
    libro.scaffale = scaffaleDi(libro);
    desideri.push(libro);
  }

  return { desideri, copertine };
}
