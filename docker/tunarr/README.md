# Tunarr

Canali TV lineari costruiti sulla libreria media, esposti a Jellyfin come tuner
HDHomeRun. Tunarr crea palinsesti (film, serie, filler/bumper), genera la guida
XMLTV e transcodifica al volo con FFmpeg.

- **Host**: hpserver (`192.168.0.33`), Ubuntu 24.04, i3-8100T + UHD 630.
- **Path deploy**: `~/homelab/docker/tunarr/`
- **Web UI**: <http://192.168.0.33:8000>
- **Immagine**: `ghcr.io/chrisbenincasa/tunarr:1.3.13` pinnata a digest.

## Scelte di configurazione, e perche'

| Scelta | Motivo |
|---|---|
| `network_mode: host` | L'immagine espone `1900/udp` per l'annuncio SSDP: e' cosi' che il "Detect My Devices" di Jellyfin trova il tuner. In bridge il multicast non esce dal container. Conseguenza: `ports:` e' ignorato, Tunarr occupa direttamente la `:8000` dell'host. |
| Gira come **root** | L'immagine non e' linuxserver.io (base `ersatztv-ffmpeg`, nessun init s6): `PUID`/`PGID` non esistono. E il non-root non e' praticabile: `meilisearch-linux-x64` ha permessi `0744`, eseguibile solo da root. Vedi sotto. |
| `./config:/config/tunarr` | La data dir nel container e' `/config/tunarr`, non `/config`. Montare `/config` lascerebbe il DB in un layer effimero: si perde tutto al primo aggiornamento. |
| `devices: /dev/dri` | VAAPI/QSV per FFmpeg. Nessuna immagine `-vaapi` separata: la variante hardware si abilita solo passando il device. |
| Healthcheck su `/api/system/health` | Tunarr **non** ha `/health`. `curl` e' presente nell'immagine base. `start_period: 120s` perche' al primo avvio viene costruito l'indice Meilisearch. |

## Primo avvio

```bash
mkdir -p ~/homelab/docker/tunarr/config
```

```bash
cd ~/homelab/docker/tunarr && docker compose pull && docker compose up -d
```

```bash
docker compose logs -f tunarr
```

La UI risponde su <http://192.168.0.33:8000>. Da li' si aggiungono le sorgenti
media (`/media/film`, `/media/serie`) e i canali.

### Perche' gira come root

Il primo tentativo di deploy usava `user: "1000:1000"` + `group_add` per video e
render, per non far girare il container come root. Non funziona, in due tappe:

1. `Error: EACCES: permission denied, mkdir '/root/.cache'` — l'eseguibile e'
   impacchettato con `pkg` ed estrae le native bindings di SQLite in `$HOME/.cache`,
   ma `HOME` resta `/root` anche cambiando `user:`. Aggirabile con `HOME=/config/tunarr`.
2. `spawn /tunarr/bin/meilisearch EACCES`, poi *"Unable to start process meilisearch
   after 3 attempts. Giving up"*. Questo **non** e' aggirabile:
   `/tunarr/server/bin/meilisearch-linux-x64` ha permessi `-rwxr--r--` (0744),
   cioe' il bit di esecuzione e' solo per root. Tunarr non parte senza Meilisearch.

Renderlo non-root richiederebbe un'immagine custom con un `chmod +x` sul binario,
rinunciando al pin sul digest upstream. Non ne vale il prezzo per un servizio in
LAN: resta root, come nella configurazione testata a monte.

Se in futuro upstream sistemasse i permessi, la variante non-root e'
`user: "1000:1000"` + `group_add: ["44", "993"]` + `HOME=/config/tunarr`.

## Aggiornare a una nuova versione

Mai `:latest`: si aggiorna cambiando il pin nel repo, non sul server.

1. Trovare la release stabile piu' recente:

```bash
curl -sL "https://api.github.com/repos/chrisbenincasa/tunarr/releases/latest" | grep '"tag_name"'
```

2. Recuperare il digest del tag su GHCR (il tag e' senza la `v` iniziale):

```bash
TOKEN=$(curl -s "https://ghcr.io/token?scope=repository:chrisbenincasa/tunarr:pull&service=ghcr.io" | sed -E 's/.*"token":"([^"]+)".*/\1/'); curl -sI -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.oci.image.index.v1+json" "https://ghcr.io/v2/chrisbenincasa/tunarr/manifests/<VERSIONE>" | grep -i docker-content-digest
```

3. **Backup prima dell'update** (vedi sotto): gli upgrade migrano lo schema del DB.
4. Aggiornare `image:` in `docker-compose.yaml` in questo repo, commit e push.
5. Sul server:

```bash
cd ~/homelab && git pull && cd docker/tunarr && docker compose pull && docker compose up -d
```

Rollback: ripristinare il pin precedente **e** il backup del DB — una volta
migrato, lo schema non torna indietro da solo.

## Backup

Tunarr ha un backup schedulato integrato (Settings > System > Backup, default
giornaliero alle 04:00, 3 copie in `config/backups/`). Include `db.db`,
`settings.json`, `channel-lineups/`, `images/`, `cache/`.

Trigger manuale:

```bash
curl -X POST "http://192.168.0.33:8000/api/tasks/BackupTask/run?background=true"
```

Il DB e' SQLite: copiare `db.db` con `cp` a container acceso puo' produrre un
file incoerente (WAL a meta'). Backup a caldo consistente:

```bash
sqlite3 ~/homelab/docker/tunarr/config/db.db ".backup '/home/nicholas/backup/tunarr-db-$(date +%Y%m%d).db'"
```

`sqlite3` non e' installato di default su hpserver; in alternativa, senza
aggiungere pacchetti, si usa il client gia' presente nell'immagine oppure si
ferma il container e si copia a freddo:

```bash
cd ~/homelab/docker/tunarr && docker compose stop && cp config/db.db ~/backup/tunarr-db-$(date +%Y%m%d).db && docker compose start
```

L'indice Meilisearch (`config/data.ms/`) puo' pesare diversi GB e si ricostruisce
da solo all'avvio: escluderlo da qualsiasi backup esterno. Per tenerlo fuori
anche dagli archivi interni di Tunarr:
`TUNARR_DISABLE_SEARCH_SNAPSHOT_IN_BACKUP=true`.

### Restore

Non esiste un restore automatico. A container fermo: estrarre l'archivio e
copiare `db.db` + `settings.json` (e opzionalmente `images/`, `cache/`,
`channel-lineups/`) in `config/`, poi riavviare. L'indice di ricerca si
ricostruisce da solo.

## Integrazione Jellyfin

Jellyfin gira **nativo** su hpserver (systemd, `:8096`), non in Docker: nessuna
modifica alla sua configurazione da parte di questo stack.

La registrazione di Tunarr in Jellyfin e' automatizzata via API in
[jellyfin-integration/](jellyfin-integration/) — script idempotente, con
backup preventivo, rollback e flag `--reconfigure`. **Va eseguito solo dopo
che Tunarr e' up e ha almeno un canale**, altrimenti si interrompe da solo.
Quanto segue e' la procedura manuale equivalente, se si preferisce la UI.

**Tunarr non usa la porta 34400** (quella e' di dizqueTV). Le route HDHomeRun —
`/device.xml`, `/discover.json`, `/lineup.json` — sono servite dalla stessa
porta della UI, la `:8000`.

Procedura manuale nella dashboard:

1. Jellyfin > menu hamburger > **Dashboard** > **Live TV**.
2. **Add tuner** > tipo **HDHomeRun**.
3. URL: `http://localhost:8000` (Tunarr e' sulla stessa macchina, host network).
   "Detect My Devices" dovrebbe trovarlo da solo via SSDP; in caso contrario
   inserire l'URL a mano.
4. Salvare, poi **Add Provider** > **XMLTV**.
5. Nel campo "File or URL": `http://localhost:8000/api/xmltv.xml`.
6. Lasciare "Enable for all tuner devices" spuntato (istanza singola).
7. Salvare: Jellyfin inizia l'aggiornamento della guida. I canali compaiono
   nella card **Live TV** in home.

Nota upstream: Tunarr supporta anche M3U, ma con Jellyfin l'HDHomeRun e' piu'
stabile ai cambi di programma quando Jellyfin non transcodifica.

## Rischi noti

- `/media/film` e `/media/serie` sono automount systemd su CIFS. I bind mount
  Docker vengono risolti alla creazione del container: se il NAS fosse
  irraggiungibile in quel momento, il container partirebbe con le cartelle
  vuote. Gli automount sono configurati `timeout=0` (nessuno smontaggio
  automatico), quindi il rischio si concretizza solo dopo un riavvio con NAS
  giu'. In quel caso: `docker compose down && docker compose up -d` a mount
  ripristinati.
- Tunarr e Jellyfin condividono la stessa CPU e la stessa iGPU: una sessione
  Tunarr in transcoding sottrae capacita' QSV a Jellyfin.
- **Il sync delle librerie Jellyfin termina in errore** (bug upstream
  [#1975](https://github.com/chrisbenincasa/tunarr/issues/1975), aperto dal
  2026-08-01, presente in 1.3.13):

  ```
  SqliteError: UNIQUE constraint failed:
    external_collections.media_source_id, external_collections.external_key
  ```

  Jellyfin restituisce gli stessi BoxSet per ogni libreria; la prima li
  importa, le successive vanno in conflitto. **L'impatto e' limitato**: film,
  serie ed episodi vengono importati regolarmente — l'errore arriva nella
  riconciliazione finale delle collection. Verificato il 2026-08-17: dopo
  l'errore il DB conteneva 6559 episodi, 103 serie e 919 film.
  Cosa si perde: le collection/BoxSet di Jellyfin non sono utilizzabili come
  raggruppamento nella programmazione. Si ripresenta a ogni sync (default ogni
  6 ore) e sporca i log, ma non degrada i canali gia' configurati.
