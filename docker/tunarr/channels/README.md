# Canali film per genere

Crea e mantiene i canali Tunarr costruiti sui generi (10-15), rigenerandone il
palinsesto ogni notte cosi' che i film aggiunti da Radarr entrino in rotazione.

I canali serie TV (1-3) **non** sono gestiti da qui: sono programmati a mano
nella UI con Block Shuffle, che preserva l'ordine degli episodi.

## Uso

```bash
cd ~/homelab/docker/tunarr/channels && ./build-movie-channels.py --dry-run
```

```bash
cd ~/homelab/docker/tunarr/channels && ./build-movie-channels.py
```

| Flag | Effetto |
|---|---|
| `--dry-run` | Mostra i canali, il numero di film e le chiamate API, senza scrivere niente |
| `--only N` | Agisce solo sul canale numero N |
| `--seed N` | Ordine casuale riproducibile (utile per confrontare due run) |

Env: `TUNARR_URL` (default `http://localhost:8000`), `TUNARR_DB` (default
`~/homelab/docker/tunarr/config/db.db`).

Exit code: `0` ok · `1` uso/config · `2` Tunarr irraggiungibile · `3` DB
illeggibile · `4` errore API · `5` nessun film per un canale.

## Configurazione

I canali si definiscono in [movie-channels.json](movie-channels.json): numero,
nome e lista di generi. Per aggiungere un canale basta una voce in piu' e una
riesecuzione.

I nomi dei generi sono quelli che arrivano da Jellyfin, **in italiano**. Per
vedere quelli disponibili con i rispettivi conteggi:

```bash
curl -s http://localhost:8000/api/programs/facets/genres.name | jq '.facetValues | to_entries | sort_by(-.value) | from_entries'
```

Un film con piu' generi finisce su piu' canali (un'action-comedy sta sia su 10
che su 11). E' voluto: su un canale lineare la ridondanza non da' fastidio.

Generi troppo piccoli per un canale dedicato, al 2026-08-17: Western (9),
Documentario (2), Musica (21), Guerra (27), Storia (32).

## Perche' legge dal DB ma scrive via API

La selezione dei film avviene con una query SQL in **sola lettura** sul DB
SQLite di Tunarr; la creazione dei canali e la scrittura dei palinsesti passano
**solo** dall'API HTTP.

Il motivo e' che l'endpoint di ricerca (`POST /api/programs/search`) non applica
i filtri come documentato: una query filtrata per genere e `type: movie`
restituisce 8042 risultati — piu' dell'intera libreria — mescolando film ed
episodi. Verificato su 1.3.13 il 2026-08-17.

Il compromesso: leggere dal DB accetta una dipendenza dallo schema interno, che
puo' cambiare tra versioni di Tunarr. Se dopo un aggiornamento lo script fallisce
con `no such table` o `no such column`, e' quello: le tabelle usate sono
`program`, `genre`, `genre_entity`. Scrivere invece resta sull'interfaccia
supportata, cosi' nessun errore dello script puo' corrompere il database.

## Rigenerazione automatica

Il palinsesto e' una lista statica: senza rigenerazione, i film aggiunti dopo non
compaiono. Il cron rigenera ogni notte alle **4:30**, dopo il backup interno di
Tunarr (04:00) e dopo che il sync delle librerie ha avuto tempo di girare.

Installazione:

```bash
crontab -l 2>/dev/null | grep -q build-movie-channels || (crontab -l 2>/dev/null; cat ~/homelab/docker/tunarr/channels/crontab.fragment) | crontab -
```

Verifica:

```bash
crontab -l | grep build-movie-channels
```

Log in `~/homelab/docker/tunarr/channels/last-run.log` (sovrascritto a ogni run,
escluso dal repo).

Rimozione:

```bash
crontab -l | grep -v build-movie-channels | crontab -
```

## Cosa aspettarsi

Ogni notte l'ordine dei film cambia: e' un rimescolamento completo, non
un'aggiunta in coda. Un film iniziato ieri sera non sara' allo stesso punto del
palinsesto stanotte. Per una TV lineare e' il comportamento voluto; se invece
preferisci un palinsesto stabile, togli il cron e rigenera a mano quando serve.

Il conteggio dei film per canale al 2026-08-17:

| Ch | Nome | Film | Palinsesto |
|---:|---|---:|---:|
| 10 | Commedia | 322 | 564h |
| 11 | Azione & Avventura | 398 | 805h |
| 12 | Dramma | 239 | 493h |
| 13 | Horror & Thriller | 326 | 648h |
| 14 | Sci-Fi & Fantasy | 320 | 645h |
| 15 | Animazione & Famiglia | 182 | 286h |

## Dopo aver aggiunto canali

Jellyfin non si accorge da solo dei canali nuovi: va rilanciato il refresh della
guida, che e' l'ultimo passo di
[../jellyfin-integration/setup.sh](../jellyfin-integration/setup.sh). Rieseguirlo
e' sicuro, e' idempotente.
