#!/usr/bin/env python3
"""
Crea (o rigenera) i canali serie TV in Tunarr, uno per categoria.

Ordina gli episodi come il Block Shuffle della UI: N episodi consecutivi di una
serie, poi si passa alla successiva, ciclicamente. L'ordine interno degli
episodi (stagione, numero) e' sempre preservato — e' l'unica cosa che rende
guardabile un canale di serie.

Ogni serie finisce in UNA sola categoria: viene assegnata alla prima che
corrisponde secondo _ordine_priorita. Lo script si rifiuta di scrivere se anche
una sola serie resta senza canale.

Selezione da DB in sola lettura, scrittura solo via API. Vedi README.md.

Uso:
    ./build-series-channels.py --dry-run
    ./build-series-channels.py

Exit code: 0 ok, 1 uso/config, 2 Tunarr irraggiungibile, 3 DB illeggibile,
           4 errore API, 5 serie orfane o categoria vuota.
"""

import argparse
import json
import os
import random
import sqlite3
import sys
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

TUNARR_URL = os.environ.get("TUNARR_URL", "http://localhost:8000")
DB_PATH = os.environ.get(
    "TUNARR_DB", "/home/nicholas/homelab/docker/tunarr/config/db.db"
)
HERE = Path(__file__).resolve().parent
CONFIG = HERE / "series-channels.json"


def info(msg):
    print(f"  {msg}")


def step(msg):
    print(f"\n\033[1m==> {msg}\033[0m")


def ok(msg):
    print(f"  \033[32mOK\033[0m   {msg}")


def warn(msg):
    print(f"  \033[33mWARN\033[0m {msg}")


def die(code, msg):
    print(f"  \033[31mFAIL\033[0m {msg}", file=sys.stderr)
    sys.exit(code)


def api(method, path, payload=None):
    url = f"{TUNARR_URL}{path}"
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    if data:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            body = r.read().decode()
            return json.loads(body) if body else None
    except urllib.error.HTTPError as e:
        die(4, f"{method} {path} -> HTTP {e.code}: {e.read().decode()[:400]}")
    except urllib.error.URLError as e:
        die(2, f"Tunarr non raggiungibile su {TUNARR_URL}: {e.reason}")


def carica_serie(con):
    """{show_uuid: (titolo, {generi})} per ogni serie."""
    serie = {}
    for u, titolo, genere in con.execute("""
        select pg.uuid, pg.title, g.name
        from program_grouping pg
        join genre_entity ge on ge.group_id = pg.uuid
        join genre g on g.uuid = ge.genre_id
        where pg.type = 'show'
    """):
        if u not in serie:
            serie[u] = (titolo, set())
        serie[u][1].add(genere)
    return serie


def episodi_di(con, show_uuid):
    """Episodi in ordine di trasmissione. NULLS LAST: gli episodi senza
    numerazione finiscono in coda invece di aprire la serie."""
    return con.execute("""
        select uuid, duration
        from program
        where tv_show_uuid = ? and type = 'episode' and duration > 0
        order by season_number is null, season_number,
                 episode is null, episode
    """, (show_uuid,)).fetchall()


def block_shuffle(serie_episodi, blocco, rng):
    """N episodi per serie, poi si cambia. L'ordine delle serie e' casuale ma
    fissato per tutto il ciclo, cosi' la rotazione resta prevedibile.

    Le serie corte esauriscono prima: la coda del palinsesto resta alle piu'
    lunghe. E' lo stesso comportamento del Block Shuffle di Tunarr."""
    ordine = list(serie_episodi.keys())
    rng.shuffle(ordine)
    cursori = {s: 0 for s in ordine}
    lineup = []
    while True:
        progredito = False
        for s in ordine:
            eps = serie_episodi[s]
            i = cursori[s]
            if i >= len(eps):
                continue
            for u, d in eps[i:i + blocco]:
                lineup.append({"type": "content", "id": u, "duration": d})
            cursori[s] = i + blocco
            progredito = True
        if not progredito:
            return lineup


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--seed", type=int)
    args = ap.parse_args()

    rng = random.Random(args.seed)

    if not CONFIG.exists():
        die(1, f"config non trovata: {CONFIG}")
    cfg = json.loads(CONFIG.read_text(encoding="utf-8"))
    canali = cfg["canali"]
    priorita = cfg["_ordine_priorita"]
    per_nome = {c["name"]: c for c in canali}
    mancanti = [n for n in priorita if n not in per_nome]
    if mancanti:
        die(1, f"_ordine_priorita cita canali inesistenti: {mancanti}")

    if args.dry_run:
        step("MODALITA' DRY-RUN — nessuna modifica verra' applicata")

    step("Prerequisiti")
    esistenti = api("GET", "/api/channels")
    ok(f"Tunarr risponde, {len(esistenti)} canali presenti")
    if not os.path.exists(DB_PATH):
        die(3, f"DB non trovato: {DB_PATH}")
    con = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    ok(f"DB in sola lettura: {DB_PATH}")

    transcode_id = next(
        (c.get("transcodeConfigId") for c in esistenti if c.get("transcodeConfigId")),
        None,
    )
    if not transcode_id:
        die(1, "nessun transcodeConfigId disponibile")
    ok(f"transcode config: {transcode_id}")

    # --- Classificazione ---
    step("Classificazione delle serie")
    serie = carica_serie(con)
    assegnate = {c["name"]: [] for c in canali}
    orfane = []
    for u, (titolo, generi) in serie.items():
        for nome in priorita:
            if generi & set(per_nome[nome]["generi"]):
                assegnate[nome].append((u, titolo))
                break
        else:
            orfane.append(titolo)

    for c in canali:
        n = len(assegnate[c["name"]])
        info(f"{c['number']:>2}  {c['name']:<20} {n:>3} serie")
    tot = sum(len(v) for v in assegnate.values())
    if orfane:
        die(5, f"{len(orfane)} serie senza canale: {', '.join(sorted(orfane))}. "
               f"Aggiungi i loro generi a una categoria in {CONFIG.name}.")
    ok(f"tutte le {tot} serie sono assegnate, nessuna esclusa")

    vuoti = [c["name"] for c in canali if not assegnate[c["name"]]]
    if vuoti:
        die(5, f"categorie senza serie: {vuoti}")

    # --- Costruzione e scrittura ---
    per_numero = {c["number"]: c for c in esistenti}
    for c in canali:
        num, nome, blocco = c["number"], c["name"], c["blocco"]
        step(f"Canale {num} — {nome}")

        serie_episodi = {}
        for u, titolo in assegnate[nome]:
            eps = episodi_di(con, u)
            if eps:
                serie_episodi[titolo] = eps
        if not serie_episodi:
            die(5, f"nessun episodio per il canale {nome}")

        lineup = block_shuffle(serie_episodi, blocco, rng)
        ore = sum(p["duration"] for p in lineup) / 3_600_000
        info(f"{len(serie_episodi)} serie, {len(lineup)} episodi, {ore:.0f}h "
             f"(blocchi da {blocco})")

        esistente = per_numero.get(num)
        if esistente and esistente["name"] != nome:
            if args.dry_run:
                info(f"DRY-RUN DELETE canale {num} \"{esistente['name']}\" "
                     f"(nome diverso) e ricreazione come \"{nome}\"")
                esistente = None
            else:
                api("DELETE", f"/api/channels/{esistente['id']}")
                warn(f"canale {num} \"{esistente['name']}\" rimosso e ricreato")
                esistente = None
        elif esistente:
            ok(f"canale gia' presente ({esistente['id']}), rigenero il palinsesto")

        if esistente:
            ch_id = esistente["id"]
        elif args.dry_run:
            ch_id = "<nuovo-canale>"
            info(f"DRY-RUN POST /api/channels number={num} name=\"{nome}\"")
        else:
            creato = api("POST", "/api/channels", {
                "type": "new",
                "channel": {
                    "id": str(uuid.uuid4()),
                    "number": num,
                    "name": nome,
                    "duration": 0,
                    "startTime": int(time.time() * 1000),
                    "stealth": False,
                    "groupTitle": "Serie TV",
                    "guideMinimumDuration": 30000,
                    "disableFillerOverlay": False,
                    "subtitlesEnabled": False,
                    "streamMode": "hls",
                    "transcodeConfigId": transcode_id,
                    "icon": {"path": "", "width": 0, "duration": 0,
                             "position": "bottom-right",
                             "useDefaultIconFallback": True},
                    "offline": {"picture": "", "soundtrack": "", "mode": "pic"},
                    "onDemand": {"enabled": False},
                },
            })
            ch_id = creato["id"]
            ok(f"canale creato ({ch_id})")

        if args.dry_run:
            info(f"DRY-RUN POST /api/channels/{ch_id}/programming "
                 f"type=manual, {len(lineup)} episodi")
            primi = list(serie_episodi.keys())[:3]
            info(f"        rotazione tra: {', '.join(primi)}...")
        else:
            api("POST", f"/api/channels/{ch_id}/programming",
                {"type": "manual", "lineup": lineup, "append": False})
            ok(f"palinsesto scritto: {len(lineup)} episodi")

    con.close()
    step("Fatto.")
    if args.dry_run:
        info("Era un dry-run: nulla e' stato modificato.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
