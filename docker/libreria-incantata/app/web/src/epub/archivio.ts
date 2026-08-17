import type { CapitoloEpub } from "./leggiEpub";

/**
 * Archivio della biblioteca personale, su questo dispositivo.
 *
 * Niente va sul server: metadati, copertine e file EPUB restano in IndexedDB,
 * nel browser di chi li importa. È la ragione per cui non serve un account —
 * ogni visitatore ha già la propria libreria — e per cui non custodiamo i libri
 * di nessuno.
 */

const DB = "biblioteca-incantata";
const VERSIONE = 1;
const LIBRI = "libri";

/** Oltre questa soglia si tiene solo la scheda, non il file: leggerlo richiederà di riaprirlo. */
export const LIMITE_FILE = 24 * 1024 * 1024;

export interface VoceArchivio {
  id: string;
  titolo: string;
  autore: string;
  soggetti: string[];
  lingua: string | null;
  anno: number | null;
  descrizione: string;
  /** Scaffale tematico assegnato all'import. */
  scaffale: string;
  copertina: Blob | null;
  capitoli: CapitoloEpub[];
  /** Il file originale, se sotto la soglia: serve a leggere i capitoli. */
  file: Blob | null;
  nomeFile: string;
  byte: number;
  aggiunto: string;
}

function apri(): Promise<IDBDatabase> {
  return new Promise((risolvi, rifiuta) => {
    const richiesta = indexedDB.open(DB, VERSIONE);
    richiesta.onupgradeneeded = () => {
      const db = richiesta.result;
      if (!db.objectStoreNames.contains(LIBRI)) db.createObjectStore(LIBRI, { keyPath: "id" });
    };
    richiesta.onsuccess = () => risolvi(richiesta.result);
    richiesta.onerror = () => rifiuta(richiesta.error);
  });
}

function transazione<T>(
  modo: IDBTransactionMode,
  lavoro: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return apri().then(
    (db) =>
      new Promise<T>((risolvi, rifiuta) => {
        const tx = db.transaction(LIBRI, modo);
        const richiesta = lavoro(tx.objectStore(LIBRI));
        richiesta.onsuccess = () => risolvi(richiesta.result);
        richiesta.onerror = () => rifiuta(richiesta.error);
        tx.oncomplete = () => db.close();
      }),
  );
}

export const salvaVoce = (v: VoceArchivio) =>
  transazione("readwrite", (s) => s.put(v) as IDBRequest<IDBValidKey>);

export const elencoVoci = () => transazione<VoceArchivio[]>("readonly", (s) => s.getAll());

export const leggiVoce = (id: string) =>
  transazione<VoceArchivio | undefined>("readonly", (s) => s.get(id));

export const eliminaVoce = (id: string) =>
  transazione("readwrite", (s) => s.delete(id) as unknown as IDBRequest<undefined>);

export async function svuotaArchivio(): Promise<void> {
  await transazione("readwrite", (s) => s.clear() as unknown as IDBRequest<undefined>);
}

/** Quanto occupa la biblioteca locale, e quanto spazio concede il browser. */
export async function spazio(): Promise<{ usati: number; disponibili: number | null }> {
  const voci = await elencoVoci();
  const usati = voci.reduce((t, v) => t + v.byte, 0);
  let disponibili: number | null = null;
  try {
    const stima = await navigator.storage?.estimate?.();
    if (stima?.quota) disponibili = stima.quota - (stima.usage ?? 0);
  } catch {
    /* stima non disponibile: pazienza */
  }
  return { usati, disponibili };
}

/**
 * Identificativo stabile del libro: serve a non reimportare due volte lo stesso
 * titolo e a ricordare la scelta del taglio decorato. Si basa su titolo e
 * autore, non sul nome del file, che cambia da un dispositivo all'altro.
 */
export function idLibro(titolo: string, autore: string): string {
  const base = `${titolo}|${autore}`.toLowerCase().normalize("NFKD").replace(/[^a-z0-9|]+/g, "");
  let h = 2166136261;
  for (let i = 0; i < base.length; i++) {
    h ^= base.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `ep-${(h >>> 0).toString(36)}`;
}
