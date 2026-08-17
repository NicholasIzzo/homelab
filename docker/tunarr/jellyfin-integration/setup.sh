#!/usr/bin/env bash
#
# Registra Tunarr in Jellyfin come tuner HDHomeRun + provider guida XMLTV.
# Idempotente: rieseguirlo non duplica nulla (check-then-create).
#
# Uso:
#   JELLYFIN_API_KEY=xxx ./setup.sh [--dry-run] [--reconfigure] [--skip-backup]
#
# Va eseguito SU hpserver (il backup di Jellyfin e' locale e richiede sudo).
#
# Exit code:
#   0  tutto ok
#   1  uso errato / variabile d'ambiente mancante
#   2  prerequisito Tunarr fallito (down o endpoint mancante)
#   3  Tunarr non ha canali: la config Jellyfin sarebbe inutile
#   4  errore su una chiamata API Jellyfin
#   5  post-check fallito (config scritta ma risultato non verificato)
#   6  backup della config Jellyfin fallito

set -euo pipefail

# --- Configurazione (sovrascrivibile da env) --------------------------------

# URL con cui *Jellyfin* raggiunge Tunarr. Entrambi girano su hpserver, e Tunarr
# e' in network_mode host: localhost e' corretto e resta valido se cambia l'IP.
TUNARR_URL="${TUNARR_URL:-http://localhost:8000}"
# URL con cui *questo script* sonda Tunarr. Uguale al precedente se lo script
# gira su hpserver; va cambiato se lo si esegue da un'altra macchina.
TUNARR_PROBE_URL="${TUNARR_PROBE_URL:-http://localhost:8000}"
JELLYFIN_URL="${JELLYFIN_URL:-http://localhost:8096}"
BACKUP_DIR="${BACKUP_DIR:-$HOME}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PAYLOAD_DIR="$SCRIPT_DIR/payloads"

DRY_RUN=0
RECONFIGURE=0
SKIP_BACKUP=0

# --- Output -----------------------------------------------------------------

info()  { printf '  %s\n' "$*"; }
step()  { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
ok()    { printf '  \033[32mOK\033[0m   %s\n' "$*"; }
warn()  { printf '  \033[33mWARN\033[0m %s\n' "$*"; }
fail()  { printf '  \033[31mFAIL\033[0m %s\n' "$*" >&2; }
die()   { fail "$2"; exit "$1"; }

usage() {
    sed -n '3,12p' "${BASH_SOURCE[0]}" | sed 's/^# \?//'
    exit "${1:-0}"
}

while [ $# -gt 0 ]; do
    case "$1" in
        --dry-run)      DRY_RUN=1 ;;
        --reconfigure)  RECONFIGURE=1 ;;
        --skip-backup)  SKIP_BACKUP=1 ;;
        -h|--help)      usage 0 ;;
        *)              fail "argomento sconosciuto: $1"; usage 1 ;;
    esac
    shift
done

for bin in curl jq; do
    command -v "$bin" >/dev/null 2>&1 || die 1 "$bin non installato"
done

[ -n "${JELLYFIN_API_KEY:-}" ] || die 1 \
    "JELLYFIN_API_KEY non impostata. Crea la chiave in Dashboard > API Keys > + e riesegui con: JELLYFIN_API_KEY=... $0"

# --- Wrapper API ------------------------------------------------------------

# La chiave viene passata a curl via stdin (--config -), non in argv: cosi' non
# compare in "ps" ne' nella shell history di chi guarda il processo.
jf() {
    local method="$1" path="$2" body="${3:-}"
    local url="${JELLYFIN_URL}${path}"
    local -a args=(--silent --show-error --request "$method" --url "$url"
                   --write-out '\n%{http_code}')
    if [ -n "$body" ]; then
        args+=(--header 'Content-Type: application/json' --data "$body")
    fi
    curl "${args[@]}" --config - <<EOF
header = "Authorization: MediaBrowser Token=\"${JELLYFIN_API_KEY}\""
EOF
}

# Esegue una chiamata e verifica lo status HTTP. In dry-run stampa e basta.
jf_call() {
    local method="$1" path="$2" body="${3:-}" label="$4"
    if [ "$DRY_RUN" -eq 1 ]; then
        info "DRY-RUN $method ${JELLYFIN_URL}${path}"
        if [ -n "$body" ]; then
            printf '%s\n' "$body" | jq . | sed 's/^/         /'
        fi
        return 0
    fi
    local response status payload
    response="$(jf "$method" "$path" "$body")" || die 4 "$label: curl fallito"
    status="$(printf '%s' "$response" | tail -n1)"
    payload="$(printf '%s' "$response" | sed '$d')"
    case "$status" in
        2*) printf '%s' "$payload" ;;
        *)  fail "$label: HTTP $status"
            printf '%s\n' "$payload" | head -5 >&2
            exit 4 ;;
    esac
}

# GET che deve riuscire, restituisce solo il body.
jf_get() {
    local path="$1" label="$2"
    local response status
    response="$(jf GET "$path")" || die 4 "$label: curl fallito"
    status="$(printf '%s' "$response" | tail -n1)"
    [ "${status:0:1}" = "2" ] || die 4 "$label: HTTP $status"
    printf '%s' "$response" | sed '$d'
}

# --- 0. Backup --------------------------------------------------------------

do_backup() {
    step "Backup configurazione Jellyfin"
    local target="${BACKUP_DIR}/jellyfin-backup-pre-tunarr-$(date +%Y%m%d-%H%M).tar.gz"
    if [ "$DRY_RUN" -eq 1 ]; then
        info "DRY-RUN sudo tar czf $target /etc/jellyfin /var/lib/jellyfin/config"
        return 0
    fi
    sudo tar czf "$target" /etc/jellyfin /var/lib/jellyfin/config \
        || die 6 "backup fallito: non proseguo"
    ok "backup: $target"
}

# --- 1. Prerequisiti Tunarr -------------------------------------------------

check_tunarr() {
    step "Prerequisiti Tunarr ($TUNARR_PROBE_URL)"

    curl -sf --max-time 10 "${TUNARR_PROBE_URL}/api/system/health" >/dev/null \
        || die 2 "Tunarr non risponde su ${TUNARR_PROBE_URL}/api/system/health. Deploya lo stack prima di configurare Jellyfin."
    ok "/api/system/health"

    local ep
    for ep in /device.xml /discover.json /lineup.json /api/xmltv.xml; do
        curl -sf --max-time 10 "${TUNARR_PROBE_URL}${ep}" >/dev/null \
            || die 2 "endpoint ${ep} non risponde"
        ok "$ep"
    done

    # Senza canali reali Tunarr non restituisce un lineup vuoto: espone un
    # segnaposto che punta a /setup ({"GuideName":"Tunarr","URL":".../setup"}).
    # Contare gli elementi non basta — va escluso, altrimenti si registrerebbe
    # in Jellyfin un tuner che non mostra nulla.
    local channels
    channels="$(curl -sf --max-time 10 "${TUNARR_PROBE_URL}/lineup.json" \
        | jq '[.[] | select((.URL // "") | endswith("/setup") | not)] | length')"
    [ "$channels" -gt 0 ] 2>/dev/null \
        || die 3 "Tunarr non ha canali reali (solo il segnaposto /setup). Creane almeno uno con dei programmi nella UI: ${TUNARR_PROBE_URL}"
    ok "$channels canale/i reale/i nel lineup"

    # Un canale puo' esistere ed essere vuoto: comparirebbe in Jellyfin senza
    # riprodurre niente. Serve almeno un canale con dei programmi dentro.
    local programmed
    programmed="$(curl -sf --max-time 10 "${TUNARR_PROBE_URL}/api/channels" \
        | jq '[.[] | select((.programCount // 0) > 0)] | length')"
    [ "$programmed" -gt 0 ] 2>/dev/null \
        || die 3 "I canali Tunarr sono tutti vuoti (programCount 0). Aggiungi programmi dalla tab Programming prima di configurare Jellyfin."
    ok "$programmed canale/i con programmi"
}

# --- 2. Stato attuale di Jellyfin -------------------------------------------

# LiveTvOptions e' una "named configuration": non esiste GET /LiveTv/TunerHosts.
livetv_config() { jf_get "/System/Configuration/livetv" "lettura config livetv"; }

tuner_id() {
    printf '%s' "$1" | jq -r --arg url "$TUNARR_URL" \
        '.TunerHosts[]? | select(.Url == $url and .Type == "hdhomerun") | .Id' | head -1
}

provider_id() {
    printf '%s' "$1" | jq -r --arg path "${TUNARR_URL}/api/xmltv.xml" \
        '.ListingProviders[]? | select(.Path == $path and .Type == "xmltv") | .Id' | head -1
}

# --- 3. Rimozione (per --reconfigure e rollback) ----------------------------

remove_existing() {
    step "Rimozione configurazione Tunarr esistente (--reconfigure)"
    local cfg tid pid
    cfg="$(livetv_config)"
    tid="$(tuner_id "$cfg")"
    pid="$(provider_id "$cfg")"

    if [ -n "$tid" ]; then
        jf_call DELETE "/LiveTv/TunerHosts?id=${tid}" "" "delete tuner" >/dev/null
        ok "tuner rimosso ($tid)"
    else
        info "nessun tuner Tunarr da rimuovere"
    fi

    if [ -n "$pid" ]; then
        jf_call DELETE "/LiveTv/ListingProviders?id=${pid}" "" "delete provider" >/dev/null
        ok "provider rimosso ($pid)"
    else
        info "nessun provider XMLTV da rimuovere"
    fi
}

# --- 4. Creazione tuner + provider ------------------------------------------

render_payload() {
    sed "s|__TUNARR_URL__|${TUNARR_URL}|g" "${PAYLOAD_DIR}/$1"
}

add_tuner() {
    step "Tuner HDHomeRun"
    local cfg existing
    cfg="$(livetv_config)"
    existing="$(tuner_id "$cfg")"
    if [ -n "$existing" ]; then
        ok "gia' presente ($existing) — nessuna modifica"
        return 0
    fi
    # Jellyfin valida il tuner alla creazione: chiama /discover.json su Tunarr.
    # Se Tunarr e' down qui la POST fallisce con 4xx.
    jf_call POST "/LiveTv/TunerHosts" "$(render_payload tuner-host-hdhomerun.json)" \
        "add tuner" >/dev/null
    ok "tuner creato ($TUNARR_URL)"
}

add_provider() {
    step "Provider guida XMLTV"
    local cfg existing
    cfg="$(livetv_config)"
    existing="$(provider_id "$cfg")"
    if [ -n "$existing" ]; then
        ok "gia' presente ($existing) — nessuna modifica"
        return 0
    fi
    jf_call POST "/LiveTv/ListingProviders?validateListings=false&validateLogin=false" \
        "$(render_payload listing-provider-xmltv.json)" "add provider" >/dev/null
    ok "provider creato (${TUNARR_URL}/api/xmltv.xml)"
}

# --- 5. Mapping canali <-> guida --------------------------------------------

map_channels() {
    step "Mapping canali tuner <-> guida XMLTV"
    local pid opts unmapped
    pid="$(provider_id "$(livetv_config)")"
    if [ -z "$pid" ]; then
        if [ "$DRY_RUN" -eq 1 ]; then
            info "DRY-RUN provider non ancora creato: mapping da valutare a runtime"
            return 0
        fi
        die 4 "provider XMLTV non trovato dopo la creazione"
    fi

    opts="$(jf_get "/LiveTv/ChannelMappingOptions?providerId=${pid}" "channel mapping options")"

    # Un canale e' gia' a posto se ProviderChannelId e' valorizzato.
    unmapped="$(printf '%s' "$opts" | jq -c '[.TunerChannels[]? | select((.ProviderChannelId // "") == "")]')"
    local count
    count="$(printf '%s' "$unmapped" | jq 'length')"
    if [ "$count" -eq 0 ]; then
        ok "tutti i canali sono gia' mappati"
        return 0
    fi

    info "$count canale/i senza guida: tento il match per nome"
    local tuner_ch_id tuner_name provider_ch_id
    while IFS=$'\t' read -r tuner_ch_id tuner_name; do
        [ -n "$tuner_ch_id" ] || continue
        provider_ch_id="$(printf '%s' "$opts" | jq -r --arg n "$tuner_name" \
            '.ProviderChannels[]? | select((.Name // "") == $n) | .Id' | head -1)"
        if [ -z "$provider_ch_id" ]; then
            warn "nessuna corrispondenza XMLTV per \"$tuner_name\" — resta senza guida"
            continue
        fi
        local body
        body="$(jq -n --arg p "$pid" --arg t "$tuner_ch_id" --arg c "$provider_ch_id" \
            '{providerId: $p, tunerChannelId: $t, providerChannelId: $c}')"
        jf_call POST "/LiveTv/ChannelMappings" "$body" "map $tuner_name" >/dev/null
        ok "\"$tuner_name\" -> $provider_ch_id"
    done < <(printf '%s' "$unmapped" | jq -r '.[] | [.Id, .Name] | @tsv')
}

# --- 6. Refresh guida -------------------------------------------------------

refresh_guide() {
    step "Refresh guida EPG"
    # POST /LiveTv/GuideRefresh non esiste: il refresh e' uno scheduled task.
    local task_id
    if [ "$DRY_RUN" -eq 1 ]; then
        info "DRY-RUN GET /ScheduledTasks -> id del task Key=RefreshGuide"
        info "DRY-RUN POST /ScheduledTasks/Running/<id>"
        return 0
    fi
    task_id="$(jf_get "/ScheduledTasks" "lista task" \
        | jq -r '.[] | select(.Key == "RefreshGuide") | .Id' | head -1)"
    [ -n "$task_id" ] || die 4 "task RefreshGuide non trovato"
    jf_call POST "/ScheduledTasks/Running/${task_id}" "" "avvio RefreshGuide" >/dev/null
    ok "task RefreshGuide avviato ($task_id)"
}

# --- 7. Verifiche post-config ----------------------------------------------

post_checks() {
    step "Verifiche post-configurazione"
    if [ "$DRY_RUN" -eq 1 ]; then
        info "DRY-RUN GET /System/Configuration/livetv"
        info "DRY-RUN GET /LiveTv/Channels"
        info "DRY-RUN GET /LiveTv/Programs?channelIds=<id>"
        return 0
    fi

    local cfg
    cfg="$(livetv_config)"
    [ -n "$(tuner_id "$cfg")" ]    || { fail "tuner non presente in config"; return 5; }
    [ -n "$(provider_id "$cfg")" ] || { fail "provider non presente in config"; return 5; }
    ok "tuner e provider presenti in livetv config"

    # La guida viene scaricata in background: i programmi possono arrivare dopo.
    local tries=0 channels=0 chans_json=""
    while [ "$tries" -lt 12 ]; do
        chans_json="$(jf_get "/LiveTv/Channels" "lista canali")"
        channels="$(printf '%s' "$chans_json" | jq '.TotalRecordCount // 0')"
        if [ "$channels" -gt 0 ]; then
            break
        fi
        tries=$((tries + 1))
        sleep 5
    done
    if [ "$channels" -eq 0 ]; then
        fail "nessun canale Live TV dopo 60s — tuner registrato ma non produce canali"
        return 5
    fi
    ok "$channels canale/i Live TV"

    local first_id
    first_id="$(printf '%s' "$chans_json" | jq -r '.Items[0].Id')"
    local programs
    programs="$(jf_get "/LiveTv/Programs?channelIds=${first_id}" "programmi EPG" \
        | jq '.TotalRecordCount // 0')"
    if [ "$programs" -gt 0 ]; then
        ok "$programs programmi EPG sul primo canale"
    else
        warn "nessun programma EPG: il task RefreshGuide puo' metterci qualche minuto. Ricontrolla con:"
        info "  curl -s -H 'Authorization: MediaBrowser Token=\"\$JELLYFIN_API_KEY\"' '${JELLYFIN_URL}/LiveTv/Programs?channelIds=${first_id}' | jq .TotalRecordCount"
    fi
    return 0
}

# --- Main -------------------------------------------------------------------

if [ "$DRY_RUN" -eq 1 ]; then
    step "MODALITA' DRY-RUN — nessuna modifica verra' applicata"
fi

check_tunarr

if [ "$SKIP_BACKUP" -eq 0 ]; then
    do_backup
fi

if [ "$RECONFIGURE" -eq 1 ]; then
    remove_existing
fi

add_tuner
add_provider
map_channels
refresh_guide

if post_checks; then
    step "Fatto."
    exit 0
else
    step "Configurazione applicata ma verifica incompleta — vedi sopra."
    exit 5
fi
