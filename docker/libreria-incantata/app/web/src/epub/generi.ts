/**
 * Smistamento dei libri EPUB negli scaffali tematici.
 *
 * Le regole non sono duplicate qui: si scaricano da `/api/scaffali`, dove il
 * server le tiene per la biblioteca Goodreads. Così correggere un genere in un
 * posto lo corregge per tutti. Qui c'è solo l'applicazione, con un passaggio in
 * più che il server non ha: le categorie dichiarate dall'editore nell'EPUB
 * (`dc:subject`), che quando ci sono valgono più di qualunque euristica.
 */

export interface DefScaffale {
  id: string;
  nome: string;
  parole: string[];
}

export interface Regole {
  scaffali: DefScaffale[];
  perTitolo: Record<string, string>;
  perAutore: { autore: string; scaffale: string }[];
  nomiSpeciali: Record<string, string>;
}

let cache: Regole | null = null;

const REGOLE_MINIME: Regole = {
  scaffali: [],
  perTitolo: {},
  perAutore: [],
  nomiSpeciali: { sospiri: "Lo Scaffale dei Sospiri" },
};

export async function regole(): Promise<Regole> {
  if (cache) return cache;
  try {
    const res = await fetch("/api/scaffali");
    if (!res.ok) throw new Error(String(res.status));
    cache = (await res.json()) as Regole;
  } catch {
    // Senza le regole i libri finiscono tutti fra i "Sospiri": la biblioteca
    // resta usabile, solo non divisa per genere.
    cache = REGOLE_MINIME;
  }
  return cache;
}

export function normalizza(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export interface DaClassificare {
  titolo: string;
  autore: string;
  soggetti: string[];
}

export function scaffaleDi(libro: DaClassificare, r: Regole): string {
  const titolo = normalizza(libro.titolo);

  // 1. mappa curata (stessa del server): titolo esatto o per prefisso
  const chiavi = Object.keys(r.perTitolo).sort((a, b) => b.length - a.length);
  if (r.perTitolo[titolo]) return r.perTitolo[titolo]!;
  for (const chiave of chiavi) {
    if (titolo === chiave || titolo.startsWith(chiave + " ")) return r.perTitolo[chiave]!;
  }

  // 2. autore/serie
  const autore = normalizza(libro.autore);
  for (const regola of r.perAutore) {
    if (autore && autore.includes(normalizza(regola.autore))) return regola.scaffale;
  }

  // 3. categorie dell'editore: più affidabili delle parole nel titolo
  const soggetti = libro.soggetti.map(normalizza).join(" ");
  if (soggetti) {
    for (const def of r.scaffali) {
      if (def.parole.some((p) => soggetti.includes(normalizza(p)))) return def.id;
    }
  }

  // 4. ultima spiaggia: parole chiave nel titolo
  for (const def of r.scaffali) {
    if (def.parole.some((p) => titolo.includes(normalizza(p)))) return def.id;
  }
  return "sospiri";
}

export function nomeScaffale(id: string, r: Regole): string {
  return r.scaffali.find((s) => s.id === id)?.nome ?? r.nomiSpeciali[id] ?? "Lo Scaffale dei Sospiri";
}
