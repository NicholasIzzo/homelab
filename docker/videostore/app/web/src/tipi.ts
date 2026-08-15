export interface StoreItem {
  id: string;
  title: string;
  type: "movie" | "series";
  year: number | null;
  overview: string;
  genres: string[];
  officialRating: string | null;
  communityRating: number | null;
  runtimeMinutes: number | null;
  hasImage: boolean;
  dateCreated: string | null;
}

export interface Shelf {
  id: string;
  name: string;
  items: StoreItem[];
}

export interface StorePayload {
  shelves: Shelf[];
  mock: boolean;
}

export interface PlayDevice {
  sessionId: string;
  deviceName: string;
  client: string;
  userName: string | null;
  nowPlaying: string | null;
  lastActivity: string | null;
}
