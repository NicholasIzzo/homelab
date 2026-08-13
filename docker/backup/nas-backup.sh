#!/bin/bash
# NAS backup with Restic to hpserver via SFTP.
# Runs as root on the NAS. See docs/backup-guide.md for design.

set -euo pipefail

# ---- config ----
export RESTIC_REPOSITORY="sftp:nicholas@192.168.0.33:/home/nicholas/backups/nas-restic-repo"
export RESTIC_PASSWORD_FILE="/etc/restic/repo-password"

SOURCE=/volume1/docker
STAGING=/volume1/docker/_backup-staging
STATE_DIR=/var/lib/nas-backup
STATE_FILE="$STATE_DIR/state.json"
LOG_TAG="nas-backup"
KUMA_PUSH_URL_FILE=/etc/restic/kuma-push-url   # optional; if absent, no push

# ---- helpers ----
log() { logger -t "$LOG_TAG" -- "$*"; echo "[$(date -Iseconds)] $*"; }

write_state() {
  mkdir -p "$STATE_DIR"
  local exit_code="$1" msg="$2"
  cat > "$STATE_FILE" <<JSON
{"last_run":"$(date -Iseconds)","exit":$exit_code,"msg":"$msg"}
JSON
}

kuma_push() {
  local status="$1" msg="$2"
  [ -r "$KUMA_PUSH_URL_FILE" ] || return 0
  local url; url=$(cat "$KUMA_PUSH_URL_FILE")
  curl -fsS --max-time 10 "${url}?status=${status}&msg=$(printf '%s' "$msg" | jq -sRr @uri)" >/dev/null || true
}

# sqlite_snapshot <container> <host_db_path> <staging_out_path>
sqlite_snapshot() {
  local container="$1" src="$2" out="$3"
  local dir; dir=$(dirname "$src")
  local file; file=$(basename "$src")
  mkdir -p "$(dirname "$out")"

  if ! docker ps --format '{{.Names}}' | grep -qx "$container"; then
    log "sqlite_snapshot: $container not running, direct copy"
    [ -f "$src" ] && cp -a "$src" "$out" || log "WARN: $src missing"
    return
  fi

  log "sqlite_snapshot: $container running, online .backup"
  docker run --rm --pull=missing \
    -v "$dir:/work:rw" \
    alpine:3.20 sh -c \
    "apk add --no-cache sqlite >/dev/null && sqlite3 /work/${file} \".backup /work/${file}.snapshot\""
  mv "$dir/${file}.snapshot" "$out"
}

# ---- pre-flight ----
trap 'rc=$?; log "FAILED (rc=$rc)"; write_state "$rc" "failed"; kuma_push down "failed rc=$rc"; exit $rc' ERR

command -v restic >/dev/null || { log "restic not installed"; exit 127; }
command -v jq >/dev/null || { log "jq not installed (needed for kuma push URL-encoding)"; exit 127; }
[ -r "$RESTIC_PASSWORD_FILE" ] || { log "password file missing"; exit 1; }

log "start"

# ---- SQLite snapshots ----
rm -rf "$STAGING"
mkdir -p "$STAGING"
sqlite_snapshot vaultwarden_server-1 \
  /volume1/docker/vaultwarden/db.sqlite3 \
  "$STAGING/vaultwarden/db.sqlite3"
sqlite_snapshot gitea \
  /volume1/docker/gitea/data/gitea/gitea.db \
  "$STAGING/gitea/gitea.db"
sqlite_snapshot semaphore \
  /volume1/docker/semaphore/data/database.sqlite \
  "$STAGING/semaphore/database.sqlite"

# ---- restic backup (single snapshot, source + staging) ----
log "restic backup starting"
restic backup "$SOURCE" "$STAGING" \
  --exclude '/volume1/docker/vaultwarden/db.sqlite3'      \
  --exclude '/volume1/docker/vaultwarden/db.sqlite3-wal'  \
  --exclude '/volume1/docker/vaultwarden/db.sqlite3-shm'  \
  --exclude '/volume1/docker/gitea/data/gitea/gitea.db'       \
  --exclude '/volume1/docker/gitea/data/gitea/gitea.db-wal'   \
  --exclude '/volume1/docker/gitea/data/gitea/gitea.db-shm'   \
  --exclude '/volume1/docker/semaphore/data/database.sqlite'      \
  --exclude '/volume1/docker/semaphore/data/database.sqlite-wal'  \
  --exclude '/volume1/docker/semaphore/data/database.sqlite-shm'  \
  --exclude '**/*.log' \
  --exclude '**/logs/*' \
  --tag daily

# ---- retention ----
log "retention"
restic forget \
  --keep-daily 7 --keep-weekly 4 --keep-monthly 6 \
  --prune

# ---- cleanup + state ----
rm -rf "$STAGING"
write_state 0 "ok"
kuma_push up "ok"
log "done"
