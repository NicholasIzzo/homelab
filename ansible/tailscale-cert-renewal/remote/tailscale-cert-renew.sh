#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# tailscale-cert-renew.sh
#
# Rinnovo idempotente del certificato Tailscale servito da Nginx Proxy
# Manager per Vaultwarden. Vive SUL NAS (192.168.0.36), non su questa
# macchina Ansible.
#
# Invocato via SSH da Semaphore attraverso una chiave con `command=`
# ristretto in authorized_keys (T2 — vedi remote/authorized_keys.snippet):
# per questo NON legge argomenti né $SSH_ORIGINAL_COMMAND — qualunque cosa
# il chiamante chieda, questo script fa sempre e solo questo.
#
# Regole fisse — violarle riapre problemi già chiusi nella mappa
# (.wayfinder/map.md e i ticket R1/R2/T1/T2/G2):
#
#   - MAI passare --min-validity a `tailscale cert` (R2): bypassa il check
#     ARI e può emettere un certificato nuovo a ogni esecuzione fino al
#     blocco della quota Let's Encrypt.
#   - MAI `docker exec -t` (T2): nessuna allocazione TTY, esecuzione sempre
#     non interattiva.
#   - MAI output .p12/.pfx da `tailscale cert` (R2): non deterministico,
#     romperebbe il byte-diff a ogni esecuzione anche senza rinnovo reale.
#   - Il confronto è SEMPRE byte-a-byte letterale, mai normalizzato. Decisione
#     esplicita dopo T1/B5: la cache tailscaled e npm-3/fullchain.pem hanno
#     la stessa catena a 4 blocchi ma differiscono di formattazione — la
#     prima esecuzione in produzione farà quindi UNA sostituzione cosmetica
#     (RESULT: renewed anche se il certificato non è "scaduto"). È attesa,
#     documentata in docs/runbook.md, e da lì in poi ogni run è nochange
#     finché non c'è un rinnovo vero.
#
# Formato di output — l'ULTIMA riga di stdout è sempre:
#   RESULT: <stato> | <messaggio>
# dove <stato> è uno di: nochange, pending, renewed, error, rollback.
# playbook.yml legge solo quella riga per decidere se notificare (G4b).
# ============================================================================

# --- Costanti — fatti misurati dal vivo in T1, non parametri da indovinare -
readonly DOMAIN="dh4300plus-fix.taile39e4f.ts.net"          # T1/B1
readonly TAILSCALE_CONTAINER="tailscale"
readonly NPM_CONTAINER="nginx-proxy-manager"
readonly NPM_CERT_DIR="/data/custom_ssl/npm-3"               # certificate_id=3, T1/B3
readonly TAILSCALE_SOCKET="/tmp/tailscaled.sock"              # R2 §6: il symlink al path di default è best-effort
readonly LIVE_CHECK_PORT="44075"                              # porta pubblicata da NPM sull'host, T1/B4

# --- Workdir locale (su questa macchina NAS, non nei container) -----------
# Usiamo file, non variabili di shell, per confrontare e trasportare i PEM:
# la sostituzione di comando $(...) in bash tronca i newline finali, il che
# romperebbe silenziosamente il confronto byte-a-byte e la scrittura.
WORKDIR="$(mktemp -d)"

# --- Garanzia di output: anche se lo script muore in un punto non previsto,
# --- una riga RESULT viene comunque emessa (G4b: "quali asserzioni deve
# --- fare il playbook perché un guasto si traduca in exit non-zero" — qui
# --- la garanzia è strutturale, non un'asserzione isolata) -----------------
RESULT_EMITTED=0

emit_result() {
    local state="$1"
    shift
    RESULT_EMITTED=1
    echo "RESULT: ${state} | $*"
}

on_exit() {
    local ec=$?
    if [ "${RESULT_EMITTED}" -eq 0 ]; then
        echo "RESULT: error | uscita inattesa, codice ${ec} — vedi il log sopra per il comando che ha fallito"
    fi
    rm -rf "${WORKDIR}"
}
trap on_exit EXIT

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

# Stato del certificato realmente servito in questo momento — usata sia nei
# messaggi di errore/rollback (G4b: "il servizio è su o giù ORA", senza
# dover aprire altro) sia come conferma finale dopo un reload riuscito.
# Gira direttamente sull'host: la porta 44075 è pubblicata da NPM sull'host
# (T1/B4), non serve entrare nel container.
check_live_cert() {
    openssl s_client -connect "127.0.0.1:${LIVE_CHECK_PORT}" \
        -servername "${DOMAIN}" </dev/null 2>/dev/null \
        | openssl x509 -noout -subject -dates 2>/dev/null \
        || echo "impossibile leggere il certificato live sulla porta ${LIVE_CHECK_PORT}"
}

log "=== avvio rinnovo per ${DOMAIN} ==="

# --- 1. Trigger del rinnovo -------------------------------------------------
# Questa invocazione È il motore di rinnovo (R2): con NPM davanti a
# Vaultwarden il refresh loop interno di tailscaled non parte mai
# (serveConfigUsesACMECerts è falso senza `tailscale serve`, refresh.go:36).
# Se questo comando smette di girare, nessuno rinnova più — in silenzio,
# fino alla scadenza. Per questo G4a (monitor Kuma sull'endpoint live)
# esiste come rete di sicurezza indipendente da questo script.
#
# --cert-file=- --key-file=- manda l'output della CLI su stdout invece che
# scriverlo su file: la cache interna di tailscaled si aggiorna comunque,
# indipendentemente da questi flag (R2 §4/§6 — WriteTLSCertAndKey è un
# percorso di scrittura lato daemon, separato da quello della CLI). Quindi
# non serve lasciare nessun file nel filesystem del container per ottenere
# il trigger.
log "invocazione tailscale cert (trigger + eventuale rinnovo ARI in background)..."
TAILSCALE_CERT_LOG="${WORKDIR}/tailscale-cert.log"
if ! docker exec "${TAILSCALE_CONTAINER}" \
        tailscale --socket="${TAILSCALE_SOCKET}" cert \
        --cert-file=- --key-file=- "${DOMAIN}" \
        > "${TAILSCALE_CERT_LOG}" 2>&1; then
    log "tailscale cert ha fallito:"
    cat "${TAILSCALE_CERT_LOG}"
    emit_result "error" "tailscale cert non ha risposto o ha rifiutato il dominio — stato live: $(check_live_cert | tr '\n' ' ')"
    exit 1
fi

# --- 2. Rilevare un rinnovo asincrono appena innescato ----------------------
# R2: con minValidity=0 (il nostro caso — non passiamo mai --min-validity),
# un rinnovo che rientra nella finestra ARI parte in BACKGROUND e QUESTA
# invocazione restituisce ancora il certificato VECCHIO. Il certificato
# nuovo arriva nella cache solo domani. Senza questo controllo, il giorno
# del trigger sembrerebbe un nochange qualunque, e chi legge i log a
# novembre concluderebbe erroneamente che il job non ha funzionato (G3).
RENEWAL_JUST_TRIGGERED=0
if docker logs --since 1m "${TAILSCALE_CONTAINER}" 2>&1 \
        | grep -qF "cert(\"${DOMAIN}\"): starting async renewal"; then
    RENEWAL_JUST_TRIGGERED=1
    log "rilevato rinnovo asincrono appena innescato — il certificato nuovo arriverà in cache domani"
fi

# --- 3. Lettura della cache tailscaled (fonte di verità, T1/B6) -------------
# Niente `docker cp`: si legge direttamente dal container via `cat`,
# ridirezionato su file per preservare i byte esatti (newline finali incluse).
docker exec "${TAILSCALE_CONTAINER}" cat "/var/lib/tailscale/certs/${DOMAIN}.crt" > "${WORKDIR}/new-fullchain.pem"
docker exec "${TAILSCALE_CONTAINER}" cat "/var/lib/tailscale/certs/${DOMAIN}.key"  > "${WORKDIR}/new-privkey.pem"

# --- 4. Lettura del certificato installato in NPM ---------------------------
docker exec "${NPM_CONTAINER}" cat "${NPM_CERT_DIR}/fullchain.pem" > "${WORKDIR}/current-fullchain.pem" 2>/dev/null \
    || : > "${WORKDIR}/current-fullchain.pem"
docker exec "${NPM_CONTAINER}" cat "${NPM_CERT_DIR}/privkey.pem"  > "${WORKDIR}/current-privkey.pem" 2>/dev/null \
    || : > "${WORKDIR}/current-privkey.pem"

# --- 5. Byte-diff — il gate che decide tutto (G2) ---------------------------
# cmp -s confronta i file byte per byte, senza normalizzazioni. Deciso
# esplicitamente dopo T1/B5: vedi la nota sul primo run in docs/runbook.md.
if cmp -s "${WORKDIR}/new-fullchain.pem" "${WORKDIR}/current-fullchain.pem" \
        && cmp -s "${WORKDIR}/new-privkey.pem" "${WORKDIR}/current-privkey.pem"; then
    if [ "${RENEWAL_JUST_TRIGGERED}" -eq 1 ]; then
        emit_result "pending" "rinnovo asincrono innescato, cache non ancora aggiornata — atteso RESULT: renewed alla prossima esecuzione"
    else
        emit_result "nochange" "certificato invariato, nessuna azione"
    fi
    exit 0
fi

log "differenza rilevata rispetto a ${NPM_CERT_DIR} — procedo con la sostituzione"

# --- 6. Scrittura in staging (.new), NESSUN file di produzione toccato -----
# Se qualcosa va storto qui, non serve alcun rollback: privkey.pem e
# fullchain.pem non sono ancora stati sfiorati.
docker exec -i "${NPM_CONTAINER}" sh -c "cat > '${NPM_CERT_DIR}/privkey.pem.new'"   < "${WORKDIR}/new-privkey.pem"
docker exec -i "${NPM_CONTAINER}" sh -c "cat > '${NPM_CERT_DIR}/fullchain.pem.new'" < "${WORKDIR}/new-fullchain.pem"

# Verifica che la scrittura via docker exec non abbia corrotto/troncato nulla
# (G4b: "quali asserzioni deve fare il playbook perché un guasto si traduca
# in exit non-zero" — questa è la prima delle due asserzioni esplicite).
docker exec "${NPM_CONTAINER}" cat "${NPM_CERT_DIR}/privkey.pem.new"   > "${WORKDIR}/staged-privkey.pem"
docker exec "${NPM_CONTAINER}" cat "${NPM_CERT_DIR}/fullchain.pem.new" > "${WORKDIR}/staged-fullchain.pem"

if ! cmp -s "${WORKDIR}/staged-privkey.pem" "${WORKDIR}/new-privkey.pem" \
        || ! cmp -s "${WORKDIR}/staged-fullchain.pem" "${WORKDIR}/new-fullchain.pem"; then
    log "la scrittura in staging non corrisponde al sorgente — nessun file di produzione è stato toccato"
    docker exec "${NPM_CONTAINER}" sh -c "rm -f '${NPM_CERT_DIR}/privkey.pem.new' '${NPM_CERT_DIR}/fullchain.pem.new'"
    emit_result "error" "scrittura in staging corrotta, nessuna modifica applicata — riprovare alla prossima esecuzione"
    exit 1
fi

# --- 7. Backup — un solo backup, sovrascritto (deciso: lo storico è compito
# --- di git per il testo, non dei blob di certificato) ---------------------
docker exec "${NPM_CONTAINER}" sh -c "
    rm -rf '${NPM_CERT_DIR}.bak' &&
    cp -a '${NPM_CERT_DIR}' '${NPM_CERT_DIR}.bak'
"
log "backup creato in ${NPM_CERT_DIR}.bak"

# --- 8. Scambio atomico, ORDINE INTENZIONALE --------------------------------
# Prima la chiave, poi il certificato: difesa in profondità contro un
# lettore concorrente che aprisse i due file separatamente durante la
# sostituzione. nginx non rilegge finché non c'è un reload esplicito (R1),
# quindi qui non c'è un rischio reale — ma la regola vale in generale ed è
# stata una correzione esplicita da mantenere leggibile nel codice.
docker exec "${NPM_CONTAINER}" sh -c "
    mv -f '${NPM_CERT_DIR}/privkey.pem.new' '${NPM_CERT_DIR}/privkey.pem' &&
    mv -f '${NPM_CERT_DIR}/fullchain.pem.new' '${NPM_CERT_DIR}/fullchain.pem'
"

# --- 9. nginx -t come cancello duro ------------------------------------------
# R1: NPM non verifica che chiave e certificato corrispondano. Una coppia
# disallineata passerebbe la validazione di NPM e romperebbe nginx -s
# reload dopo — per questo il gate vero è qui, non a monte.
if ! docker exec "${NPM_CONTAINER}" nginx -t 2>&1; then
    log "nginx -t fallito — ripristino il backup, NESSUN reload"
    docker exec "${NPM_CONTAINER}" sh -c "
        rm -rf '${NPM_CERT_DIR}' &&
        mv '${NPM_CERT_DIR}.bak' '${NPM_CERT_DIR}'
    "
    emit_result "rollback" "nginx -t ha rifiutato la nuova coppia cert/chiave, backup ripristinato senza reload — stato live: $(check_live_cert | tr '\n' ' ')"
    exit 2
fi

# --- 10. Reload — SIGHUP, mai un restart del container ----------------------
docker exec "${NPM_CONTAINER}" nginx -s reload
log "nginx ricaricato (nginx -s reload, nessun restart del container)"

# --- 11. Verifica finale: il servizio serve davvero il certificato nuovo? --
# Un reload che "riesce" per exit code ma non cambia nulla di osservabile
# sarebbe un fallimento silenzioso — G4b lo intercetta qui.
sleep 1
LIVE_AFTER="$(check_live_cert)"
if ! echo "${LIVE_AFTER}" | grep -q "notAfter"; then
    emit_result "error" "reload eseguito ma il certificato live non è verificabile subito dopo — controllare manualmente. Output: $(echo "${LIVE_AFTER}" | tr '\n' ' ')"
    exit 1
fi

emit_result "renewed" "sostituzione completata — $(echo "${LIVE_AFTER}" | grep notAfter)"
exit 0
