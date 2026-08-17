# Integrazione Tunarr → Jellyfin

Registra Tunarr in Jellyfin (nativo su hpserver, `:8096`) come tuner HDHomeRun
con guida XMLTV, via API. Nessun click nella dashboard.

Prerequisito: lo stack Tunarr deve essere **up e con almeno un canale**. Lo
script si rifiuta di procedere altrimenti — vedi [../README.md](../README.md).

## Uso

```bash
cd ~/homelab/docker/tunarr/jellyfin-integration && JELLYFIN_API_KEY='<chiave>' ./setup.sh --dry-run
```

```bash
cd ~/homelab/docker/tunarr/jellyfin-integration && JELLYFIN_API_KEY='<chiave>' ./setup.sh
```

| Flag | Effetto |
|---|---|
| `--dry-run` | Mostra le chiamate che modificherebbero lo stato senza eseguirle. Le `GET` di lettura vengono comunque fatte (servono a mostrare lo stato reale), quindi **serve una API key valida anche in dry-run**. |
| `--reconfigure` | Rimuove tuner e provider Tunarr esistenti e li ricrea. Da usare se cambia porta/hostname di Tunarr: gli URL registrati in Jellyfin sono assoluti e non si aggiornano da soli. |
| `--skip-backup` | Salta il backup. Solo per rieseguire lo script a configurazione già fatta. |

Variabili d'ambiente: `JELLYFIN_API_KEY` (obbligatoria), `JELLYFIN_URL`
(default `http://localhost:8096`), `TUNARR_URL` (default `http://localhost:8000`,
è l'URL che viene *scritto* nella config Jellyfin), `TUNARR_PROBE_URL` (default
`http://localhost:8000`, usato solo per i controlli preliminari), `BACKUP_DIR`
(default `$HOME`).

Exit code: `0` ok · `1` uso errato/env mancante · `2` Tunarr down · `3` Tunarr
senza canali · `4` errore API Jellyfin · `5` post-check fallito · `6` backup fallito.

## Come ottenere l'API key

La chiave va creata a mano, non via API: generarla con
`POST /Users/AuthenticateByName` significherebbe passare la password in chiaro
sulla riga di comando, dove finirebbe nella shell history e in `ps`.

Dashboard → **API Keys** → **+** → nome `tunarr-setup` → copia la chiave.

Passala solo via ambiente, mai come argomento:

```bash
read -rs JELLYFIN_API_KEY && export JELLYFIN_API_KEY
```

Lo script passa la chiave a `curl` tramite `--config -` (stdin), non in `argv`:
non compare in `ps` durante l'esecuzione. La chiave non viene mai scritta su
disco né committata — i payload nel repo contengono solo il placeholder
`__TUNARR_URL__`.

A configurazione conclusa la chiave può essere revocata dalla stessa schermata:
serve solo durante l'esecuzione dello script.

## Cosa fa, nell'ordine

1. **Prerequisiti Tunarr**: `/api/system/health`, `/device.xml`,
   `/discover.json`, `/lineup.json`, `/api/xmltv.xml`, e verifica che
   `lineup.json` non sia vuoto.
2. **Backup** di `/etc/jellyfin` e `/var/lib/jellyfin/config` in
   `$BACKUP_DIR/jellyfin-backup-pre-tunarr-<data>.tar.gz`. Se fallisce, si ferma.
3. **Tuner**: `POST /LiveTv/TunerHosts` con
   [payloads/tuner-host-hdhomerun.json](payloads/tuner-host-hdhomerun.json).
4. **Provider guida**: `POST /LiveTv/ListingProviders` con
   [payloads/listing-provider-xmltv.json](payloads/listing-provider-xmltv.json).
5. **Mapping canali**: legge `GET /LiveTv/ChannelMappingOptions?providerId=…`,
   e per ogni canale del tuner senza `ProviderChannelId` cerca il canale XMLTV
   con lo stesso `Name`, poi `POST /LiveTv/ChannelMappings`. I canali senza
   corrispondenza vengono segnalati come warning, non bloccano.
6. **Refresh guida**: avvia lo scheduled task `RefreshGuide`.
7. **Post-check**: tuner e provider presenti in configurazione, canali Live TV
   esposti (con attesa fino a 60s), programmi EPG sul primo canale.

L'idempotenza si basa su `GET /System/Configuration/livetv`: il tuner è
riconosciuto per `Url` + `Type`, il provider per `Path` + `Type`. Riesecuzioni
non duplicano nulla.

## Correzioni rispetto alle route ipotizzate

Verificate sul sorgente Jellyfin `v10.11.11` (la versione installata su
hpserver è **10.11.11**, non 10.11.10):

| Ipotesi | Realtà |
|---|---|
| `GET /LiveTv/TunerHosts` per verificare il tuner | **Non esiste**: il controller ha solo `POST` e `DELETE` su `TunerHosts`. La lista dei tuner si legge da `GET /System/Configuration/livetv` (named configuration `livetv`). |
| `GET /LiveTv/ListingProviders/{id}/ChannelMappings` | **Non esiste**. Sono `GET /LiveTv/ChannelMappingOptions?providerId={id}` e `POST /LiveTv/ChannelMappings` con body `{providerId, tunerChannelId, providerChannelId}`. |
| `POST /LiveTv/GuideRefresh` | **Non esiste**. Il refresh è uno scheduled task: `GET /ScheduledTasks` → l'elemento con `Key == "RefreshGuide"` → `POST /ScheduledTasks/Running/{id}`. |
| `tunerCount: 0` = auto-detect | Corretto: `HdHomerunHost` sovrascrive `hostInfo.TunerCount` con il valore letto da `/discover.json` di Tunarr. |

Sorgenti usati:
[`TunerHostInfo.cs`](https://github.com/jellyfin/jellyfin/blob/v10.11.11/MediaBrowser.Model/LiveTv/TunerHostInfo.cs),
[`ListingsProviderInfo.cs`](https://github.com/jellyfin/jellyfin/blob/v10.11.11/MediaBrowser.Model/LiveTv/ListingsProviderInfo.cs),
[`LiveTvController.cs`](https://github.com/jellyfin/jellyfin/blob/v10.11.11/Jellyfin.Api/Controllers/LiveTvController.cs),
[`HdHomerunHost.cs`](https://github.com/jellyfin/jellyfin/blob/v10.11.11/src/Jellyfin.LiveTv/TunerHosts/HdHomerun/HdHomerunHost.cs),
[`RefreshGuideScheduledTask.cs`](https://github.com/jellyfin/jellyfin/blob/v10.11.11/src/Jellyfin.LiveTv/Guide/RefreshGuideScheduledTask.cs),
[docs Tunarr — Jellyfin](https://tunarr.com/configure/clients/jellyfin/).

## Rollback

Rimuove tuner e provider senza toccare altro:

```bash
JELLYFIN_API_KEY='<chiave>' ~/homelab/docker/tunarr/jellyfin-integration/rollback.sh
```

Oppure a mano, recuperando gli id da `GET /System/Configuration/livetv`:

```bash
curl -s -H "Authorization: MediaBrowser Token=\"$JELLYFIN_API_KEY\"" http://localhost:8096/System/Configuration/livetv | jq '{TunerHosts, ListingProviders}'
```

```bash
curl -X DELETE -H "Authorization: MediaBrowser Token=\"$JELLYFIN_API_KEY\"" "http://localhost:8096/LiveTv/TunerHosts?id=<TUNER_ID>"
```

```bash
curl -X DELETE -H "Authorization: MediaBrowser Token=\"$JELLYFIN_API_KEY\"" "http://localhost:8096/LiveTv/ListingProviders?id=<PROVIDER_ID>"
```

Ripristino completo dal backup (riporta indietro **tutta** la config Jellyfin,
non solo la Live TV):

```bash
sudo systemctl stop jellyfin && sudo tar xzf ~/jellyfin-backup-pre-tunarr-<data>.tar.gz -C / && sudo systemctl start jellyfin
```

## Rischi noti

- **La Live TV in Jellyfin è globale.** Non esiste ACL per-canale: ogni utente
  con il permesso Live TV vede tutti i canali Tunarr. L'unica leva è togliere
  l'accesso Live TV all'utente (Dashboard → Utenti → *utente* → Accesso alla
  Live TV), che però toglie *tutti* i canali, non un sottoinsieme.
- **Instabilità ai cambi di programma.** Bug noto quando Jellyfin fa
  remux/direct-play di uno stream HDHomeRun senza ricodificarlo
  ([jellyfin-ffmpeg#57](https://github.com/jellyfin/jellyfin-ffmpeg/issues/57),
  [ffmpeg#5419](https://trac.ffmpeg.org/ticket/5419)): al confine tra due
  programmi lo stream può bloccarsi. Workaround, in ordine di invasività:
  1. Lasciare `allowStreamSharing: true` e `ignoreDts: true` (già nel payload).
  2. Forzare la ricodifica abbassando il limite di bitrate del client
     (Dashboard → Utenti → *utente* → bitrate massimo), che spinge Jellyfin a
     transcodificare invece di fare direct play.
  3. Ridurre `fallbackMaxStreamingBitrate` nel payload del tuner.
- **URL assoluti.** Se Tunarr cambia porta o host, gli URL registrati in
  Jellyfin restano quelli vecchi: rieseguire con `--reconfigure`.
- **Risorse condivise.** Tunarr e Jellyfin usano la stessa iGPU: una sessione
  Live TV in transcoding sottrae capacità QSV alle riproduzioni normali.

## Nota sul transcoding e Dolby Vision

Non è stata proposta alcuna modifica a `encoding.xml`, per due motivi:

1. **In Jellyfin non esiste un flag "forza transcoding per Live TV".** Il
   transcoding si determina per sessione, dalle capacità del client e dai limiti
   di bitrate. Le uniche leve specifiche per Live TV sono i campi del tuner host
   (`allowHWTranscoding`, `fallbackMaxStreamingBitrate`, `enableStreamLooping`,
   `ignoreDts`), già impostati nel payload.
2. **Il Dolby Vision si risolve a monte, in Tunarr.** Jellyfin riceve da Tunarr
   uno stream MPEG-TS già ricodificato dall'FFmpeg *di Tunarr*: il profilo DV
   della sorgente è già stato appiattito prima che Jellyfin lo veda. La leva
   corretta è il transcode config del canale in Tunarr, non la policy globale
   di Jellyfin.

Stato attuale di hpserver, per riferimento: `HardwareAccelerationType=qsv`,
`VaapiDevice=/dev/dri/renderD128`, `EnableTonemapping=false`,
`EnableVppTonemapping=false`. Toccare il tonemapping avrebbe impatto su tutta
la libreria, non solo sulla Live TV: se in futuro servisse, va valutato a parte.
