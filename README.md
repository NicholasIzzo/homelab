# ðŸ  Homelab

Personal homelab setup documentation. This repository contains configurations, guides, and notes for my self-hosted infrastructure.

## ðŸ“ Infrastructure Overview

```
Internet
    â”‚
    â–¼
Router
    â”‚
    â”œâ”€â”€ NAS (Ugreen DH4300 Plus)        â†’ Docker services, storage
    â”œâ”€â”€ Mini PC (HP ProDesk G400)        â†’ Jellyfin media server
    â””â”€â”€ Personal PC (Windows 11)         â†’ Daily use
```

All devices are connected via **Tailscale** for secure remote access, with **Nginx Proxy Manager** handling HTTPS and reverse proxying.

---

## ðŸ–¥ï¸ Hardware

| Device | Model | Role |
|---|---|---|
| NAS | Ugreen DH4300 Plus | Docker host, storage, main services |
| Mini PC | HP ProDesk G400 Mini (8GB RAM) | Jellyfin transcoding |
| Personal PC | Windows 11 | Daily use |

---

## ðŸ³ Docker Services (NAS)

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

## ðŸ–¥ï¸ Services (Mini PC)

| Service | Description |
|---|---|
| Jellyfin | Media server with hardware transcoding |
| Node Exporter | System metrics exporter |

---

## ðŸ”’ Security & Networking

- **Tailscale** â€” All services are accessible only through Tailscale VPN, no ports exposed to the internet
- **Nginx Proxy Manager** â€” Reverse proxy with SSL certificates generated via Tailscale HTTPS
- **Pihole** â€” DNS-level ad blocking for the entire network
- **Vaultwarden** â€” Self-hosted password manager, accessible only via Tailscale

### Network Access Pattern
```
Device (with Tailscale) â†’ HTTPS â†’ Nginx Proxy Manager â†’ Service
```

---

## ðŸ“Š Monitoring

Prometheus + Grafana stack for monitoring all devices:

- **Node Exporter** on NAS and Mini PC â†’ CPU, RAM, disk, network metrics
- **cAdvisor** on NAS â†’ Docker container metrics
- **Grafana dashboard** â€” Node Exporter Full (ID: 1860)
- **Alerting** via Discord for service downtime

---

## ðŸ“ Repository Structure

```
homelab/
â”œâ”€â”€ README.md
â”œâ”€â”€ nas/
â”‚   â””â”€â”€ README.md          # NAS setup and configuration
â”œâ”€â”€ minipc/
â”‚   â””â”€â”€ README.md          # Mini PC + Jellyfin setup
â”œâ”€â”€ docker/
â”‚   â”œâ”€â”€ vaultwarden/       # Vaultwarden + NPM + SSL setup
â”‚   â”œâ”€â”€ prometheus/        # prometheus.yml config
â”‚   â””â”€â”€ grafana/           # Grafana setup
â””â”€â”€ docs/
    â””â”€â”€ network.md         # Network architecture
```

---

ðŸš€ Guides
* [Architecture Map](https://nicholasizzo.github.io/homelab/homelab-map.html?v=2) 
* [Vaultwarden with HTTPS via Tailscale + NPM](docker/vaultwarden)
* [Prometheus + Grafana monitoring stack](docker/prometheus-grafana)
* [Arr stack setup (Radarr, Sonarr, Prowlarr)](docker/arr-stack)

---

## ðŸ“ Notes

- All sensitive data (IPs, ports, passwords, domains) are replaced with `<PLACEHOLDER>` throughout this repository
- Tailscale is used instead of exposing ports publicly â€” no port forwarding on the router


