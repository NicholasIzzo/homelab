# Homelab Hub — Documento di progettazione (FASE 1)

Data: 2026-08-14 · Stato: **in attesa di approvazione** · Nessun codice scritto.

Dashboard self-hosted di monitoring del homelab. Container Docker unico, PWA mobile-first,
dark theme, UI in italiano, raggiungibile solo via Tailscale.

---

## 0. Ricognizione — fatti verificati sul campo

Verifiche eseguite il 2026-08-14 via SSH (sola lettura). Correggono tre assunzioni della richiesta.

| Voce | Esito |
|---|---|
| Uptime Kuma | **porta `3002`** (`0.0.0.0:3002->3001/tcp`), non 3001. `3001` è **Gitea**. |
| Uptime Kuma API | immagine `louislam/uptime-kuma:1` → **nessuna REST API**. `/metrics` risponde `401` senza auth → esiste, richiede API key. |
| Scrutiny | `GET :8087/api/summary` → `200`, **senza autenticazione**. |
| Scrutiny — sdb | `device_status: 2` (failed). sda e sdc: `0`. Il guasto è già esposto in API. |
| Restic | `/var/lib/nas-backup/state.json` → `{"last_run":"2026-08-14T03:14:16+02:00","exit":0,"msg":"ok"}`. `-rw-r--r-- root:root` → leggibile senza sudo. |
| Cert TLS | `notBefore=Aug 7 2026`, **`notAfter=Nov 5 11:23:47 2026 GMT`** → **83 giorni**. Issuer Let's Encrypt `YE1`, CN `dh4300plus-fix.taile39e4f.ts.net`. Già sotto soglia 90gg. |
| hpserver | `x86_64`, Docker `29.7.1`, Compose `v5.4.0`, `189 GB` liberi su ext4/LVM, Tailscale nativo `100.92.242.72`. |
| NAS | 28 container attivi, Tailscale `100.98.207.48`. |

**Due prerequisiti bloccanti scoperti** (vedi §9): l'utente `nicholas` su hpserver **non è nel gruppo
`docker`**, e hpserver **non ha ancora trust SSH verso il NAS** (`Host key verification failed`).

---

## 1. Decisione host: **hpserver** (x86_64)

Raccomandazione netta, per un motivo che sovrasta tutti gli altri:

> **Un monitor non deve vivere nel dominio di guasto che monitora.**

Se la dashboard gira sul NAS, nel momento esatto in cui serve — NAS che non risponde, disco che
cede, Docker che si pianta — la dashboard è giù insieme a lui. Su hpserver, se il NAS cade,
la dashboard resta viva e **te lo dice**.

Argomenti secondari, tutti concordi:

| | hpserver | NAS |
|---|---|---|
| Arch | x86_64 → immagini Node standard, build native, niente QEMU | ARM64 → build più lente, `better-sqlite3` da compilare |
| Carico | Solo Jellyfin | **28 container**, già denso |
| Storage | 189 GB liberi, ext4 su LVM | Volume 2 quasi pieno, **sdb in guasto** |
| Tailscale | Nativo sull'host | In container |
| Docker del NAS | Via SSH (già la modalità operativa da CLAUDE.md) | Socket locale |
| Dominio di guasto | **Separato** | Condiviso |

Unico prezzo: il monitoring dei container del NAS passa da SSH invece che dal socket locale.
È esattamente il pattern che già usi per le operazioni live, quindi nessuna deviazione.

**Storage SQLite**: named volume Docker su hpserver → `/var/lib/docker/volumes/...` su ext4/LVM
locale. Nessun NFS/SMB coinvolto, invariante rispettata.

---

## 2. Stack tecnico

### Backend
| Componente | Scelta | Perché |
|---|---|---|
| Runtime | Node 22 LTS (`node:22-alpine`) | LTS fino ad aprile 2027 |
| HTTP | **Fastify 5** | Leggero, schema validation nativa, SSE semplice; Express è più pesante per zero vantaggi qui |
| DB | **better-sqlite3** + WAL | Sincrono → niente async inutile su un DB da pochi MB; WAL per letture concorrenti |
| Migrazioni | SQL numerati applicati al boot | Nessun ORM: lo schema è piccolo e stabile |
| Scheduler | **node-cron** in-process | Nessun servizio esterno |
| SSH | **`ssh2`** (JS puro) | Niente binario `openssh` nell'immagine, **host key pinning esplicito**, connessioni riusabili |
| TLS check | **`node:tls` nativo** | Vedi nota sotto |
| Log | `pino` | Strutturato, nativo Fastify |

> **Nota su `openssl s_client`**: la richiesta lo indicava, ma `tls.connect()` +
> `socket.getPeerCertificate().valid_to` fa la stessa cosa in-process, senza spawnare
> processi, senza aggiungere `openssl` all'immagine e con gestione errori/timeout pulita.
> Stesso risultato, meno superficie. Se preferisci il comando esterno lo cambio.

### Frontend
| Componente | Scelta |
|---|---|
| Framework | **React 19 + TypeScript** |
| Build | **Vite 7** |
| Stile | **Tailwind CSS v4** — dark theme come default, non come variante |
| Routing | `react-router` v7 (data mode) |
| Fetch/cache | **TanStack Query** — refetch automatico, stale-while-revalidate, retry: metà del lavoro di una dashboard è già scritto qui |
| Grafici | **Recharts** — solo se servono (temperature disco, storico uptime) |
| PWA | **`vite-plugin-pwa`** (Workbox) — manifest + service worker generati |
| Date | `date-fns` + locale `it` |

### Container
Multi-stage: stage 1 builda il frontend, stage 2 installa solo le dipendenze di produzione del
server e copia i bundle statici. Un'unica immagine, un unico processo, porta interna **8090**.
Fastify serve `/api/*` e gli statici del frontend con fallback SPA.

---

## 3. Architettura runtime

```
┌───────────── hpserver 192.168.0.33 / tailscale 100.92.242.72 ────────────┐
│                                                                          │
│   container: homelab-hub                                                 │
│   ┌────────────────────────────────────────────────────────────┐         │
│   │  Fastify :8090                                             │         │
│   │   ├── static/  → React SPA (PWA)                           │         │
│   │   ├── /api/*   → legge SEMPRE da SQLite (mai live)         │         │
│   │   └── /api/stream → SSE push su cambio stato               │         │
│   │                                                            │         │
│   │  Scheduler (node-cron) ──► Collectors ──► SQLite           │         │
│   │       docker    60s                                        │         │
│   │       kuma      60s                                        │         │
│   │       scrutiny  15m                                        │         │
│   │       restic    15m                                        │         │
│   │       tls       12h                                        │         │
│   └────────────────────────────────────────────────────────────┘         │
│        volume: hub-data → /data/hub.db  (ext4 locale)                    │
└──────────────────────────────────────────────────────────────────────────┘
      │ SSH (ssh2, chiave dedicata)      │ HTTP LAN            │ TLS
      ▼                                  ▼                     ▼
   NAS docker ps/inspect          Scrutiny :8087        ts.net:44075
   NAS cat state.json             Kuma :3002 /metrics   (cert expiry)
```

**Principio chiave — disaccoppiamento totale**: i collector scrivono su SQLite, le API leggono
solo da SQLite. Se il NAS è irraggiungibile, la dashboard apre in 50 ms e mostra
*"NAS non raggiungibile — ultimo dato 4 minuti fa"*. Nessuna richiesta HTTP dell'utente attende
mai una risposta SSH. Questo è ciò che distingue una dashboard utile da una che si impianta
proprio quando serve.

---

## 4. API e endpoint del monitoring

### 4.1 Container Docker del NAS — SSH

Connessione persistente `ssh2` verso `nicholasizzo@192.168.0.36`, chiave ed25519 dedicata,
`hostVerifier` che confronta l'impronta con un valore fisso in `.env` (host key pinning).

Comando singolo, un round-trip:

```sh
docker ps -a --format '{{json .}}'
```

Campi usati: `Names`, `Image`, `State`, `Status`, `Ports`, `CreatedAt`.
Lo `Status` (`Up 7 days (healthy)`) contiene già health e uptime → parsing, nessuna seconda chiamata.

Per **restart count** serve `inspect`, quindi una seconda chiamata sui soli container non-running
o con restart recenti:

```sh
docker inspect --format '{{.Name}} {{.RestartCount}} {{.State.StartedAt}} {{.State.Health.Status}}' $(docker ps -aq)
```

Stato derivato per container: `running-healthy` / `running-unhealthy` / `running-no-healthcheck`
/ `restarting` / `exited` / `created`.

> **Guard-rail Mullvad**: il gruppo `gluetun` + `qbittorrent-vpn` viene renderizzato come **unità
> atomica singola** con un badge esplicito *"aggiornare solo insieme"*. La dashboard è
> **read-only**: nessun pulsante di restart/update, per nessun container. Elimina alla radice il
> rischio di orfanare qBittorrent dal namespace di rete di Gluetun.

Nota: `prometheus:9091` / `cadvisor:8080` / `node-exporter:9100` sul NAS restano disponibili
come sorgente per grafici storici (CPU/RAM/rete) in una fase successiva. Non servono ora:
non espongono restart count né health status Docker.

### 4.2 Salute dischi — Scrutiny

```
GET http://192.168.0.36:8087/api/summary        (no auth, verificato)
GET http://192.168.0.36:8087/api/device/{wwn}/details
```

Estrazione da `data.summary[wwn]`:
`device.device_name`, `device.model_name`, `device.device_serial_id`, `device.capacity`,
`device.device_status`, `smart.temp`, `smart.power_on_hours`, `smart.collector_date`.

Mappa `device_status`: `0` = OK · `1` = SMART failed · `2` = soglie Scrutiny superate · `3` = entrambi.

Stato attuale rilevato:

| WWN | Dev | Modello | Status | Temp | POH |
|---|---|---|---|---|---|
| `0x50014ee215e4e2ab` | sda | WD40EFPX-68C6CN0 | 0 | 38 °C | 3918 |
| `0x50014ee26c4979f9` | **sdb** | WD40EFPX-68C6CN0 | **2 — FAILED** | 38 °C | 6054 |
| `0x5000c500eb8314bc` | sdc | ST12000VN0008 | 0 | 39 °C | 4713 |

**sdb deve essere impossibile da non vedere**: card rossa in cima alla home, sopra ogni altra
cosa, con il conteggio dei Pending Sectors letto da `/details` (attributo SMART `197`) e la
dicitura *"RMA in corso"*. Se il valore 283 cresce, il delta viene mostrato in evidenza.
Nessuna azione disco esposta dalla UI — mai.

### 4.3 Ultimo backup — Restic

```sh
ssh nicholasizzo@192.168.0.36 "cat /var/lib/nas-backup/state.json"
```

Formato confermato: `{"last_run":"2026-08-14T03:14:16+02:00","exit":0,"msg":"ok"}`

Logica di stato:

| Condizione | Stato |
|---|---|
| `exit == 0` e `last_run` < 36 h | **OK** |
| `exit == 0` e `last_run` ≥ 36 h | **WARN — backup stantio** |
| `exit != 0` | **CRITICO** — mostra `msg` |
| file assente / JSON invalido | **CRITICO — stato sconosciuto** |

Il timestamp è già in offset `+02:00` → parsing diretto, reso come *"oggi alle 03:14"* / *"2 giorni fa"* in Europe/Rome.

### 4.4 Certificato TLS Vaultwarden

`tls.connect({ host: '100.98.207.48', port: 44075, servername: 'dh4300plus-fix.taile39e4f.ts.net' })`
→ `getPeerCertificate().valid_to` → giorni residui.

Uso l'**IP Tailscale del NAS** (`100.98.207.48`) con SNI esplicito invece del nome MagicDNS:
un container in rete bridge non risolve `.ts.net` senza puntare il DNS a `100.100.100.100`.
L'IP + SNI evita del tutto la dipendenza dal DNS. In alternativa, `extra_hosts` nel compose.

Soglie: `< 21 gg` critico · `< 45 gg` warning · sopra OK. Cert Let's Encrypt = 90 giorni, NPM
rinnova a ~30 giorni dalla scadenza, quindi 21/45 non generano falsi allarmi cronici (la soglia
90 gg richiesta per l'hardware sarebbe sempre rossa su un cert a 90 giorni).

**Oggi: 83 giorni residui.**

### 4.5 Uptime servizi — Uptime Kuma

**Porta corretta: `3002`.** Kuma v1 non espone REST API. Sorgente scelta:

```
GET http://192.168.0.36:3002/metrics
Authorization: Basic base64(":" + UPTIME_KUMA_API_KEY)
```

Formato Prometheus, già tutto quello che serve:

```
monitor_status{monitor_name="Vaultwarden",monitor_type="http",...} 1
monitor_response_time{monitor_name="Vaultwarden",...} 143
monitor_cert_days_remaining{monitor_name="Vaultwarden",...} 83
```

`monitor_status`: `0` down · `1` up · `2` pending · `3` maintenance.

Serve generare una API key in Kuma → *Profilo → API Keys → Add API Key*, da mettere in `.env`.

*Fallback se non vuoi creare la key*: status page pubblica + `GET /api/status-page/heartbeat/{slug}`
(risponde `200`, verificato). Meno ricco e richiede di configurare una status page — preferisco `/metrics`.

### 4.6 API interne esposte al frontend

| Metodo | Endpoint | Descrizione |
|---|---|---|
| `GET` | `/api/health` | liveness, no auth |
| `GET` | `/api/overview` | payload unico della home: tutti i monitor + scadenze imminenti + sintesi budget |
| `GET` | `/api/monitors/docker` | container NAS + timestamp ultima raccolta |
| `GET` | `/api/monitors/disks` | dischi Scrutiny |
| `GET` | `/api/monitors/backup` | stato Restic |
| `GET` | `/api/monitors/tls` | scadenza cert |
| `GET` | `/api/monitors/uptime` | monitor Kuma |
| `POST` | `/api/monitors/refresh` | forza un giro di polling (rate-limited 1/30s) |
| `GET` | `/api/stream` | SSE: push al frontend quando cambia uno stato |
| `GET POST PATCH DELETE` | `/api/deadlines[/:id]` | scadenze |
| `GET POST PATCH DELETE` | `/api/finance/recurring[/:id]` | spese ricorrenti |
| `GET POST PATCH DELETE` | `/api/finance/purchases[/:id]` | acquisti una tantum |
| `GET PUT` | `/api/finance/budget` | budget mensile |
| `GET POST PATCH DELETE` | `/api/finance/goals[/:id]` | obiettivi di risparmio |
| `POST` | `/api/auth/login` · `/api/auth/logout` · `GET /api/auth/me` | sessione |

Ogni risposta di monitoring include `collected_at` e `stale: bool` → la UI mostra sempre
**quanto è vecchio** il dato, mai un numero senza data.

---

## 5. Schema SQLite

```
settings(key TEXT PK, value TEXT)

monitor_state(source TEXT PK, payload TEXT JSON, status TEXT,
              collected_at TEXT, error TEXT)
              -- source: docker | disks | backup | tls | uptime
              -- una riga per fonte: sempre l'ultimo stato buono + eventuale errore corrente

monitor_history(id PK, source, status, metric REAL, recorded_at)
              -- retention 30 gg, per sparkline; purge notturno

deadlines(id PK, title, category, due_date, alert_days DEFAULT 90,
          notes, url, auto_source, archived)
          -- category: garanzia | abbonamento | certificazione | tls | custom
          -- auto_source: NULL oppure 'tls' → la data arriva dal collector, non è editabile

recurring_expenses(id PK, label, amount_cents INT, currency DEFAULT 'EUR',
                   period, category, active, started_on, notes)
                   -- period: monthly | quarterly | semiannual | annual

purchases(id PK, label, amount_cents INT, purchased_on, category, notes)

budget(id PK, month TEXT 'YYYY-MM', amount_cents INT)

savings_goals(id PK, label, target_cents INT, saved_cents INT,
              target_date, priority, archived)
```

**Tutti i soldi in centesimi interi.** Nessun float su valuta, mai.

---

## 6. Funzionalità — comportamento

### 6.1 Scadenze
Countdown in giorni, ordinamento per urgenza, tre bande: rosso `< alert_days/3`, ambra
`< alert_days`, verde oltre. `alert_days` default **90** come richiesto, override per voce.

Pre-popolate al primo avvio (seed, tutte editabili):

| Voce | Categoria | Data | Nota |
|---|---|---|---|
| Garanzia NAS Ugreen DH4300 Plus | garanzia | **da confermare** | data acquisto? |
| Garanzia hpserver HP ProDesk 600 G4 | garanzia | **da confermare** | probabile fuori garanzia |
| Garanzia sda — WD Red Plus 4TB | garanzia | 2028-11-30 | WD 5 anni |
| Garanzia sdb — WD Red Plus 4TB | garanzia | 2028-11-30 | **RMA in corso** — collegata al widget disco |
| Garanzia sdc — Seagate IronWolf 12TB | garanzia | **da confermare** | IronWolf = 3 anni |
| Abbonamento Mullvad | abbonamento | **da confermare** | |
| Certificazione AZ-104 | certificazione | conseguita | rinnovo annuale Microsoft → data da confermare |
| Certificazione AZ-400 | certificazione | 2026-10-31 | target esame |
| Cert TLS Vaultwarden | tls | **2026-11-05** | `auto_source='tls'`, aggiornata dal collector |

Le voci "da confermare" nascono con badge *"data mancante"* e non generano alert finché non le compili.
Non invento date che non mi hai dato.

### 6.2 Finanze
- **Ricorrenti** → normalizzate in equivalente mensile (`annual/12`, `quarterly/3`, `semiannual/6`),
  totale in cima. Costo elettricità: voce ricorrente normale, con nota per il calcolo W→€/mese.
- **Una tantum** → lista con totale annuo e totale storico, separate dal ricorrente.
- **Budget mensile** → barra: speso ricorrente + una tantum del mese corrente vs budget;
  residuo disponibile in evidenza. Sopra budget → barra rossa con overshoot.
- **Obiettivi** → progress bar + `(target − risparmiato) / mesi al target = €/mese necessari`.
  Se non c'è data target, calcolo inverso: *"a X €/mese lo raggiungi in N mesi"*.
  Seed: EliteDesk 375 € · UPS 70 € · Router ASUS 280 €.
- Ogni importo editabile inline. Nessuna integrazione bancaria, tutto manuale come richiesto.

### 6.3 UI mobile-first
Home a card verticali, priorità dall'alto:

1. **sdb — guasto disco** (rossa, fissa in cima finché lo stato è `2`)
2. **Anomalie** — container down/unhealthy, backup fallito, monitor Kuma down
3. **Scadenze imminenti** (< 90 gg)
4. **Container** — griglia compatta, filtro "solo problemi"
5. **Dischi** — temp + stato
6. **Backup + Cert TLS**
7. **Budget del mese** — barra
8. **Obiettivi** — progress

Tab bar in basso (pollice): **Stato · Scadenze · Soldi · Impostazioni**.
Palette scura con accenti semantici (verde/ambra/rosso), tipografia grande, target touch ≥ 44 px,
`env(safe-area-inset-*)` per il notch iPhone.

---

## 7. Sicurezza — raccomandazione

**Sì, serve autenticazione. Leggera, non Authentik.**

Il perimetro Tailscale da solo non basta, per due ragioni concrete:

1. **Bind di rete.** Il container va pubblicato **solo sull'IP Tailscale**:
   `ports: ["100.92.242.72:8090:8090"]`. Con `0.0.0.0` chiunque sulla LAN `192.168.0.0/24` —
   ospiti sul Wi-Fi, dispositivi IoT — arriva alla dashboard. Il binding esplicito è la
   metà più importante della difesa.
2. **Il tailnet non è omogeneo.** Contiene tre Fire TV Android e altri device che non
   amministri con la stessa cura del PC. Un tailnet è un perimetro di rete, non un
   controllo d'accesso per-utente.

E il contenuto lo merita: inventario dell'infrastruttura, hostname, porte, stato dei servizi,
e i tuoi dati finanziari.

**Proposta**: utente singolo, password hashata **argon2id** in `.env`, cookie di sessione
`HttpOnly` `SameSite=Strict` `Secure`, durata 90 giorni con rolling refresh (la PWA su iPhone
non deve chiedere la password ogni volta), rate limit sul login. ~60 righe, zero dipendenze
esterne, nessun IdP da mantenere.

**Perché non Authentik** (che pure hai già): forward-auth davanti a una PWA rompe il service
worker e i redirect OIDC in standalone mode su iOS sono fragili. Sproporzionato per un'app a
utente singolo.

**Complemento consigliato (dopo)**: ACL Tailscale che limiti la porta 8090 di hpserver ai soli
tuoi device personali, escludendo Fire TV e simili. Difesa in profondità, non sostituto della password.

Altre misure: nessuna scrittura verso NAS o Docker (app strettamente read-only sull'infra),
chiave SSH **dedicata** e non riusata, host key pinning, secret solo in `.env` fuori dal repo,
container `read_only: true` con `tmpfs` per `/tmp`, `cap_drop: ALL`, `no-new-privileges`,
utente non-root.

---

## 8. Layout file nel repo

```
homelab/
└── docker/
    └── homelab-hub/
        ├── docker-compose.yaml          # servizio, bind su IP Tailscale, volume, healthcheck
        ├── .env.example                 # versionato — .env NO (già in .gitignore)
        ├── Dockerfile                   # multi-stage: web build → server runtime
        ├── .dockerignore
        ├── README.md                    # deploy, rollback, prerequisiti
        └── app/
            ├── package.json             # npm workspaces: server + web
            ├── tsconfig.base.json
            ├── server/
            │   ├── package.json
            │   └── src/
            │       ├── index.ts             # bootstrap Fastify
            │       ├── config.ts            # env parsing + validazione, fail-fast al boot
            │       ├── db/
            │       │   ├── index.ts         # better-sqlite3, WAL, pragma
            │       │   ├── migrations/      # 001_init.sql, 002_...
            │       │   └── seed.ts          # scadenze e obiettivi pre-popolati
            │       ├── collectors/
            │       │   ├── ssh.ts           # pool ssh2 + host key pinning
            │       │   ├── docker.ts        # docker ps / inspect → parsing
            │       │   ├── scrutiny.ts      # /api/summary + /details
            │       │   ├── restic.ts        # state.json
            │       │   ├── tls.ts           # tls.connect → valid_to
            │       │   └── uptimeKuma.ts    # /metrics → parser Prometheus
            │       ├── scheduler.ts         # node-cron, intervalli differenziati
            │       ├── routes/
            │       │   ├── monitors.ts  deadlines.ts  finance.ts
            │       │   ├── auth.ts      stream.ts
            │       └── auth/
            │           ├── session.ts   password.ts
            └── web/
                ├── package.json  vite.config.ts  tailwind.config.ts  index.html
                ├── public/
                │   ├── manifest.webmanifest
                │   ├── icon-192.png  icon-512.png  icon-maskable-512.png
                │   └── apple-touch-icon.png
                └── src/
                    ├── main.tsx  App.tsx  router.tsx
                    ├── pages/       Stato.tsx  Scadenze.tsx  Finanze.tsx  Impostazioni.tsx
                    ├── components/  cards, StatoBadge, ProgressBar, CountdownPill, ...
                    ├── lib/         api.ts  format.ts (it-IT, EUR, Europe/Rome)  useSSE.ts
                    └── styles/      theme.css
docs/
└── homelab-hub-design.md                # questo documento
```

Il codice sta sotto `docker/homelab-hub/app/` così che il build context del Dockerfile sia
la directory stessa: un solo posto, `git pull && docker compose up -d --build` e basta.

### docker-compose.yaml — forma prevista

```yaml
services:
  homelab-hub:
    build: .
    image: homelab-hub:0.1.0          # tag fisso, MAI :latest
    container_name: homelab-hub
    restart: unless-stopped
    ports:
      - "100.92.242.72:8090:8090"     # solo Tailscale, non LAN
    volumes:
      - hub-data:/data                # SQLite — volume Docker locale, mai NFS/SMB
      - ./secrets/id_ed25519_hub:/run/secrets/ssh_key:ro
    env_file: .env
    read_only: true
    tmpfs: [/tmp]
    cap_drop: [ALL]
    security_opt: ["no-new-privileges:true"]
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:8090/api/health').then(r=>process.exit(r.ok?0:1))"]
      interval: 30s
volumes:
  hub-data:
```

### .env.example
```
TZ=Europe/Rome
SESSION_SECRET=
ADMIN_PASSWORD_HASH=              # argon2id
NAS_SSH_HOST=192.168.0.36
NAS_SSH_USER=nicholasizzo
NAS_SSH_KEY=/run/secrets/ssh_key
NAS_SSH_HOST_FINGERPRINT=         # SHA256:... pinning
SCRUTINY_URL=http://192.168.0.36:8087
UPTIME_KUMA_URL=http://192.168.0.36:3002
UPTIME_KUMA_API_KEY=
VAULTWARDEN_TLS_HOST=100.98.207.48
VAULTWARDEN_TLS_PORT=44075
VAULTWARDEN_TLS_SERVERNAME=dh4300plus-fix.taile39e4f.ts.net
RESTIC_STATE_PATH=/var/lib/nas-backup/state.json
```

---

## 9. Prerequisiti da sistemare prima di FASE 2

Scoperti in ricognizione, ti riguardano — nessuno lo eseguo senza tua conferma.

1. **`nicholas` non è nel gruppo `docker` su hpserver** → `docker ps` dà permission denied.
   Serve `sudo usermod -aG docker nicholas` + nuovo login. (È in `sudo`, quindi fattibile.)
2. **hpserver non ha trust SSH verso il NAS** → `Host key verification failed`.
   Serve accettare la host key una volta e raccoglierne l'impronta SHA256 per il pinning.
3. **Chiave SSH dedicata** `id_ed25519_hub` da generare su hpserver e autorizzare sul NAS.
   Dedicata, non riusata, così è revocabile da sola.
4. **API key Uptime Kuma** da creare (Profilo → API Keys).
5. **Date mancanti** per il seed scadenze (§6.1): acquisto NAS, hpserver, sdc, rinnovo Mullvad,
   scadenza AZ-104.

---

## 10. Piano di sviluppo in fasi

Ogni fase è deployabile e utile da sola. Un commit per fase, tag fisso incrementale.

### Fase 2 — Scheletro e container *(base)*
Monorepo, Dockerfile multi-stage, compose, SQLite + migrazioni, Fastify che serve la SPA,
shell React con tab bar e dark theme, `/api/health`.
**Esito**: container che gira su hpserver, apre da iPhone via Tailscale, ancora vuoto.
Verifica in anticipo che il container e il deploy funzionino, prima di investire nella logica.

### Fase 3 — Collector e monitoring *(il cuore)*
Nell'ordine, dal più semplice al più complesso — ognuno verificabile da solo:
1. `restic` (leggere un file — banale, valida l'intera pipeline SSH)
2. `tls` (nessuna dipendenza esterna)
3. `scrutiny` (HTTP, no auth) → **card sdb subito**
4. `uptimeKuma` (HTTP + API key + parser Prometheus)
5. `docker` (SSH, parsing più corposo, gruppo Mullvad atomico)

Poi scheduler, `monitor_state`, `/api/overview`, pagina **Stato** completa, SSE.
**Esito**: la dashboard di monitoring funziona. È già il 70% del valore.

### Fase 4 — Scadenze
CRUD, countdown, bande di alert, seed, collegamento `auto_source='tls'`.
**Esito**: pagina Scadenze completa.

### Fase 5 — Finanze
Ricorrenti + normalizzazione mensile, una tantum, budget con barra, obiettivi con €/mese.
**Esito**: pagina Finanze completa.

### Fase 6 — PWA e hardening
Manifest, icone, service worker (**cache solo lo shell, mai le risposte API autenticate**),
`apple-mobile-web-app-capable`, safe-area, splash. Auth argon2id + sessioni, rate limit,
`read_only`/`cap_drop`, utente non-root. Installazione da home screen iPhone testata.
**Esito**: v1.0.0.

### Fase 7 — Opzionali, da decidere dopo
Web Push per alert (iOS ≥ 16.4, funziona solo da PWA installata) · grafici storici da
Prometheus/cAdvisor · export CSV finanze · monitoring di hpserver stesso · widget meteo del
disco sdb post-RMA.

---

## Sintesi delle decisioni

| Domanda | Risposta |
|---|---|
| Dove gira | **hpserver** — fuori dal dominio di guasto che monitora |
| Serve auth | **Sì**, password argon2id + sessione lunga. Non Authentik. Più bind solo su IP Tailscale |
| Porta Kuma | **3002** (`3001` è Gitea), via `/metrics` con API key |
| `openssl s_client` | Sostituito da `tls.connect()` nativo — stesso dato, meno superficie |
| Azioni sui container | **Nessuna** — read-only. Protegge lo stack Gluetun/qBittorrent |
| Cert TLS | **83 giorni** residui oggi (scade 2026-11-05) |

**In attesa di approvazione prima di scrivere codice.**
