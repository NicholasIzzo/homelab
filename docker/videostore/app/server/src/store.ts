import type { Shelf, StoreItem } from "./types.js";

/**
 * Scaffali del negozio, in ordine di corsia. Ogni film finisce in UN solo
 * scaffale (come le copie fisiche): decide il PRIMO genere del film che ha
 * uno scaffale, nell'ordine dei metadati — Jellyfin lo eredita da TMDb, che
 * mette il genere principale per primo. Le serie TV hanno la corsia dedicata.
 * I nomi genere coprono sia metadati italiani che inglesi.
 */
const SHELVES: { id: string; name: string; genres: string[] }[] = [
  { id: "horror", name: "Horror", genres: ["horror"] },
  { id: "fantascienza", name: "Fantascienza & Fantasy", genres: ["fantascienza", "science fiction", "sci-fi", "fantasy"] },
  { id: "animazione", name: "Animazione", genres: ["animazione", "animation"] },
  { id: "azione", name: "Azione & Avventura", genres: ["azione", "action", "avventura", "adventure", "guerra", "war", "western"] },
  { id: "thriller", name: "Thriller & Crime", genres: ["thriller", "crime", "giallo", "mistero", "mystery"] },
  { id: "commedia", name: "Commedia", genres: ["commedia", "comedy"] },
  { id: "dramma", name: "Dramma & Romantico", genres: ["dramma", "drama", "romance", "romantico", "storia", "history", "musica", "music"] },
  { id: "famiglia", name: "Per Tutta la Famiglia", genres: ["famiglia", "family", "documentario", "documentary"] },
];

const GENERE_A_SCAFFALE = new Map<string, string>();
for (const def of SHELVES) {
  for (const g of def.genres) {
    if (!GENERE_A_SCAFFALE.has(g)) GENERE_A_SCAFFALE.set(g, def.id);
  }
}

const NOVITA_SIZE = 12;

function scaffalePer(item: StoreItem): string {
  for (const genere of item.genres) {
    const id = GENERE_A_SCAFFALE.get(genere.toLowerCase());
    if (id) return id;
  }
  return "varie";
}

export function buildShelves(tuttiGliItems: StoreItem[]): Shelf[] {
  // Senza generi non è un film: è una intro, una clip, un extra. Fuori dal negozio.
  const items = tuttiGliItems.filter((it) => it.genres.length > 0);

  const byShelf = new Map<string, StoreItem[]>();
  const put = (id: string, item: StoreItem) => {
    const list = byShelf.get(id) ?? [];
    list.push(item);
    byShelf.set(id, list);
  };

  for (const item of items) {
    put(item.type === "series" ? "serie" : scaffalePer(item), item);
  }

  // Scaffale "Nuove Aggiunte": tutto ciò che è entrato in libreria negli ultimi
  // 90 giorni, dal più recente. (Le copie restano anche nel genere di appartenenza.)
  const soglia = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
  const recenti = [...items]
    .filter((it) => (it.dateCreated ?? "") >= soglia)
    .sort((a, b) => (b.dateCreated ?? "").localeCompare(a.dateCreated ?? ""));

  const novita = [...items]
    .filter((it) => it.dateCreated !== null)
    .sort((a, b) => (b.dateCreated ?? "").localeCompare(a.dateCreated ?? ""))
    .slice(0, NOVITA_SIZE);

  const shelves: Shelf[] = [];
  if (novita.length > 0) {
    shelves.push({ id: "novita", name: "Novità", items: novita });
  }
  for (const def of SHELVES) {
    const list = byShelf.get(def.id);
    if (list && list.length > 0) {
      shelves.push({ id: def.id, name: def.name, items: list });
    }
  }
  const serie = byShelf.get("serie");
  if (serie && serie.length > 0) {
    shelves.push({ id: "serie", name: "Serie TV", items: serie });
  }
  if (recenti.length > 0) {
    shelves.push({ id: "recenti", name: "Nuove Aggiunte", items: recenti });
  }
  const varie = byShelf.get("varie");
  if (varie && varie.length > 0) {
    shelves.push({ id: "varie", name: "Da Scoprire", items: varie });
  }
  return shelves;
}
