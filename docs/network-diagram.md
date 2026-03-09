# 🌐 Network Architecture

Visual overview of the homelab infrastructure and how all components connect.

## Diagram

```
                          INTERNET
                              │
                              │
                         ┌────▼────┐
                         │ ROUTER  │
                         └────┬────┘
                              │ Local Network (192.168.0.0/24)
              ┌───────────────┼───────────────┐
              │               │               │
       ┌──────▼──────┐ ┌──────▼──────┐ ┌─────▼──────┐
       │     NAS     │ │   MINI PC   │ │ WINDOWS PC │
       │Ugreen DH4300│ │HP ProDesk   │ │  (daily)   │
       │192.168.0.36 │ │192.168.0.33 │ │            │
       └──────┬──────┘ └──────┬──────┘ └────────────┘
              │               │
              │               └── Jellyfin (media server)
              │               └── Node Exporter (metrics)
              │
              └── Docker Services:
                  │
                  ├── 🔒 Tailscale          (VPN mesh)
                  ├── 🛡️  Pihole             (DNS / ad blocking)
                  ├── 🔐 Vaultwarden        (password manager)
                  ├── 🔀 Nginx Proxy Manager (reverse proxy + SSL)
                  ├── 🏠 Home Assistant     (home automation)
                  ├── ☁️  Nextcloud          (cloud storage)
                  ├── 📊 Prometheus         (metrics collection)
                  ├── 📈 Grafana            (metrics visualization)
                  ├── 📡 Node Exporter      (NAS system metrics)
                  ├── 🐳 cAdvisor           (Docker metrics)
                  ├── 🎬 Radarr             (movie management)
                  ├── 📺 Sonarr             (TV series management)
                  ├── 🔍 Prowlarr           (indexer manager)
                  ├── ⬇️  qBittorrent + Gluetun (torrent + VPN)
                  └── ☁️  Flaresolverr       (Cloudflare bypass)
```

## Remote Access via Tailscale

```
  Phone / Laptop                        Home Network
  (anywhere)                            
  ┌─────────────┐    Tailscale VPN     ┌─────────────────────┐
  │   Device    │◄───────────────────►│  Tailscale container │
  │ with        │                      │  on NAS              │
  │ Tailscale   │                      └──────────┬──────────┘
  └─────────────┘                                 │
                                                  ▼
                                       ┌─────────────────────┐
                                       │  Nginx Proxy Manager │
                                       │  HTTPS termination   │
                                       │  (Tailscale cert)    │
                                       └──────────┬──────────┘
                                                  │
                                    ┌─────────────┼─────────────┐
                                    ▼             ▼             ▼
                               Vaultwarden   Nextcloud   Home Assistant
```

## DNS Flow (Pihole)

```
  Device on network
       │
       │ DNS query (e.g. ads.example.com)
       ▼
  ┌─────────┐
  │  Pihole │──── Blocklist match? ──► BLOCKED (returns 0.0.0.0)
  │         │
  └────┬────┘
       │ Not blocked
       ▼
  Upstream DNS (1.1.1.1 / 8.8.8.8)
       │
       ▼
  Returns IP → device connects
```

## Monitoring Flow

```
  NAS                          Mini PC
  ├── Node Exporter :9100      └── Node Exporter :9100
  ├── cAdvisor :8080                    │
  │                                     │
  └── Prometheus ◄──── scrapes ─────────┘
           │
           ▼
        Grafana
           │
           ▼
     Dashboard + Alerts → Discord
```
