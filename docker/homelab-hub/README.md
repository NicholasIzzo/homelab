# Homelab Hub

Dashboard di monitoring del homelab. Container unico (React + Node), PWA mobile-first, dark theme.
Progettazione completa: [`docs/homelab-hub-design.md`](../../docs/homelab-hub-design.md).

**Host: hpserver** (`192.168.0.33`, Tailscale `100.92.242.72`). Non il NAS: un monitor non deve
vivere nel dominio di guasto che monitora.

Raggiungibile solo da Tailscale: <http://100.92.242.72:8090>

## Stato

| Fase | Contenuto | Stato |
|---|---|---|
| 2 | Scheletro, container, SQLite + migrazioni, shell PWA | **fatta** |
| 3 | Collector: docker / dischi / backup / TLS / uptime | da fare |
| 4 | Scadenze | da fare |
| 5 | Finanze | da fare |
| 6 | PWA completa + autenticazione + hardening | da fare |

## Deploy

Prima volta:

```bash
git clone https://github.com/NicholasIzzo/homelab.git ~/homelab
cd ~/homelab/docker/homelab-hub && cp .env.example .env && vi .env
docker compose up -d --build
```

Aggiornamenti:

```bash
cd ~/homelab && git pull && cd docker/homelab-hub && docker compose up -d --build
```

Rollback: `docker compose down` + checkout del commit precedente + `up -d --build`.
Il tag immagine (`homelab-hub:0.1.0`) sale a ogni fase, quindi le immagini precedenti
restano in locale come rete di sicurezza.

## Verifica

```bash
docker compose ps && curl -s http://100.92.242.72:8090/api/health
```

## Note operative

- I dati stanno nel volume Docker `homelab-hub_hub-data`. **Non** su NFS/SMB: SQLite si corrompe.
- Il container gira read-only, non-root, `cap_drop: ALL`. Scrive solo su `/data` e `/tmp`.
- La porta e' pubblicata **solo** sull'IP Tailscale. Con `0.0.0.0` sarebbe esposta a tutta la LAN.
- L'app e' **read-only sull'infrastruttura**: non offre restart o update dei container.
  Protegge fra l'altro lo stack Gluetun/qBittorrent, che va aggiornato solo come unita'.
- Backup del DB: `docker run --rm -v homelab-hub_hub-data:/d -v "$PWD":/b busybox \
  cp /d/hub.db /b/hub.db.bak` (a container fermo, oppure via `VACUUM INTO`).
