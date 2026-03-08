# 🏠 Homelab

Personal homelab setup documentation. This repository contains configurations, guides, and notes for my self-hosted infrastructure.

## 📐 Infrastructure Overview

```
Internet
    │
    ▼
Router
    │
    ├── NAS (Ugreen DH4300 Plus)        → Docker services, storage
    ├── Mini PC (HP ProDesk G400)        → Jellyfin media server
    └── Personal PC (Windows 11)         → Daily use
```

All devices are connected via **Tailscale** for secure remote access, with **Nginx Proxy Manager** handling HTTPS and reverse proxying.

---

## 🖥️ Hardware

| Device | Model | Role |
|---|---|---|
| NAS | Ugreen DH4300 Plus | Docker host, storage, main services |
| Mini PC | HP ProDesk G400 Mini (8GB RAM) | Jellyfin transcoding |
| Personal PC | Windows 11 | Daily use |

---

## 🐳 Docker Services (NAS)

| Service | Description | Port |
|---|---|---|
| Vaultwarden | Self-hosted password manager (Bitwarden compatible) | `<PORT>` |
| Nginx Proxy Manager | Reverse proxy with HTTPS | `<PORT>` |
| Tailscale | VPN mesh network | - |
| Pihole | Network-wide ad blocker | `<PORT>` |
| Radarr | Movie management | `<PORT>` |
| Sonarr | TV series management | `<PORT>` |
| Prowlarr | Indexer manager | `<PORT>` |
| qBittorrent + Gluetun | Torrent client with VPN | `<PORT>` |
| Flaresolverr | Cloudflare bypass for indexers | `<PORT>` |
| Prometheus | Metrics collection | `<PORT>` |
| Grafana | Metrics visualization | `<PORT>` |
| Node Exporter | System metrics exporter (NAS) | `<PORT>` |
| cAdvisor | Docker container metrics | `<PORT>` |

## 🖥️ Services (Mini PC)

| Service | Description |
|---|---|
| Jellyfin | Media server with hardware transcoding |
| Node Exporter | System metrics exporter |

---

## 🔒 Security & Networking

- **Tailscale** — All services are accessible only through Tailscale VPN, no ports exposed to the internet
- **Nginx Proxy Manager** — Reverse proxy with SSL certificates generated via Tailscale HTTPS
- **Pihole** — DNS-level ad blocking for the entire network
- **Vaultwarden** — Self-hosted password manager, accessible only via Tailscale

### Network Access Pattern
```
Device (with Tailscale) → HTTPS → Nginx Proxy Manager → Service
```

---

## 📊 Monitoring

Prometheus + Grafana stack for monitoring all devices:

- **Node Exporter** on NAS and Mini PC → CPU, RAM, disk, network metrics
- **cAdvisor** on NAS → Docker container metrics
- **Grafana dashboard** — Node Exporter Full (ID: 1860)
- **Alerting** via Discord for service downtime

---

## 📁 Repository Structure

```
homelab/
├── README.md
├── nas/
│   └── README.md          # NAS setup and configuration
├── minipc/
│   └── README.md          # Mini PC + Jellyfin setup
├── docker/
│   ├── vaultwarden/       # Vaultwarden + NPM + SSL setup
│   ├── prometheus/        # prometheus.yml config
│   └── grafana/           # Grafana setup
└── docs/
    └── network.md         # Network architecture
```

---

## 🚀 Guides

- [Vaultwarden with HTTPS via Tailscale + NPM](docker/vaultwarden/README.md)
- [Prometheus + Grafana monitoring stack](docker/prometheus/README.md)
- [Arr stack setup (Radarr, Sonarr, Prowlarr)](nas/README.md)

---

## 📝 Notes

- All sensitive data (IPs, ports, passwords, domains) are replaced with `<PLACEHOLDER>` throughout this repository
- Tailscale is used instead of exposing ports publicly — no port forwarding on the router
