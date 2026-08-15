import type { PlayDevice, StorePayload } from "./tipi";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export const fetchStore = () => getJson<StorePayload>("/api/store");

export const fetchDevices = () => getJson<{ devices: PlayDevice[]; mock: boolean }>("/api/devices");

export async function play(sessionId: string, itemId: string): Promise<{ avviato: boolean }> {
  const res = await fetch("/api/play", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId, itemId }),
  });
  if (!res.ok) throw new Error(`play → HTTP ${res.status}`);
  return res.json() as Promise<{ avviato: boolean }>;
}

export const coverUrl = (itemId: string, h = 450) => `/api/image/${itemId}?h=${h}`;

let configCache: { jellyfinUrl: string | null; serverId: string | null } | null = null;

/** URL della pagina del titolo su Jellyfin Web (controlli completi), o null in demo. */
export async function jellyfinWebUrl(itemId: string): Promise<string | null> {
  configCache ??= await getJson<{ jellyfinUrl: string | null; serverId: string | null }>(
    "/api/config",
  );
  if (!configCache.jellyfinUrl || !configCache.serverId) return null;
  return `${configCache.jellyfinUrl}/web/#/details?id=${itemId}&serverId=${configCache.serverId}`;
}
