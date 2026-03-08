# 🎬 Arr Stack — Automated Media Management

Automated media download and management stack using Radarr, Sonarr, Prowlarr, qBittorrent with VPN (Gluetun) and Flaresolverr.

## Architecture

```
Prowlarr (indexer manager)
    │
    ├── Radarr (movies)      ──→ qBittorrent + Gluetun VPN ──→ Downloads
    └── Sonarr (TV series)   ──→ qBittorrent + Gluetun VPN ──→ Downloads
                                        │
                                  Flaresolverr
                               (Cloudflare bypass)
```

---

## Prerequisites

- Docker installed on your NAS
- A VPN provider supported by Gluetun (Mullvad, ProtonVPN, NordVPN, etc.)
- Storage volume for media files

---

## Step 1 — Deploy Gluetun (VPN container)

Gluetun creates a VPN tunnel that qBittorrent routes through. Other containers connect to Gluetun's network instead of the host network.

```bash
docker run -d \
  --name gluetun \
  --restart unless-stopped \
  --cap-add NET_ADMIN \
  --device /dev/net/tun \
  -p <QBITTORRENT_PORT>:8080 \
  -e VPN_SERVICE_PROVIDER=<your_provider> \
  -e VPN_TYPE=wireguard \
  -e WIREGUARD_PRIVATE_KEY=<your_private_key> \
  -e SERVER_COUNTRIES=<country> \
  qmcaw/gluetun
```

> Check [Gluetun documentation](https://github.com/qdm12/gluetun) for provider-specific configuration.

---

## Step 2 — Deploy qBittorrent (through Gluetun)

qBittorrent uses Gluetun's network stack — all torrent traffic goes through the VPN:

```bash
docker run -d \
  --name qbittorrent \
  --restart unless-stopped \
  --network container:gluetun \
  -e PUID=1000 \
  -e PGID=1000 \
  -v /volume1/docker/qbittorrent:/config \
  -v /volume1/media/downloads:/downloads \
  lscr.io/linuxserver/qbittorrent
```

> Notice `--network container:gluetun` — qBittorrent shares Gluetun's network, so all traffic goes through VPN.

---

## Step 3 — Deploy Flaresolverr

Flaresolverr bypasses Cloudflare protection on some torrent indexers:

```bash
docker run -d \
  --name flaresolverr \
  --restart unless-stopped \
  -p <PORT>:8191 \
  flaresolverr/flaresolverr
```

---

## Step 4 — Deploy Prowlarr

Prowlarr manages all your indexers in one place and syncs them automatically to Radarr and Sonarr:

```bash
docker run -d \
  --name prowlarr \
  --restart unless-stopped \
  -p <PORT>:9696 \
  -e PUID=1000 \
  -e PGID=1000 \
  -v /volume1/docker/prowlarr:/config \
  lscr.io/linuxserver/prowlarr
```

---

## Step 5 — Deploy Radarr

```bash
docker run -d \
  --name radarr \
  --restart unless-stopped \
  -p <PORT>:7878 \
  -e PUID=1000 \
  -e PGID=1000 \
  -v /volume1/docker/radarr:/config \
  -v /volume1/media/movies:/movies \
  -v /volume1/media/downloads:/downloads \
  lscr.io/linuxserver/radarr
```

---

## Step 6 — Deploy Sonarr

```bash
docker run -d \
  --name sonarr \
  --restart unless-stopped \
  -p <PORT>:8989 \
  -e PUID=1000 \
  -e PGID=1000 \
  -v /volume1/docker/sonarr:/config \
  -v /volume1/media/tv:/tv \
  -v /volume1/media/downloads:/downloads \
  lscr.io/linuxserver/sonarr
```

---

## Step 7 — Configure Prowlarr

1. Open Prowlarr at `http://<NAS_IP>:<PORT>`
2. Go to **Settings → Apps**
3. Add **Radarr** and **Sonarr** with their respective URLs and API keys
4. Add **Flaresolverr** as a proxy under **Settings → Indexers → Proxies**
5. Add your preferred indexers under **Indexers**

Prowlarr will automatically sync indexers to Radarr and Sonarr.

---

## Step 8 — Configure Download Client in Radarr/Sonarr

In both Radarr and Sonarr:

1. Go to **Settings → Download Clients → Add**
2. Select **qBittorrent**
3. Host: `<NAS_IP>`
4. Port: `<QBITTORRENT_PORT>` (the port mapped from Gluetun)
5. Test and Save

---

## How it works

1. You add a movie to Radarr or a series to Sonarr
2. They search across all indexers configured in Prowlarr
3. The best match is sent to qBittorrent for download
4. qBittorrent downloads through the VPN tunnel (Gluetun)
5. Once downloaded, Radarr/Sonarr move and rename the file automatically
6. Jellyfin picks up the new file and adds it to the library

---

## Notes

- Never expose qBittorrent directly — always route through Gluetun
- Use `--network container:gluetun` for qBittorrent, not port mapping on qBittorrent itself
- Flaresolverr is only needed for indexers protected by Cloudflare
- Keep all media volumes consistent between Radarr, Sonarr and qBittorrent
