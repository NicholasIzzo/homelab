# CLAUDE.md — Homelab

Repo di Infrastructure-as-Code del mio homelab. Tu (l'agente) operi da qui.
Rispondi in **italiano**, conciso e tecnicamente accurato. Timezone **Europe/Rome**.

## Modalità di lavoro (GitOps, non editing in produzione)

1. Modifichi compose/script/config **in questo repo** (in locale).
2. Commit + push su Gitea/GitHub.
3. Sul NAS: `git pull && docker compose up -d`.

Le **operazioni live** (log, `docker ps`, restart, diagnosi) passano da SSH, non da editing diretto di `/volume1/docker/`:

- NAS: `ssh nicholasizzo@192.168.0.36 "<cmd>"`
- hpserver: `ssh nicholas@192.168.0.33 "<cmd>"`

**dry-run di default. Esecuzione solo su mia conferma esplicita.** Se una diagnosi è incerta, dillo — non dare per scontata la causa.

## Topologia

- **NAS** — Ugreen DH4300 Plus, ARM64, UGOS/Debian 12.8, `192.168.0.36`, user `nicholasizzo`. ~22 container via Dockge (`:5001`), compose in `/volume1/docker/`. `/volume1` e `/volume2` sono root-owned.
- **hpserver** — HP ProDesk 600 G4 Mini, Ubuntu 24.04, `192.168.0.33`, user `nicholas`. Jellyfin nativo (`10.11.10`, Intel QSV/VAAPI).
- **PC Windows** — Ollama nativo (`qwen3.5:2b`), Docker Desktop + WSL2. n8n + Postgres in `C:\homelab\n8n\`.

Servizi: Vaultwarden (NPM 44075→443, Tailscale), Grafana `:3000`, Gitea `:3001`, Semaphore `:3003`, Smokeping `:8008`, IT-Tools `:3036`, Pi-hole, qBittorrent dietro Gluetun/Mullvad `:8888`, Jellyseerr `:5055`, Scrutiny `:8087`, Tailscale (container, MagicDNS `100.100.100.100`).

## Storage — ATTENZIONE

- Pool 1 RAID1 (sda+sdb, WD Red Plus 4TB) → Volume 1 (ext4).
- Pool 2 Basic, no RAID (sdc, Seagate 12TB) → Volume 2 (Btrfs, quasi pieno).
- **sdb È IN GUASTO** (Pending Sectors 283, read failure confermata). Massima cautela su ogni operazione disco. RMA in corso; comandi mdadm da preparare, non eseguire senza conferma.

## Regole invarianti (MAI violare)

- **Stack Mullvad/Gluetun**: aggiorna SEMPRE come unità (`docker compose pull && docker compose down && docker compose up -d`). qBittorrent gira nel namespace di rete di Gluetun → **mai** aggiornare/toccare i container singolarmente (li orfani).
- **Dockge**: mai "Elimina", solo "Ferma"/"Aggiorna".
- **Mai `:latest` in produzione** → tag fissi (riproducibilità, rollback).
- **SQLite (Vaultwarden, Gitea) mai su mount NFS/SMB** → corruzione DB.
- **File sul NAS**: pattern heredoc `cat > file << 'EOF'`. nano non c'è; vim in `/usr/bin/vim`.
- **Trasferimenti su `/volume1`/`/volume2`** (root-owned): `scp` verso `~/` o heredoc via SSH.
- **Nessuna operazione distruttiva su dischi/volumi/dati senza mia conferma esplicita.**

## Convenzioni

- Comandi terminale concisi con output chiaro; `jq` per JSON.
- Versiona ogni compose/config in questo repo.
- Segnala i miei errori e dubbi in modo diretto.
