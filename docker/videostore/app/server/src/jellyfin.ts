import type { Config } from "./config.js";
import type { PlayDevice, StoreItem } from "./types.js";

interface JfItem {
  Id: string;
  Name: string;
  Type: "Movie" | "Series";
  ProductionYear?: number;
  Overview?: string;
  Genres?: string[];
  OfficialRating?: string;
  CommunityRating?: number;
  RunTimeTicks?: number;
  DateCreated?: string;
  ImageTags?: Record<string, string>;
}

interface JfSession {
  Id: string;
  DeviceName?: string;
  Client?: string;
  UserName?: string;
  SupportsRemoteControl?: boolean;
  LastActivityDate?: string;
  NowPlayingItem?: { Name?: string };
}

const TICKS_PER_MINUTE = 600_000_000;

export class JellyfinClient {
  constructor(private readonly cfg: Config) {}

  private async request(path: string, init?: RequestInit): Promise<Response> {
    const res = await fetch(`${this.cfg.jellyfinUrl}${path}`, {
      ...init,
      headers: {
        ...init?.headers,
        Authorization: `MediaBrowser Token="${this.cfg.jellyfinApiKey}", Client="Videostore", Device="Videostore", DeviceId="videostore-server", Version="0.1.0"`,
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      throw new Error(`Jellyfin ${path} → HTTP ${res.status}`);
    }
    return res;
  }

  async fetchLibrary(): Promise<StoreItem[]> {
    const params = new URLSearchParams({
      IncludeItemTypes: "Movie,Series",
      Recursive: "true",
      Fields: "Genres,Overview,ProductionYear,OfficialRating,RunTimeTicks,DateCreated",
      SortBy: "SortName",
      SortOrder: "Ascending",
    });
    const res = await this.request(`/Items?${params}`);
    const body = (await res.json()) as { Items?: JfItem[] };
    return (body.Items ?? []).map((it) => ({
      id: it.Id,
      title: it.Name,
      type: it.Type === "Series" ? "series" : "movie",
      year: it.ProductionYear ?? null,
      overview: it.Overview ?? "",
      genres: it.Genres ?? [],
      officialRating: it.OfficialRating ?? null,
      communityRating: it.CommunityRating ?? null,
      runtimeMinutes: it.RunTimeTicks ? Math.round(it.RunTimeTicks / TICKS_PER_MINUTE) : null,
      hasImage: Boolean(it.ImageTags?.["Primary"]),
      dateCreated: it.DateCreated ?? null,
    }));
  }

  /** Stream della copertina ufficiale (Primary) di un item. */
  async fetchPrimaryImage(itemId: string, height: number): Promise<Response> {
    const params = new URLSearchParams({ fillHeight: String(height), quality: "90" });
    return this.request(`/Items/${encodeURIComponent(itemId)}/Images/Primary?${params}`);
  }

  /** Backdrop orizzontale (per gli schermi delle sale); ripiega sulla copertina. */
  async fetchBackdropImage(itemId: string, height: number): Promise<Response> {
    const params = new URLSearchParams({ fillHeight: String(height), quality: "90" });
    try {
      return await this.request(`/Items/${encodeURIComponent(itemId)}/Images/Backdrop/0?${params}`);
    } catch {
      return this.fetchPrimaryImage(itemId, height);
    }
  }

  async fetchControllableSessions(): Promise<PlayDevice[]> {
    // 12 ore: la TV del salotto deve comparire anche se sta "dormendo" da un po'.
    const res = await this.request(`/Sessions?ActiveWithinSeconds=43200`);
    const sessions = (await res.json()) as JfSession[];
    // Le sessioni del client web muoiono con la scheda del browser: mostrarle
    // "vecchie" invita a mandare film nel vuoto. Le app TV invece rispondono
    // anche dopo ore, quindi per loro la finestra resta larga.
    const FINESTRA_WEB_MS = 15 * 60 * 1000;
    const viva = (s: JfSession) =>
      s.Client !== "Jellyfin Web" ||
      (s.LastActivityDate !== undefined &&
        Date.now() - new Date(s.LastActivityDate).getTime() < FINESTRA_WEB_MS);
    return sessions
      .filter((s) => s.SupportsRemoteControl && s.Client !== "Videostore" && viva(s))
      .sort((a, b) => (b.LastActivityDate ?? "").localeCompare(a.LastActivityDate ?? ""))
      .map((s) => ({
        sessionId: s.Id,
        deviceName: s.DeviceName ?? "Dispositivo sconosciuto",
        client: s.Client ?? "?",
        userName: s.UserName ?? null,
        nowPlaying: s.NowPlayingItem?.Name ?? null,
        lastActivity: s.LastActivityDate ?? null,
      }));
  }

  /** Invia il PlayNow e verifica che la riproduzione parta davvero: Jellyfin
   *  accetta il comando anche per sessioni morte, senza dare errore. */
  async playOnSession(sessionId: string, itemId: string): Promise<boolean> {
    const params = new URLSearchParams({ playCommand: "PlayNow", itemIds: itemId });
    await this.request(
      `/Sessions/${encodeURIComponent(sessionId)}/Playing?${params}`,
      { method: "POST" },
    );
    for (let tentativo = 0; tentativo < 4; tentativo++) {
      await new Promise((r) => setTimeout(r, 2200));
      const res = await this.request(`/Sessions`);
      const sessions = (await res.json()) as JfSession[];
      const s = sessions.find((x) => x.Id === sessionId);
      if (s?.NowPlayingItem) return true;
    }
    return false;
  }
}
