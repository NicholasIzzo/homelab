# Restore Guide — NAS backup con Restic

Questa guida copre il ripristino del backup Restic del NAS. Va usata sotto
stress — è scritta per essere seguita a occhi chiusi, non spiegata.

Contesto:
- **Repo Restic**: `sftp:nicholas@192.168.0.33:/home/nicholas/backups/nas-restic-repo`
- **Password**: `/etc/restic/repo-password` sul NAS, copia in Vaultwarden, copia
  scritta a mano su foglio fisico conservato in `<inserisci luogo fisico>`.
- **Script**: `/usr/local/sbin/nas-backup.sh` sul NAS.
- **Timer**: `nas-backup.timer` (daily 03:00).

## Prima di ogni restore

Verifica che il repo sia sano:

```bash
restic snapshots
restic check                         # veloce, non legge i pack
restic check --read-data-subset=5%   # legge il 5% dei pack, ~1 min
```

Se `check` fallisce → **stop, non fare restore**. Il repo è corrotto. Vai a
"Scenario 4" per ricostruire da fonte alternativa.

---

## Scenario 1 — Restore file singolo

Il caso più comune: hai bisogno di un file specifico da un backup di N giorni fa.

```bash
# 1. Trova lo snapshot giusto
restic snapshots

# 2. Sfoglia contenuto (opzionale)
restic ls <snapshot-id> | grep vaultwarden

# 3. Restore in dir temporanea
restic restore <snapshot-id> \
  --target /tmp/restore \
  --include /volume1/docker/vaultwarden/config.json

# 4. Copia dove serve
cp /tmp/restore/volume1/docker/vaultwarden/config.json /volume1/docker/vaultwarden/
```

## Scenario 2 — Restore singolo stack (container rotto)

Esempio: Vaultwarden. Prima ferma il container per evitare che scriva sul volume
durante il restore.

```bash
cd /volume1/docker/vaultwarden
docker compose down

# Backup di sicurezza dello stato attuale (anche se rotto)
mv /volume1/docker/vaultwarden /volume1/docker/vaultwarden.broken.$(date +%Y%m%d)

# Restore
restic restore <snapshot-id> \
  --target / \
  --include /volume1/docker/vaultwarden

# Sostituisci il DB live con lo snapshot consistente dallo staging
cp /volume1/docker/_backup-staging/vaultwarden/db.sqlite3 \
   /volume1/docker/vaultwarden/db.sqlite3

# Nota: -wal e -shm NON vanno ripristinati. Vaultwarden li rigenererà.
rm -f /volume1/docker/vaultwarden/db.sqlite3-wal \
      /volume1/docker/vaultwarden/db.sqlite3-shm

docker compose up -d
docker logs -f vaultwarden_server-1
```

Stessa procedura per **Gitea** (DB in `data/gitea/gitea.db`) e **Semaphore**
(DB in `data/database.sqlite`) — cambia solo il path del DB nello staging.

## Scenario 3 — Restore completo del NAS (Docker wiped)

NAS ancora vivo ma `/volume1/docker/` è andato (errore, disco corrotto,
migrazione hardware). hpserver e repo Restic intatti.

```bash
# 1. Reinstalla restic (se assente)
RESTIC_VER=0.17.3
curl -LO https://github.com/restic/restic/releases/download/v${RESTIC_VER}/restic_${RESTIC_VER}_linux_arm64.bz2
bunzip2 restic_${RESTIC_VER}_linux_arm64.bz2
sudo install -m 0755 restic_${RESTIC_VER}_linux_arm64 /usr/local/bin/restic

# 2. Ricrea la password file (dal foglio fisico o da Vaultwarden)
sudo mkdir -p /etc/restic
sudo -e /etc/restic/repo-password   # incolla, salva
sudo chmod 600 /etc/restic/repo-password

# 3. Verifica accesso repo
export RESTIC_REPOSITORY="sftp:nicholas@192.168.0.33:/home/nicholas/backups/nas-restic-repo"
export RESTIC_PASSWORD_FILE=/etc/restic/repo-password
restic snapshots

# 4. Ferma docker per evitare I/O concorrente
sudo systemctl stop docker

# 5. Restore
restic restore latest --target / --include /volume1/docker

# 6. Rimpiazza DB live con snapshot consistenti (vedi Scenario 2 per pattern)
for stack in vaultwarden gitea semaphore; do
  # adatta i path per ogni stack, cfr. Scenario 2
  :
done

# 7. Riavvia
sudo systemctl start docker
cd /volume1/docker/<stack>/ && docker compose up -d   # per ogni stack
```

Tempo stimato: 30-60 min (12 GB su LAN gigabit + startup container).

## Scenario 4 — DISASTER: hpserver morto (e/o NAS morto)

Scenario peggiore realistico: entrambi nello stesso building, evento fisico
(alluvione, furto, incendio locale) o guasto simultaneo. Il repo Restic **è
solo lì**. Off-site non è ancora attivo (roadmap: B2 + USB esterno).

### Cosa ti serve per ripristinare da zero

Materiali:
- **Il disco fisico di hpserver** (o un'immagine del suo `/home/nicholas/backups/`),
  recuperato dalla macchina morta.
- **La password del repo Restic**, dal foglio fisico. Senza foglio + senza
  Vaultwarden accessibile → **backup irrecuperabile**. Non c'è workaround.
- Una macchina Linux funzionante (laptop con Ubuntu live USB va bene). Non
  serve ARM64: restic gira su qualsiasi arch, il repo è portable.
- Binary restic per l'architettura della macchina rescue
  (https://github.com/restic/restic/releases).

### Procedura

```bash
# 1. Recupera fisicamente il disco di hpserver
#    - Espellilo dal case
#    - Montalo via adattatore USB-SATA su un'altra macchina Linux
#    - hpserver è Ubuntu 24.04 con LVM standard SENZA LUKS (install default,
#      no full-disk encryption). Nessun passaggio cryptsetup necessario.

# 2. Attiva LVM e monta
sudo vgchange -ay
sudo mkdir -p /mnt/rescue
sudo mount /dev/ubuntu-vg/ubuntu-lv /mnt/rescue

# 3. Localizza il repo
ls /mnt/rescue/home/nicholas/backups/nas-restic-repo/
# deve contenere: config, data/, index/, keys/, snapshots/

# 4. Installa restic sulla macchina rescue
sudo apt install restic     # Ubuntu/Debian recenti
# oppure: binary da GitHub

# 5. Accedi al repo come path locale (non serve SFTP)
export RESTIC_REPOSITORY=/mnt/rescue/home/nicholas/backups/nas-restic-repo
restic snapshots       # ti chiederà la password — dal foglio fisico

# 6. Verifica integrità PRIMA di fidarti dei dati
restic check --read-data     # legge tutti i pack, richiede tempo

# 7. Restore su un disco esterno o su un nuovo NAS
restic restore latest --target /mnt/nuovo-nas/
```

**Punto critico**: se hpserver era l'unica copia del repo e il disco è
fisicamente danneggiato, la disponibilità del dato dipende dallo stato del
disco stesso — Restic non ha ridondanza intra-disco. Da qui la roadmap
off-site (B2 o USB esterno).

### Se hai perso anche il foglio

Non c'è workaround crittografico. La password protegge la chiave di
cifratura del repo con AES-256. Senza, il repo è dati random. Conservare
il foglio è la parte più importante di tutto il backup — più importante
del backup stesso.

---

## Test — un backup non testato non è un backup

### Test iniziale (obbligatorio prima di dichiarare "operativo")

Dopo il primo run del backup:

```bash
# Restore completo in dir temporanea
mkdir -p /tmp/restore-test
restic restore latest --target /tmp/restore-test

# Verifica presenza file chiave
ls -la /tmp/restore-test/volume1/docker/vaultwarden/db.sqlite3
ls -la /tmp/restore-test/volume1/docker/_backup-staging/vaultwarden/db.sqlite3

# Verifica integrità SQLite degli snapshot consistenti
for db in \
  /tmp/restore-test/volume1/docker/_backup-staging/vaultwarden/db.sqlite3 \
  /tmp/restore-test/volume1/docker/_backup-staging/gitea/gitea.db \
  /tmp/restore-test/volume1/docker/_backup-staging/semaphore/database.sqlite; do
  echo "=== $db ==="
  sqlite3 "$db" "PRAGMA integrity_check;"
done

# Se vuoi essere paranoico: avvia Vaultwarden puntato al DB restored
docker run --rm -d --name vault-test \
  -v /tmp/restore-test/volume1/docker/_backup-staging/vaultwarden:/data \
  -p 8081:80 \
  vaultwarden/server:latest
# apri http://192.168.0.36:8081, sblocca vault con la master password
docker rm -f vault-test

# Cleanup
rm -rf /tmp/restore-test
```

### Test periodico automatico (mensile)

Da implementare: script `nas-backup-restore-test.sh` schedulato con
`nas-backup-restore-test.timer` (OnCalendar=monthly). Esegue restore + integrity
check su dir tmp, notifica esito, cleanup. **Non ancora scriptato**, roadmap.

## Comandi diagnostici

```bash
# Lista snapshot con stats
restic snapshots --compact

# Spazio occupato dal repo
restic stats --mode raw-data
restic stats --mode restore-size

# Cronologia forget/prune
restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --dry-run

# Cerca un file specifico in tutti gli snapshot
restic find "config.json"

# Confronta due snapshot
restic diff <snap1> <snap2>
```

## Roadmap / gap noti

- Off-site secondario (B2 o USB esterno) — pianificato dopo stabilizzazione
  del backup on-site.
- Postgres di Authentik — non ancora nel backup (serve `pg_dump`).
- MariaDB — non ancora nel backup.
- Test restore mensile automatico — non ancora scriptato.
- Password paper location — **aggiorna qui**: `<inserisci luogo fisico>` (fallo
  su una copia locale non versionata, non committare la posizione).
- **Rifattorizzare Scenario 2** con pattern più sicuro: restore in `/tmp` e
  copia manuale dei singoli file, invece di `restic restore --target /` che
  sovrascrive file live. Riduce il blast radius se sbagli snapshot-id.
