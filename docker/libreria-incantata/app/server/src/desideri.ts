import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { Libro } from "./tipi.js";

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
    desideri.push({
      id,
      titolo: d.titolo,
      titoloBreve: d.titolo,
      autore: d.autore ?? "",
      serie: null,
      descrizione: "",
      pagine: null,
      votoMedio: null,
      anno: null,
      link: d.link ?? "",
      scaffale: "desideri",
      fonte: "amazon",
      prezzo: d.prezzo ?? null,
      formato: d.formato ?? null,
      aggiunto: null,
    });
  }

  return { desideri, copertine };
}
