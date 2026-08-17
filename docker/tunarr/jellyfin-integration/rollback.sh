#!/usr/bin/env bash
#
# Rimuove da Jellyfin il tuner Tunarr e il provider guida XMLTV.
# Non tocca nient'altro: utenti, librerie, encoding restano invariati.
#
# Uso:
#   JELLYFIN_API_KEY=xxx ./rollback.sh [--dry-run]
#
# Exit code: 0 ok (anche se non c'era niente da rimuovere), 1 env/uso, 4 errore API.

set -euo pipefail

TUNARR_URL="${TUNARR_URL:-http://localhost:8000}"
JELLYFIN_URL="${JELLYFIN_URL:-http://localhost:8096}"
DRY_RUN=0

info() { printf '  %s\n' "$*"; }
step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
ok()   { printf '  \033[32mOK\033[0m   %s\n' "$*"; }
die()  { printf '  \033[31mFAIL\033[0m %s\n' "$2" >&2; exit "$1"; }

while [ $# -gt 0 ]; do
    case "$1" in
        --dry-run) DRY_RUN=1 ;;
        -h|--help) sed -n '3,9p' "${BASH_SOURCE[0]}" | sed 's/^# \?//'; exit 0 ;;
        *)         die 1 "argomento sconosciuto: $1" ;;
    esac
    shift
done

for bin in curl jq; do
    command -v "$bin" >/dev/null 2>&1 || die 1 "$bin non installato"
done
[ -n "${JELLYFIN_API_KEY:-}" ] || die 1 "JELLYFIN_API_KEY non impostata"

jf() {
    local method="$1" path="$2"
    curl --silent --show-error --request "$method" --url "${JELLYFIN_URL}${path}" \
         --write-out '\n%{http_code}' --config - <<EOF
header = "Authorization: MediaBrowser Token=\"${JELLYFIN_API_KEY}\""
EOF
}

jf_get() {
    local response status
    response="$(jf GET "$1")" || die 4 "curl fallito su $1"
    status="$(printf '%s' "$response" | tail -n1)"
    [ "${status:0:1}" = "2" ] || die 4 "$1: HTTP $status"
    printf '%s' "$response" | sed '$d'
}

jf_delete() {
    local path="$1" label="$2"
    if [ "$DRY_RUN" -eq 1 ]; then
        info "DRY-RUN DELETE ${JELLYFIN_URL}${path}"
        return 0
    fi
    local response status
    response="$(jf DELETE "$path")" || die 4 "curl fallito: $label"
    status="$(printf '%s' "$response" | tail -n1)"
    [ "${status:0:1}" = "2" ] || die 4 "$label: HTTP $status"
}

step "Rollback integrazione Tunarr in Jellyfin"

cfg="$(jf_get "/System/Configuration/livetv")"

tuner_id="$(printf '%s' "$cfg" | jq -r --arg url "$TUNARR_URL" \
    '.TunerHosts[]? | select(.Url == $url and .Type == "hdhomerun") | .Id' | head -1)"
provider_id="$(printf '%s' "$cfg" | jq -r --arg path "${TUNARR_URL}/api/xmltv.xml" \
    '.ListingProviders[]? | select(.Path == $path and .Type == "xmltv") | .Id' | head -1)"

if [ -n "$tuner_id" ]; then
    jf_delete "/LiveTv/TunerHosts?id=${tuner_id}" "delete tuner"
    ok "tuner rimosso ($tuner_id)"
else
    info "nessun tuner Tunarr registrato"
fi

if [ -n "$provider_id" ]; then
    jf_delete "/LiveTv/ListingProviders?id=${provider_id}" "delete provider"
    ok "provider XMLTV rimosso ($provider_id)"
else
    info "nessun provider XMLTV Tunarr registrato"
fi

step "Fatto."
