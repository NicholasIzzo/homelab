#!/usr/bin/env python3
"""
Assegna un transcode config a tutti i canali Tunarr (o a uno solo).

Serve per passare i canali all'accelerazione hardware: il config di default di
Tunarr usa libx264 in software, che su hardware modesto non regge il 1080p in
tempo reale. Vedi ../README.md.

Uso:
    ./set-transcode-config.py --list
    ./set-transcode-config.py --config-name "VAAPI (Intel UHD 630)" --dry-run
    ./set-transcode-config.py --config-name "VAAPI (Intel UHD 630)"
    ./set-transcode-config.py --config-name "Default" --only 15   # rollback

Un canale con una sessione attiva viene saltato: cambiargli il config
interromperebbe chi sta guardando. Rieseguire lo script a TV spenta.

Exit code: 0 ok, 1 uso/config non trovato, 2 Tunarr irraggiungibile, 4 errore API.
"""

import argparse
import json
import sys
import urllib.error
import urllib.request

TUNARR_URL = "http://localhost:8000"

# Campi che l'API restituisce ma rifiuta in scrittura (SaveableChannelSchema).
NON_SCRIVIBILI = ("programCount", "sessions", "fallback", "transcoding")


def api(method, path, payload=None):
    req = urllib.request.Request(
        f"{TUNARR_URL}{path}",
        data=json.dumps(payload).encode() if payload is not None else None,
        method=method,
    )
    if payload is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            body = r.read().decode()
            return json.loads(body) if body else None
    except urllib.error.HTTPError as e:
        print(f"  FAIL {method} {path} -> HTTP {e.code}: {e.read().decode()[:300]}",
              file=sys.stderr)
        sys.exit(4)
    except urllib.error.URLError as e:
        print(f"  FAIL Tunarr irraggiungibile: {e.reason}", file=sys.stderr)
        sys.exit(2)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--config-name")
    ap.add_argument("--only", type=int, metavar="N")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--list", action="store_true",
                    help="elenca config disponibili e canali, senza modificare")
    args = ap.parse_args()

    configs = api("GET", "/api/transcode_configs")
    canali = sorted(api("GET", "/api/channels"), key=lambda c: c["number"])
    per_id = {c["id"]: c["name"] for c in configs}

    if args.list or not args.config_name:
        print("Transcode config disponibili:")
        for c in configs:
            print(f"  {c['name']:<26} accel={c['hardwareAccelerationMode']:<6}"
                  f"{'  (default)' if c.get('isDefault') else ''}")
        print("\nCanali:")
        for ch in canali:
            att = len(ch.get("sessions") or [])
            print(f"  {ch['number']:>2}  {ch['name']:<24} "
                  f"{per_id.get(ch['transcodeConfigId'], '?'):<26}"
                  f"{'  [IN USO]' if att else ''}")
        return 0 if args.list else 1

    target = next((c for c in configs if c["name"] == args.config_name), None)
    if not target:
        print(f"  FAIL config '{args.config_name}' non trovato", file=sys.stderr)
        return 1

    print(f"Config di destinazione: {target['name']} "
          f"(accel={target['hardwareAccelerationMode']})\n")

    cambiati = saltati = gia_ok = 0
    for ch in canali:
        if args.only is not None and ch["number"] != args.only:
            continue
        etichetta = f"{ch['number']:>2}  {ch['name']:<24}"

        if ch["transcodeConfigId"] == target["id"]:
            print(f"  {etichetta} gia' su {target['name']}")
            gia_ok += 1
            continue
        if ch.get("sessions"):
            print(f"  {etichetta} SALTATO: sessione attiva, interromperebbe la visione")
            saltati += 1
            continue
        if args.dry_run:
            print(f"  {etichetta} DRY-RUN: {per_id.get(ch['transcodeConfigId'],'?')}"
                  f" -> {target['name']}")
            cambiati += 1
            continue

        payload = {k: v for k, v in ch.items() if k not in NON_SCRIVIBILI}
        payload["transcodeConfigId"] = target["id"]
        api("PUT", f"/api/channels/{ch['id']}", payload)
        print(f"  {etichetta} OK -> {target['name']}")
        cambiati += 1

    print(f"\n  {cambiati} modificati, {gia_ok} gia' a posto, {saltati} saltati")
    if saltati:
        print("  Rilancia a TV spenta per completare i canali saltati.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
