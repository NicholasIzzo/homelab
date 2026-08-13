# Backup Guide — NAS Restic setup

Documento **operativo** del backup deployato. Per la procedura di ripristino
vedi [restore-guide.md](restore-guide.md).

## Architettura corrente

```
   NAS (192.168.0.36, ARM64, UGOS)              hpserver (192.168.0.33, Ubuntu 24.04)
   ┌───────────────────────────────┐           ┌─────────────────────────────┐
   │  /volume1/docker/  (12 GB)    │           │  /home/nicholas/backups/    │
   │      │                        │           │      nas-restic-repo/       │
   │      │  sqlite pre-hook       │           │      (encrypted, dedup)     │
   │      ▼                        │           │                             │
   │  _backup-staging/             │           │                             │
   │      (consistent snapshots)   │           │                             │
   │      │                        │  SFTP     │                             │
   │      └────► restic backup ────┼──────────►│                             │
   │                               │  key auth │                             │
   └───────────────────────────────┘           └─────────────────────────────┘
        systemd timer daily 03:00                   198 GB free (11% used)
```

- **Tool**: Restic (single binary, AES-256, deduplicated)
- **Target**: hpserver via SFTP con chiave SSH
- **Schedule**: `nas-backup.timer` — daily 03:00 ±15min, Persistent=true
- **Retention**: 7 daily + 4 weekly + 6 monthly
- **Notifica**: Uptime Kuma push (se configurato) + `/var/lib/nas-backup/state.json`

**Off-site**: **NON ATTIVO**. hpserver è on-site (stesso building del NAS).
Questo backup copre guasti hardware, non disastri fisici. Roadmap: aggiungere
B2 o USB esterno come secondo target.

## Cosa viene backuppato

Tutto `/volume1/docker/` (12 GB, 27 stack), con queste eccezioni:

**Esclusi dal backup**:
- `**/*.log`, `**/logs/*` — log dei container (rigenerati automaticamente)
- File DB SQLite live di Vaultwarden, Gitea, Semaphore — sostituiti da snapshot
  consistenti in `_backup-staging/` (metodo `.backup` API di SQLite)

**NON ancora backuppato — roadmap**:
- Postgres di Authentik (`authentik-postgres`) — richiede `pg_dump`
- MariaDB — richiede `mariadb-dump`
- Nulla fuori da `/volume1/docker/` (es. `/volume2/` dati Btrfs — decisione
  consapevole, contiene media rilevanti solo in parte).

## File chiave

| Path | Cosa | Versionato? |
|---|---|---|
| `/usr/local/sbin/nas-backup.sh` | Script principale | Sì, in `docker/backup/` |
| `/etc/systemd/system/nas-backup.service` | Systemd unit | Sì |
| `/etc/systemd/system/nas-backup.timer` | Timer daily 03:00 | Sì |
| `/etc/restic/repo-password` | Password del repo | **NO — mai committare** |
| `/etc/restic/kuma-push-url` | URL push Uptime Kuma (opz.) | **NO** |
| `/var/lib/nas-backup/state.json` | Stato ultimo run | Generato, non committato |
| `/volume1/docker/_backup-staging/` | Snapshot SQLite temporanei | Effimero (pulito a fine run) |

## Comandi day-2

### Stato

```bash
# Prossima esecuzione + storico
systemctl list-timers nas-backup.timer
systemctl status nas-backup.service

# Ultimo run (JSON)
cat /var/lib/nas-backup/state.json

# Log dell'ultimo run
journalctl -u nas-backup.service -n 200

# Log live durante il run
journalctl -u nas-backup.service -f
```

### Trigger manuale

```bash
sudo systemctl start nas-backup.service
# oppure diretto:
sudo /usr/local/sbin/nas-backup.sh
```

### Snapshot e stats

```bash
export RESTIC_REPOSITORY="sftp:nicholas@192.168.0.33:/home/nicholas/backups/nas-restic-repo"
export RESTIC_PASSWORD_FILE=/etc/restic/repo-password

restic snapshots --compact
restic stats --mode raw-data       # spazio effettivo del repo
restic stats --mode restore-size   # dimensione se ripristinassi tutto

# Verifica integrità
restic check                       # veloce, solo metadata
restic check --read-data-subset=5% # legge campione dei pack
restic check --read-data           # legge tutto (lento, per audit periodico)
```

### Pause / disable temporaneo

```bash
# Sospendi solo il timer (il servizio resta triggerabile a mano)
sudo systemctl stop nas-backup.timer

# Ri-abilita
sudo systemctl start nas-backup.timer

# Disable persistente (non ripartirà al reboot)
sudo systemctl disable nas-backup.timer
```

## Monitoring e notifiche

### Uptime Kuma (raccomandato)

1. In Kuma: nuovo monitor tipo **Push**, heartbeat interval 26h (24h + margine).
2. Copia l'URL push generata.
3. Sul NAS: `sudo -e /etc/restic/kuma-push-url` → incolla URL, salva.
4. `sudo chmod 600 /etc/restic/kuma-push-url`.

Al prossimo run, lo script farà push automatico. Se un giorno il backup non
gira o fallisce, Kuma alerta via canale configurato (email/Telegram/etc).

### Fallback file di stato

Se Kuma non è configurato, monitora `/var/lib/nas-backup/state.json`:

```bash
# Check da riga di comando
jq . /var/lib/nas-backup/state.json

# Alert semplice — se ultimo run > 26h, urla
LAST=$(jq -r .last_run /var/lib/nas-backup/state.json)
AGE=$(( $(date +%s) - $(date -d "$LAST" +%s) ))
[ $AGE -gt 93600 ] && echo "BACKUP STALE ($AGE seconds)"
```

Può essere scriptato in un healthcheck cron secondario o esposto a Prometheus
tramite `node-exporter --collector.textfile.directory=/var/lib/node-exporter`
(già presente sul NAS).

## Aggiungere un nuovo servizio al backup

### Caso A: dati statici (config, volumi normali)

Se sta già dentro `/volume1/docker/<newstack>/`, **è già coperto** dal backup
esistente. Verifica al prossimo run che compaia in `restic ls`:

```bash
restic ls latest | grep newstack
```

### Caso B: servizio con SQLite

Aggiungi nel `nas-backup.sh`:

```bash
sqlite_snapshot <container-name> \
  /volume1/docker/<stack>/path/to/db.sqlite \
  "$STAGING/<stack>/db.sqlite"
```

E aggiungi gli `--exclude` corrispondenti al blocco `restic backup` per
il file live e i suoi `-wal` / `-shm`.

### Caso C: servizio con Postgres/MariaDB

Non ancora templato. Roadmap:
- Postgres: `docker exec <pg-container> pg_dumpall -U <user> > "$STAGING/<stack>/dump.sql"`
- MariaDB: `docker exec <maria-container> mariadb-dump --all-databases -u root -p<pwd>`

## Troubleshooting

### "restic: cannot open repository"

- Verifica chiave SSH: `ssh nicholas@192.168.0.33 "ls /home/nicholas/backups/nas-restic-repo"`
- Verifica password file: `sudo cat /etc/restic/repo-password | wc -c` (deve essere ~44+ byte)
- Verifica repo esiste: `ssh nicholas@192.168.0.33 "ls /home/nicholas/backups/nas-restic-repo/config"`

### "docker exec: container not running"

Il container SQLite target è down. Comportamento previsto: lo script fa `cp`
diretta del file DB (non c'è WAL attivo → safe). Verifica `docker ps`. Se il
container dovrebbe girare, investiga separatamente. **Il backup non si blocca**.

### Il backup ci mette ore

- Prima esecuzione: normale, deve caricare tutti i 12 GB. Runs successivi sono
  incrementali (deduplicati) → tipicamente pochi minuti.
- Se persiste: `restic prune` potrebbe essere in corso — occupa I/O intenso.
  Verifica in journal: `journalctl -u nas-backup.service | grep prune`.
- Rete SFTP saturata: `iperf3` tra NAS e hpserver per baseline. LAN gigabit
  dovrebbe stare ≥800 Mbit/s.

### Spazio hpserver in esaurimento

```bash
ssh nicholas@192.168.0.33 "df -h /home"
restic stats --mode raw-data
```

Se cresce oltre le attese (>30-40 GB dopo 3 mesi con retention 7/4/6):
- Verifica che `forget --prune` giri (log ultimo run).
- `restic forget --dry-run --keep-daily 7 --keep-weekly 4 --keep-monthly 6`
  per vedere cosa dovrebbe cancellare.

### Cambiare password del repo

```bash
restic key list
restic key add       # aggiungi nuova password
restic key remove <old-key-id>
```

Poi aggiorna `/etc/restic/repo-password` sul NAS **e la copia fisica su
carta e in Vaultwarden**. Se dimentichi di aggiornare la copia, disaster
recovery diventa impossibile.

## Concetti — perché così

### La regola 3-2-1

- **3** copie totali (originale + 2 backup)
- **2** supporti diversi
- **1** off-site

**Stato attuale**: siamo a 1-1-0 (NAS + hpserver, entrambi HDD, entrambi
on-site). Copre il 60% dei rischi realistici (guasti hardware, errori umani
su singolo host), non copre il 40% peggiore (disastro fisico locale).

### Perché Restic (e non rsync / rclone / duplicati)

- **rsync**: no dedup, no versionamento (rsync --backup è primitivo), niente
  cifratura built-in.
- **rclone**: sync files-as-are, non snapshot immutabili. Cifratura sì, ma
  senza dedup a livello di blocco.
- **Duplicati**: dedup + snapshot ma storicamente instabile, format del repo
  ha avuto breaking changes che hanno reso backup vecchi irrecuperabili.
- **Restic**: single binary, snapshot immutabili, dedup a blocchi, cifratura,
  format stabile (v1 dal 2015), multi-backend nativo.

### Perché SQLite `.backup` e non copia diretta

I file `.sqlite3` in write mode possono avere righe non ancora committate nel
WAL. Copiare `.sqlite3` da solo senza `-wal` = DB parziale, potenzialmente
corrotto al restore. Copiare entrambi = race condition sul WAL. La API
`.backup` di SQLite tratta lock e checkpoint atomicamente → snapshot
consistente al 100%.

## Roadmap

- [ ] Off-site secondario: B2 (~6$/mo per 1TB) o USB esterno con `restic copy`
- [ ] Postgres backup (authentik-postgres) via `pg_dump`
- [ ] MariaDB backup via `mariadb-dump`
- [ ] Test restore mensile automatico (`nas-backup-restore-test.timer`)
- [ ] Password paper location — compilare nella copia locale non versionata
- [ ] Migrare compose di tutti gli stack in repo (GitOps completo) — Semaphore
      già fatto, restanti 26 no.
- [ ] Considerare `restic check --read-data` mensile (integrità profonda)
- [ ] Rifattorizzare Scenario 2 del restore-guide con pattern `/tmp` + copia
      manuale (vedi roadmap in `restore-guide.md`)
