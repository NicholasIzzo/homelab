#!/usr/bin/env python3
"""
Crea (o rigenera) i canali film per genere in Tunarr.

Selezione dei film: lettura in SOLA LETTURA del DB SQLite di Tunarr.
Scrittura: solo tramite API HTTP ufficiale, mai sul DB.
Vedi README.md per il perche' di questa asimmetria.

Idempotente: un canale esistente (stesso numero) viene riusato e il suo
palinsesto rigenerato da zero. Rieseguirlo non crea duplicati.

Uso:
    ./build-movie-channels.py --dry-run
    ./build-movie-channels.py
    ./build-movie-channels.py --only 13

Exit code: 0 ok, 1 uso/config, 2 Tunarr non raggiungibile, 3 DB illeggibile,
           4 errore API, 5 nessun film trovato per un canale.
"""

import argparse
import json
import os
import random
import sqlite3
import sys
import urllib.error
import urllib.request
from pathlib import Path

TUNARR_URL = os.environ.get("TUNARR_URL", "http://localhost:8000")
DB_PATH = os.environ.get(
    "TUNARR_DB", "/home/nicholas/homelab/docker/tunarr/config/db.db"
)
HERE = Path(__file__).resolve().parent
CONFIG = HERE / "movie-channels.json"


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
    """Chiamata all'API Tunarr. Solleva su errore HTTP."""
    url = f"{TUNARR_URL}{path}"
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    if data:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            body = r.read().decode()
            return json.loads(body) if body else None
    except urllib.error.HTTPError as e:
        detail = e.read().decode()[:400]
        die(4, f"{method} {path} -> HTTP {e.code}: {detail}")
    except urllib.error.URLError as e:
        die(2, f"Tunarr non raggiungibile su {TUNARR_URL}: {e.reason}")


def film_per_generi(con, generi):
    """Film (type=movie) che hanno almeno uno dei generi indicati.

    DISTINCT perche' un film con piu' generi corrispondenti verrebbe
    altrimenti restituito una volta per genere, finendo duplicato nel
    palinsesto dello stesso canale.
    """
    ph = ",".join("?" * len(generi))
    sql = f"""
        select distinct p.uuid, p.duration
        from program p
        join genre_entity ge on ge.program_id = p.uuid
        join genre g on g.uuid = ge.genre_id
        where p.type = 'movie'
          and g.name in ({ph})
          and p.duration > 0
    """
    return con.execute(sql, generi).fetchall()


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dry-run", action="store_true",
                    help="mostra cosa farebbe, senza scrivere nulla")
    ap.add_argument("--only", type=int, metavar="N",
                    help="agisci solo sul canale numero N")
    ap.add_argument("--seed", type=int,
                    help="seed per l'ordine casuale (per run riproducibili)")
    args = ap.parse_args()

    if args.seed is not None:
        random.seed(args.seed)

    if not CONFIG.exists():
        die(1, f"config non trovata: {CONFIG}")
    canali = json.loads(CONFIG.read_text(encoding="utf-8"))["canali"]
    if args.only is not None:
        canali = [c for c in canali if c["number"] == args.only]
        if not canali:
            die(1, f"nessun canale numero {args.only} in {CONFIG.name}")

    if args.dry_run:
        step("MODALITA' DRY-RUN — nessuna modifica verra' applicata")

    step("Prerequisiti")
    esistenti = api("GET", "/api/channels")
    ok(f"Tunarr risponde, {len(esistenti)} canali gia' presenti")

    if not os.path.exists(DB_PATH):
        die(3, f"DB non trovato: {DB_PATH}")
    try:
        con = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    except sqlite3.Error as e:
        die(3, f"DB illeggibile: {e}")
    ok(f"DB in sola lettura: {DB_PATH}")

    # Serve un transcode config valido: la POST lo rifiuta altrimenti.
    # Riusiamo quello dei canali gia' esistenti per restare coerenti.
    transcode_id = next(
        (c.get("transcodeConfigId") for c in esistenti if c.get("transcodeConfigId")),
        None,
    )
    if not transcode_id:
        die(1, "nessun transcodeConfigId disponibile: crea prima un canale dalla UI")
    ok(f"transcode config: {transcode_id}")

    per_numero = {c["number"]: c for c in esistenti}

    for spec in canali:
        num, nome, generi = spec["number"], spec["name"], spec["generi"]
        step(f"Canale {num} — {nome}")

        film = film_per_generi(con, generi)
        if not film:
            die(5, f"nessun film per i generi {generi}. Nomi corretti? "
                   f"Controlla /api/programs/facets/genres.name")
        random.shuffle(film)
        durata_h = sum(d for _, d in film) / 3_600_000
        info(f"generi {', '.join(generi)}: {len(film)} film, {durata_h:.0f}h di palinsesto")

        esistente = per_numero.get(num)
        if esistente:
            ch_id = esistente["id"]
            ok(f"canale gia' presente ({ch_id}), ne rigenero il palinsesto")
        elif args.dry_run:
            ch_id = "<nuovo-canale>"
            info(f"DRY-RUN POST /api/channels  number={num} name=\"{nome}\"")
        else:
            payload = {
                "type": "new",
                "channel": {
                    "number": num,
                    "name": nome,
                    "startTime": 0,
                    "transcodeConfigId": transcode_id,
                    "groupTitle": "Film",
                    "stealth": False,
                    "guideMinimumDuration": 30000,
                    "streamMode": "hls",
                },
            }
            creato = api("POST", "/api/channels", payload)
            ch_id = creato["id"]
            ok(f"canale creato ({ch_id})")

        lineup = [
            {"type": "content", "id": uuid, "duration": dur} for uuid, dur in film
        ]
        if args.dry_run:
            info(f"DRY-RUN POST /api/channels/{ch_id}/programming "
                 f"type=manual, {len(lineup)} programmi, append=false")
            info(f"        primo elemento: {json.dumps(lineup[0])}")
        else:
            api("POST", f"/api/channels/{ch_id}/programming",
                {"type": "manual", "lineup": lineup, "append": False})
            ok(f"palinsesto scritto: {len(lineup)} film in ordine casuale")

    con.close()
    step("Fatto.")
    if args.dry_run:
        info("Era un dry-run: nulla e' stato modificato.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
