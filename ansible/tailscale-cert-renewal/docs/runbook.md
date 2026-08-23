# Runbook — rinnovo certificato Tailscale su NPM (Vaultwarden)

Procedura di test pre-produzione, criterio di successo per il primo rinnovo
reale (atteso novembre 2026), e piano di rollback manuale. Corrisponde alle
decisioni di [G3](../../../.wayfinder/tickets/G3-test-e-rollback.md).

**Vincolo di fondo, da tenere presente in ogni test**: `tailscale cert`
fuori dalla finestra di rinnovo (~30 giorni prima della scadenza oggi)
restituisce il certificato in cache, senza contattare Let's Encrypt. Un
test eseguito oggi non può quindi dimostrare che un rinnovo vero funzioni
end-to-end — può solo dimostrare che il meccanismo (byte-diff, backup,
scrittura, `nginx -t`, reload, rollback) è corretto. Il primo test onesto
del ramo "rinnovo vero" è il rinnovo vero, a novembre.

## Perché non c'è un host NPM usa-e-getta

L'idea originale di G3 era creare un secondo proxy host in NPM sullo stesso
certificato, per esercitare il ciclo senza toccare Vaultwarden. La
ricognizione live ([T1](../../../.wayfinder/tickets/T1-ricognizione-live.md),
B3) l'ha invalidata: NPM rifiuta un secondo host con lo stesso
`domain_name`, e senza la capability `dns-subdomain-resolve` (assente su
questo tailnet, T1/B1) non esiste un secondo nome da dargli.

Al suo posto, i test qui sotto isolano esattamente il pezzo che il fixture
voleva esercitare — se `nginx -t` accetta la coppia cert/chiave — con un
config nginx sintetico e scartabile, senza mai toccare la configurazione
live.

---

## Test 1 — la chiave SSH è davvero ristretta

Prerequisito: T2 completato (chiave installata, script deployato sul NAS).

```bash
ssh -i ~/.ssh/semaphore-cert-renew nicholasizzo@192.168.0.36 "whoami"
```

**Atteso**: l'output è quello dello script (`tailscale-cert-renew.sh`,
tipicamente termina con una riga `RESULT: ...`), **non** la stringa
`nicholasizzo`. Se stampa `nicholasizzo`, il `command=` in
`authorized_keys` non è impostato correttamente — fermarsi qui e rivedere
`remote/authorized_keys.snippet` prima di procedere.

> **Eccezione nota su questo NAS (verificata 2026-08-23, vedi
> [T2](../../../.wayfinder/tickets/T2-ssh-ristretto-semaphore.md), nota
> post-deploy)**: su UGOS il test **stampa sempre `nicholasizzo`**,
> indipendentemente da come è scritto `authorized_keys` — un
> `ForceCommand` globale in `sshd_config` ha precedenza sul `command=` e
> concede comando arbitrario a chiunque autentichi come utente del gruppo
> `admin` (`nicholasizzo` lo è). Non è un errore di configurazione da
> correggere: è un limite noto e accettato. Su questo NAS il Test 1 **non
> è un cancello affidabile** — non fermarti qui per questo, ma non
> considerare la chiave un vero sandbox di comando.

## Test 2 — rehearsal: la coppia cert/chiave candidata è valida per nginx

Isola il rischio che R1 ha segnalato: NPM non verifica che chiave e
certificato corrispondano, quindi una coppia disallineata passerebbe la
validazione di NPM e romperebbe `nginx -t` solo al reload successivo.
Questo test verifica quel gate in isolamento completo, su un config nginx
sintetico che non tocca mai `/data/nginx/proxy_host/2.conf`.

**2a — prova di correttezza** (la coppia reale deve passare):

```bash
docker exec nginx-proxy-manager sh -c '
  mkdir -p /tmp/cert-rehearsal
  cp /data/custom_ssl/npm-3/fullchain.pem /tmp/cert-rehearsal/
  cp /data/custom_ssl/npm-3/privkey.pem /tmp/cert-rehearsal/
  cat > /tmp/cert-rehearsal/nginx.conf <<EOF
user npm;
events {}
http {
  server {
    listen 8443 ssl;
    ssl_certificate     /tmp/cert-rehearsal/fullchain.pem;
    ssl_certificate_key /tmp/cert-rehearsal/privkey.pem;
  }
}
EOF
  nginx -t -c /tmp/cert-rehearsal/nginx.conf
'
```

> **Nota (verificata 2026-08-23)**: la direttiva `user npm;` è necessaria
> — omettendola nginx prova a droppare i privilegi sull'utente di default
> `nginx`, che in questo container non esiste (`getpwnam("nginx") failed`).
> L'immagine `jc21/nginx-proxy-manager` gira come utente `npm`
> (`/etc/passwd`: `npm:x:0:0::/tmp/npmuserhome:/bin/false`), non `nginx`.
> Senza questa riga il test fallisce per un motivo indipendente dal
> certificato, e sembra (erroneamente) un problema di cert/chiave.

**Atteso**: `nginx: configuration file /tmp/cert-rehearsal/nginx.conf test
is successful`.

**2b — prova del rollback** (una chiave deliberatamente sbagliata deve far
fallire il test):

```bash
docker exec nginx-proxy-manager sh -c '
  openssl ecparam -name prime256v1 -genkey -noout -out /tmp/cert-rehearsal/privkey.pem
  nginx -t -c /tmp/cert-rehearsal/nginx.conf
'
```

**Atteso**: `nginx -t` fallisce (`SSL_CTX_use_PrivateKey... key values
mismatch` o simile). Questo prova che il gate funziona davvero, non solo
in teoria — ed è lo stesso identico controllo che lo script userà come
cancello duro prima di ogni reload reale.

Pulizia dopo il test:

```bash
docker exec nginx-proxy-manager rm -rf /tmp/cert-rehearsal
```

## Test 3 — no-op reale, in produzione, sicuro per costruzione

Eseguire davvero lo script (via SSH con la chiave ristretta, o direttamente
sul NAS) mentre il certificato installato e quello in cache **coincidono**
è sicuro: il gate byte-diff garantisce che nessuna scrittura avvenga.

> **Nota sul primo run**: T1/B5 ha stabilito che la cache tailscaled e
> `npm-3/fullchain.pem` hanno la stessa catena a 4 blocchi ma differiscono
> di ~96 byte di formattazione (non di contenuto). Il confronto dello
> script è byte-a-byte letterale, non normalizzato — decisione presa
> esplicitamente per semplicità. **Aspettati quindi `RESULT: renewed` alla
> primissima esecuzione in produzione**, anche se il certificato non è
> affatto scaduto: è il riallineamento cosmetico della formattazione, non
> un bug. Da quella esecuzione in poi, scrittura e cache coincidono e ogni
> `RESULT: renewed` successivo è un rinnovo vero.

Asserzioni da fare **prima e dopo** l'esecuzione, per provare che un
no-op vero non tocca nulla:

```bash
# PID dei worker nginx — devono restare identici se non c'è stato reload
docker exec nginx-proxy-manager sh -c "pgrep -f 'nginx: worker'"

# mtime del backup — non deve cambiare se non è stata fatta una sostituzione
docker exec nginx-proxy-manager stat -c '%Y' /data/custom_ssl/npm-3.bak 2>/dev/null || echo "(nessun backup ancora presente — normale prima della prima sostituzione)"
```

Esegui lo script, poi ripeti gli stessi due comandi:

- **PID worker invariati** → nessun reload è avvenuto.
- **mtime del backup invariato** (o assente come prima) → nessuna
  sostituzione è avvenuta.
- Ultima riga di output: `RESULT: nochange | ...`.

## Criterio di successo per il primo rinnovo reale (atteso novembre 2026)

Sequenza attesa su due esecuzioni consecutive:

1. **Giorno N** (apertura della finestra di rinnovo): `RESULT: pending | rinnovo asincrono innescato...`. Nessuna scrittura, nessun reload — è corretto, non un bug: il rinnovo vero avviene in background e il certificato nuovo arriva in cache solo domani (R2).
2. **Giorno N+1**: `RESULT: renewed | ...` con un `notAfter` nuovo, spostato di ~90 giorni.

Chi se ne accorge se la sequenza non si verifica: il monitor Kuma
([G4a](../../../.wayfinder/tickets/G4a-kuma-expiry-monitor.md), vedi
`kuma-setup.md`) — è la rete di sicurezza indipendente da questo job, non
un sostituto della lettura dei log. **Il silenzio di Kuma conferma solo
"non sta per scadere", non "si è rinnovato secondo programma"**: per la
conferma positiva, un controllo manuale una tantum a novembre:

```bash
echo | openssl s_client -connect dh4300plus-fix.taile39e4f.ts.net:44075 -servername dh4300plus-fix.taile39e4f.ts.net 2>/dev/null \
  | openssl x509 -noout -dates
```

## Rollback manuale

Lo script fa rollback da solo se `nginx -t` fallisce dopo la scrittura
(`RESULT: rollback`). Se serve intervenire a mano (es. lo script stesso è
irraggiungibile a metà esecuzione):

```bash
docker exec nginx-proxy-manager sh -c '
  ls -la /data/custom_ssl/npm-3.bak 2>&1   # verifica che il backup esista prima di procedere
'
docker exec nginx-proxy-manager sh -c '
  rm -rf /data/custom_ssl/npm-3 &&
  mv /data/custom_ssl/npm-3.bak /data/custom_ssl/npm-3 &&
  nginx -t &&
  nginx -s reload
'
```

Se **non** esiste un `npm-3.bak` (nessuna sostituzione era mai stata
tentata), non c'è nulla da ripristinare: il certificato attualmente in
`npm-3/` è quello originale.

## Piano B — se l'automazione fallisce e Vaultwarden è giù

Procedura manuale completa in
[`docker/vaultwarden/README.md`](../../../docker/vaultwarden/README.md)
(passi 4-6). **Correzione da tenere a mente leggendolo**: il passo 4 dice
di copiare i certificati da `tailscale:/tmp/certs/<hostname>.crt` — quel
percorso è **sbagliato** (confermato in T1/B6 e R2/A4): l'immagine
Tailscale non imposta `WORKDIR`, quindi senza flag espliciti i file
finirebbero nella root del container, non in `/tmp/certs/`. Il percorso
vero, che esiste già e non richiede rigenerare nulla, è:

```
docker exec tailscale cat /var/lib/tailscale/certs/dh4300plus-fix.taile39e4f.ts.net.crt
docker exec tailscale cat /var/lib/tailscale/certs/dh4300plus-fix.taile39e4f.ts.net.key
```

Il file `.crt` è già la fullchain completa (leaf + intermediate + root,
T1/B6) — **non serve lo split** leaf/intermediate descritto al passo 5 del
README: quello è un artefatto della UI di NPM, non un passaggio tecnico
necessario se si scrive il file direttamente.
