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
| 3 | Collector: docker / dischi / backup / TLS / uptime | **fatta** |
| 4 | Scadenze con countdown e soglie | **fatta** |
| 5 | Finanze: ricorrenti, acquisti, budget, obiettivi | **fatta** |
| 6 | PWA + autenticazione + hardening | **fatta** — v1.0.0 |

## Primo accesso

L'app non serve alcun dato finche' `ADMIN_PASSWORD_HASH` e' vuota: ogni rotta
protetta risponde `503`. Non esiste una modalita' aperta.

```bash
cd ~/homelab/docker/homelab-hub
docker run --rm -it homelab-hub:1.1.0 node server/dist/tools/hash-password.js
```

La password viene chiesta a schermo con l'eco disattivato, quindi non finisce
nella cronologia della shell. Incolla la riga prodotta in `.env` e riavvia:

```bash
docker compose up -d
```

## Installazione su iPhone

Con Tailscale attivo, apri <http://100.92.242.72:8090> **in Safari** (gli altri
browser iOS non installano PWA), poi Condividi -> Aggiungi a Home.

La sessione dura 90 giorni e si rinnova da sola superata la meta' della vita:
aprendo l'app con regolarita' il login non ricompare mai.

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
- `COOKIE_SECURE` resta `false`: l'app e' servita in HTTP e la riservatezza la
  garantisce WireGuard. Con `secure` attivo il browser non manderebbe il cookie
  e il login sarebbe impossibile. Va messo a `true` solo dietro un proxy HTTPS.
- Il service worker mette in cache **solo** gli asset di build. Nessuna risposta
  `/api` viene memorizzata: sarebbero dati vecchi, e protetti da sessione.
- L'app e' **read-only sull'infrastruttura**: non offre restart o update dei container.
  Protegge fra l'altro lo stack Gluetun/qBittorrent, che va aggiornato solo come unita'.
- Backup del DB: `docker run --rm -v homelab-hub_hub-data:/d -v "$PWD":/b busybox \
  cp /d/hub.db /b/hub.db.bak` (a container fermo, oppure via `VACUUM INTO`).
