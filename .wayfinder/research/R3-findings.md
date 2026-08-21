---
ticket: R3
title: Ricognizione dello stato reale su NAS — esiti della ricerca
labels: [wayfinder:research]
---

# R3 — Stato reale NAS: cosa è stabilito e cosa resta da verificare live

Fonti primarie: documentazione Tailscale, sorgente `tailscale/tailscale` al tag **v1.102.3**
(ultima release al 2026-08-20), sorgente `NginxProxyManager/nginx-proxy-manager` (branch
`develop`). Nessun accesso live al NAS: il gruppo B è tutto in checklist.

---

## Gruppo A — stabilito

### A1. Tailscale **non** emette certificati per sotto-sottodomini arbitrari

**Risposta: no.** `nextcloud.<hostname>.taile39e4f.ts.net` (docker/nextcloud/README.md:85) è
**irrealizzabile** così com'è. La validazione è esplicita nel sorgente.

`feature/acme/cert.go`, funzione `resolveCertDomain` (v1.102.3, righe 667-700):

```go
// resolveCertDomain validates a domain and returns the cert domain to use.
//
//   - "node.ts.net" -> "node.ts.net" (exact CertDomain match)
//   - "*.node.ts.net" -> "*.node.ts.net" (explicit wildcard, requires NodeAttrDNSSubdomainResolve)
//   - "foo.com" -> "foo.com" (bring-your-own Funnel domain referenced by the
//     local serve config; issued via tls-alpn-01 in getCertPEM)
//
// Subdomain requests like "app.node.ts.net" are rejected; callers should
// request "*.node.ts.net" explicitly for subdomain coverage.
```

L'errore restituito per un nome non ammesso è:

```go
return "", fmt.Errorf("invalid domain %q; must be one of %q", domain, certDomains)
```

I domini ammessi vengono dalla netmap (`nm.DNS.CertDomains`), popolata dal control plane: per un
nodo normale contiene **il solo** `<machine-name>.<tailnet>.ts.net`.

Fonti:
- <https://github.com/tailscale/tailscale/blob/v1.102.3/feature/acme/cert.go> — `resolveCertDomain`,
  `validLookingCertDomain`
- <https://github.com/tailscale/tailscale/blob/v1.102.3/ipn/ipnlocal/cert.go> — docstring di
  `GetCertPEMWithValidity`: «The domain must be one of: An exact CertDomain (e.g. "node.ts.net");
  A wildcard domain (e.g. "*.node.ts.net"); A bring-your-own Funnel domain…»
- <https://github.com/tailscale/tailscale/issues/7081> — FR aperta dal 2023-01-27; utenti riportano
  `500 Internal Server Error: invalid domain "abc.device.random.ts.net"; must be one of
  ["device.random.ts.net"]`
- <https://tailscale.com/kb/1153/enabling-https> — i cert sono per `machine-name.tailnet.ts.net`;
  «You cannot obtain an HTTPS URL to go to a bare hostname»

**Sfumatura importante — la wildcard esiste, ma è gated e non documentata.** Il codice rilasciato
(già in v1.98.10 e v1.102.3) accetta `*.<machine>.<tailnet>.ts.net`, ma solo se il nodo ha la
capability `dns-subdomain-resolve`:

```go
if base, ok := strings.CutPrefix(domain, "*."); ok {
    if !nm.AllCaps.Contains(tailcfg.NodeAttrDNSSubdomainResolve) {
        return "", fmt.Errorf("wildcard certificates are not enabled for this node")
    }
    ...
}
```

Definizione della capability (`tailcfg/tailcfg.go` v1.102.3, riga 2768):

```go
// NodeAttrDNSSubdomainResolve, when set on Self or a Peer node, indicates
// that the subdomains of that node's MagicDNS name should resolve to the
// same IP addresses as the node itself.
// For example, if node "myserver.tailnet.ts.net" has this capability,
// then "anything.myserver.tailnet.ts.net" will resolve to myserver's IPs.
NodeAttrDNSSubdomainResolve NodeCapability = "dns-subdomain-resolve"
```

Il changelog Tailscale non ne parla (l'unica voce cert del 2026 è v1.102.1, 3 ago 2026: auto-renew
proattivo su server idle) e `kb/1153` non la menziona. È una feature abilitata lato control plane,
non dal client: **non assumerla disponibile su questo tailnet**. Verifica live in B1/B2.

Conseguenza documentale: `docker/nextcloud/README.md:85` va corretto. Le due strade sono
(a) usare lo stesso `<machine>.taile39e4f.ts.net` — ma vedi A3, collide in NPM;
(b) chiedere la wildcard `*.<machine>.taile39e4f.ts.net`, che richiede prima di accertare la
capability. La wildcard, se disponibile, passa per **dns-01** e non tls-alpn-01
(`acme_cert.go:254`: «acme: using dns-01: tls-alpn-01 does not support wildcard certificates»).

### A2. Derivazione del nome MagicDNS, e il caso `DH4300PLUS-3562` → `dh4300plus-fix`

Il nome DNS di un nodo è `<machine-name>.<tailnet-name>.ts.net`, dove `machine-name` è derivato
dall'hostname del sistema operativo con normalizzazione, oppure impostato a mano.

Regole documentate (<https://tailscale.com/kb/1098/machine-names>):

- «OS hostnames can also have characters that we don't allow in machine names, so we derive the
  names following a number of rules that aim to produce sensible results.» Le regole esatte **non
  sono pubblicate**: «As corner cases in these rules are found, they will change, so they are not
  listed here.» Esempi ufficiali: `John's-iPhone-6S.local` → `johns-iphone-6s`;
  `🎊 free form 🎊` → `free-form`. Quindi: minuscole, rimozione caratteri non validi, `.` e spazi
  collassati in `-`.
- Deduplica: in caso di conflitto «the new machine will get a name like `<hostname>-1`», e
  «if the conflicting machine's name is later changed, this machine will still maintain the
  `<hostname>-1` machine name». **Il suffisso di deduplica è numerico.**
- Rinomina: «editing the machine name also edits the MagicDNS domain name». La rinomina manuale
  richiede di togliere la spunta «Auto-generate from OS hostname», che da quel momento impedisce
  aggiornamenti automatici dall'hostname OS.

Applicato al caso concreto. `docker/tailscale/docker-compose.yaml` imposta
`hostname: DH4300PLUS-3562`; l'immagine `tailscale/tailscale` senza `TS_HOSTNAME` lascia che
tailscaled usi l'hostname OS del container. La normalizzazione di `DH4300PLUS-3562` produce
**`dh4300plus-3562`**, non `dh4300plus-fix`.

Quindi `dh4300plus-fix` **non è spiegabile né da normalizzazione né da deduplica** (che sarebbe
`-1`, `-2`, …). Restano due ipotesi, entrambe compatibili con la documentazione:

1. **Rinomina manuale** in admin console con auto-generate disattivato — il nodo è uno solo, il
   nome DNS resta `dh4300plus-fix` a prescindere dall'hostname del container.
2. **Due nodi distinti**: un nodo storico registrato quando l'hostname era `dh4300plus-fix`, più
   un nodo nuovo `dh4300plus-3562` nato dopo il cambio di hostname. Plausibile perché
   `TS_EXTRA_ARGS` contiene `--reset`, e perché lo state dir è persistente
   (`/volume1/docker/tailscale:/var/lib/tailscale`): se lo state è sopravvissuto, è il nodo
   originale; se è stato perso o riautenticato con authkey diverso, ne nasce un secondo.

**La documentazione non basta a scegliere.** Discriminante: `CertDomains` e `Self.DNSName` del nodo
vivo, più la presenza di un peer omonimo nella status. → B1.

Nota di lessico utile per la checklist (`ipn/ipnstate/ipnstate.go` v1.102.3):
`Self.HostName` è «HostInfo's Hostname (**not a DNS name** or necessarily unique)»,
`Self.DNSName` è «the Peer's FQDN … of the form "host.<MagicDNSSuffix>."» (con punto finale),
`CertDomains` è «the set of DNS names for which the control plane server will assist with
provisioning TLS certificates … FQDNs without trailing periods». Sono tre campi diversi: nel
confronto hostname↔DNS name **l'unico che conta per il certificato è `CertDomains`**.

### A3. Un cert, N proxy host: supportato dal DB, ma **N proxy host sullo stesso nome non esistono**

Vanno separate due domande che la mappa fonde in una.

**(a) Riusare lo stesso certificato su più proxy host: sì, supportato e normale.** In NPM
`certificate_id` è una semplice chiave esterna sul proxy host, e il template nginx la interpola nel
percorso del file. Nessuna unicità, nessun controllo che il SAN del cert copra i `domain_names`.

`backend/templates/_certificates.conf`:

```
{% else %}
  # Custom SSL
  ssl_certificate /data/custom_ssl/npm-{{ certificate_id }}/fullchain.pem;
  ssl_certificate_key /data/custom_ssl/npm-{{ certificate_id }}/privkey.pem;
{% endif %}
```

`backend/templates/_listen.conf` genera un `server {}` per proxy host, con
`server_name {{ domain_names | join: " " }}`. Due server block possono puntare allo stesso
`npm-<id>`: è ordinaria condivisione di certificato via nginx, e conferma il layout su disco che
R1 stabilisce (`/data/custom_ssl/npm-<certificate_id>/{fullchain,privkey}.pem`; i cert Let's
Encrypt gestiti da NPM stanno invece in `/etc/letsencrypt/live/npm-<id>/`).

**(b) Ma il presupposto della mappa — «Vaultwarden, Home Assistant e Nextcloud puntano tutti allo
stesso nome macchina» — è incompatibile con NPM.** NPM rifiuta un secondo host con un nome di
dominio già usato, su qualunque tipo di host (proxy, redirection, dead, stream):

`backend/internal/proxy-host.js` (create e update):

```js
domain_name_check_promises.push(internalHost.isHostnameTaken(domain_name));
...
if (result.is_taken) {
    throw new errs.ValidationError(`${result.hostname} is already in use`);
}
```

Quindi, con un solo nome macchina e un solo certificato:

- **un solo proxy host** può esistere per `dh4300plus-fix.taile39e4f.ts.net`;
- gli altri servizi vanno distinti per **path** (`location` aggiuntive dentro lo stesso proxy host,
  o Custom Locations nella UI) — non per host virtuale;
- distinguerli per **porta** non funziona con i proxy host di NPM: `_listen.conf` è cablato su
  `listen 80` / `listen 443 ssl`, senza porta configurabile per host. La porta 44075 del compose è
  solo la pubblicazione Docker `44075:443`, un unico listener TLS.

Perciò le due righe dei README sono entrambe rotte, per motivi diversi:

- `docker/home-assistant/README.md:62` propone `<hostname>.taile39e4f.ts.net`, lo **stesso** nome
  di Vaultwarden → NPM risponde `… is already in use`.
- `docker/nextcloud/README.md:85` propone `nextcloud.<hostname>.taile39e4f.ts.net` → nome non
  coperto da `CertDomains` (A1), e senza `dns-subdomain-resolve` non risolve nemmeno in MagicDNS.

Fonti:
- <https://github.com/NginxProxyManager/nginx-proxy-manager/blob/develop/backend/templates/_certificates.conf>
- <https://github.com/NginxProxyManager/nginx-proxy-manager/blob/develop/backend/templates/_listen.conf>
- <https://github.com/NginxProxyManager/nginx-proxy-manager/blob/develop/backend/internal/proxy-host.js>
- <https://github.com/NginxProxyManager/nginx-proxy-manager/blob/develop/backend/internal/host.js>
  (`isHostnameTaken`)
- <https://github.com/NginxProxyManager/nginx-proxy-manager/blob/develop/backend/lib/config.js> —
  DB SQLite di default `/data/database.sqlite`

### A4 (collaterale, emerso strada facendo). Il percorso `/tmp/certs/` nei README è sospetto

`docker/vaultwarden/README.md:93-94` copia da `tailscale:/tmp/certs/<domain>.crt`. Ma il default
della CLI è **relativo alla cwd**, non `/tmp/certs`:

`cmd/tailscale/cli/cert.go` (v1.102.3):

```go
fs.StringVar(&certArgs.certFile, "cert-file", "", "output cert file or \"-\" for stdout; defaults to DOMAIN.crt if --cert-file and --key-file are both unset")
...
if certArgs.certFile == "" && certArgs.keyFile == "" {
    fileBase := strings.Replace(domain, "*.", "wildcard_.", 1)
    certArgs.certFile = fileBase + ".crt"
    certArgs.keyFile = fileBase + ".key"
}
```

Lo stage finale del `Dockerfile` di `tailscale/tailscale` (`FROM alpine:3.22`) **non imposta
WORKDIR**, quindi la cwd di `docker exec` è `/`: senza flag i file finiscono in
`/<domain>.crt` e `/<domain>.key` dentro il container. Separata è la cache interna di tailscaled,
in `$TailscaleVarRoot/certs` (`feature/acme/certstore.go`, `certDir`) → qui
`/var/lib/tailscale/certs`, cioè `/volume1/docker/tailscale/certs` sull'host.

Impatto pratico: quando si scriverà il playbook, **passare `--cert-file` / `--key-file` espliciti**
invece di affidarsi al default. Da confermare live: B6.

Fonti:
- <https://github.com/tailscale/tailscale/blob/v1.102.3/cmd/tailscale/cli/cert.go>
- <https://github.com/tailscale/tailscale/blob/v1.102.3/Dockerfile>
- <https://github.com/tailscale/tailscale/blob/v1.102.3/feature/acme/certstore.go>

---

## Gruppo B — richiede accesso live

Nessuna di queste risposte è stata indovinata: sotto c'è solo la checklist per raccoglierle.

**Tutti i comandi sono di sola lettura.** Nessuno scrive, riavvia o modifica. Due avvertenze:

> **Non lanciare `docker exec tailscale tailscale cert <dominio>`** durante la ricognizione: è
> un'operazione di scrittura (tocca la cache cert e può innescare un ordine ACME). Per sapere quali
> domini sono validi basta B1, che non emette nulla.

> `/volume1` è root-owned. La checklist evita `sudo` dove può, leggendo dall'interno dei container
> (`docker exec … ls/grep/openssl`). I due comandi che richiedono `sudo` sono segnalati.

Apri una sessione interattiva e incolla a blocchi:

```bash
ssh nicholasizzo@192.168.0.36
```

### B1 — Identità Tailscale reale del nodo (domande 6, e discriminante per A2)

```bash
docker exec tailscale tailscale status --json | jq '{
  HostName:        .Self.HostName,
  DNSName:         .Self.DNSName,
  NodeID:          .Self.ID,
  Online:          .Self.Online,
  MagicDNSSuffix:  .CurrentTailnet.MagicDNSSuffix,
  TailnetName:     .CurrentTailnet.Name,
  CertDomains:     .CertDomains,
  BackendState:    .BackendState
}'
```

Cosa guardare:
- **`CertDomains`** è la risposta autorevole: è l'**unica** lista di nomi per cui
  `tailscale cert` accetterà di emettere. Se contiene `dh4300plus-fix.taile39e4f.ts.net`, il repo è
  allineato. Se contiene `dh4300plus-3562.taile39e4f.ts.net`, **il cert oggi in NPM è per un nome
  che questo nodo non può più rinnovare** — e l'automazione va scritta sul nome nuovo.
- **`HostName` vs `DNSName`**: `HostName` sarà `DH4300PLUS-3562` (l'hostname del container);
  `DNSName` è il nome MagicDNS effettivo. Se `DNSName` è `dh4300plus-fix.taile39e4f.ts.net.` con
  `HostName` `DH4300PLUS-3562`, allora **ipotesi 1 di A2**: nodo unico, rinominato a mano, nessun
  doppione. Perché conta: decide se il playbook deriva il nome dall'hostname (no) o lo tratta come
  costante di configurazione (sì).
- `MagicDNSSuffix` deve essere `taile39e4f.ts.net`. Se diverge, ogni riferimento nel repo è stale.

Doppioni nel tailnet (ipotesi 2 di A2):

```bash
docker exec tailscale tailscale status | grep -i 'dh4300\|3562\|fix'
```

Cosa guardare: un nodo con nome simile che compare **come peer** significa due nodi registrati. Se
compare solo la riga `Self` (la prima, senza indentazione da peer), il nodo è uno.

Conferma incrociata a costo zero, senza emettere nulla — `tailscale cert` **senza argomenti** è un
errore d'uso che stampa i domini validi:

```bash
docker exec tailscale tailscale cert
```

Cosa guardare: la riga `For domain, use "…"` (o `Valid domain options: […]`). Deve coincidere con
`CertDomains` di sopra. Se dice `HTTPS cert support is not enabled/configured for your tailnet`,
l'intera mappa poggia su un presupposto falso e va fermata lì.

### B2 — Certificato realmente servito e sua scadenza (domanda 6)

Interroga il listener TLS di NPM così come lo vede un client, dall'interno del container che ha
openssl:

```bash
docker exec nginx-proxy-manager sh -c \
  'echo | openssl s_client -connect 127.0.0.1:443 -servername dh4300plus-fix.taile39e4f.ts.net 2>/dev/null \
   | openssl x509 -noout -subject -issuer -dates -ext subjectAltName'
```

(sostituisci `-servername` con il valore vero uscito da B1, se diverso)

Cosa guardare:
- **`notAfter`** — la scadenza vera. `docs/homelab-hub-design.md:21` afferma
  `notAfter=Nov 5 11:23:47 2026 GMT`: questo comando dice se è ancora così o se qualcuno ha già
  rinnovato a mano. È il dato che fissa la finestra del primo rinnovo reale su cui la mappa basa
  tutto il piano di test.
- **`subjectAltName`** — deve contenere **un solo** DNS, il nome macchina. Se contenesse una
  wildcard `*.…`, allora la capability `dns-subdomain-resolve` di A1 è attiva su questo tailnet e
  lo scenario multi-sottodominio si riapre.
- **`issuer`** — atteso Let's Encrypt (`docs/homelab-hub-design.md` cita la CA intermedia `YE1`).
  Un issuer diverso significa che il cert servito non è quello di Tailscale.
- `subject` (CN) — confronta col `CertDomains` di B1: divergenza = il rinnovo automatico
  produrrebbe un cert per un nome diverso da quello servito oggi.

### B3 — Proxy host reali e certificati associati (domande 4 e 5)

La verità operativa non è il DB ma i file di configurazione che nginx carica davvero:

```bash
docker exec nginx-proxy-manager sh -c \
  'grep -H -E "server_name|ssl_certificate |set \$server|set \$port" /data/nginx/proxy_host/*.conf'
```

Cosa guardare, riga per riga:
- **`server_name`** — l'elenco completo dei nomi effettivamente serviti. Risponde alla domanda 4 e,
  di riflesso, alla 5: se esistono `server_name` per Home Assistant o Nextcloud, i README non sono
  aspirazionali; se c'è un solo `server_name` (quello di Vaultwarden), lo sono.
- **`ssl_certificate /data/custom_ssl/npm-<N>/fullchain.pem`** — il `<N>` è il `certificate_id`.
  Più proxy host che citano lo **stesso** `<N>` confermano il perimetro «un cert, N host» della
  mappa; `<N>` diversi lo smentiscono. Un percorso sotto `/etc/letsencrypt/live/` invece che
  `/data/custom_ssl/` significherebbe cert gestito da NPM, non custom.
- **`set $server` / `set $port`** — l'upstream. Incrocia con B4: se un proxy host punta alla porta
  di Home Assistant, HA è davvero dietro NPM.

Se la directory è vuota o assente, non ci sono proxy host attivi — dato di per sé conclusivo.

Elenco dei file di configurazione presenti (anche disabilitati):

```bash
docker exec nginx-proxy-manager sh -c 'ls -la /data/nginx/proxy_host/ /data/nginx/redirection_host/ /data/nginx/dead_host/ 2>&1'
```

Cosa guardare: NPM scrive `<id>.conf` per gli host abilitati e `<id>.conf.disabled` (o nulla) per i
disabilitati; un file `.disabled` è un host che esiste in UI ma non serve traffico.

Nomi leggibili dei certificati dal DB (opzionale, solo se `sqlite3` è presente sul NAS):

```bash
command -v sqlite3 && sudo sqlite3 -readonly \
  /volume1/docker/nginx-proxy-manager/data/database.sqlite \
  "SELECT id, provider, nice_name, domain_names, expires_on FROM certificate WHERE is_deleted=0;" \
  ".exit"
```

`sudo` (path root-owned) e `-readonly` (nessuna scrittura, nessun lock in scrittura sul DB di NPM
in esercizio). Cosa guardare: mappa `id` → `nice_name` per dare un nome agli `npm-<N>` di sopra, e
`domain_names` per vedere per quale nome il cert è stato caricato. **Se `sqlite3` non c'è, salta:
B3 e B5 rispondono già alle domande 4 e 7 senza toccare il DB.**

### B4 — Home Assistant e Nextcloud sono davvero deployati? (domanda 5)

```bash
docker ps -a --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}' | sort
```

Cosa guardare: presenza (e stato `Up`) di container Home Assistant e Nextcloud, e le porte
pubblicate. Un container assente chiude la domanda: README aspirazionale. Un container `Up` ma
nessun `server_name` corrispondente in B3 significa servizio deployato ma **non** dietro NPM —
raggiungibile solo per IP:porta in LAN/Tailscale.

```bash
sudo ls -la /volume1/docker/
```

`sudo` (path root-owned), chiederà la password. Cosa guardare: quali stack esistono davvero su
disco rispetto ai 32 presenti in `docker/` in questo repo. La differenza tra le due liste è la
misura di quanto il repo diverge dalla realtà — il cuore di questo ticket.

### B5 — Layout su disco dei certificati custom (domanda 7)

```bash
docker exec nginx-proxy-manager sh -c 'ls -lR /data/custom_ssl/ 2>&1; echo "--- letsencrypt ---"; ls -l /etc/letsencrypt/live/ 2>&1'
```

Cosa guardare: conferma (o smentita) di quanto R1 ricava dalla documentazione, cioè una directory
per certificato `npm-<id>/` contenente esattamente **`fullchain.pem`** e **`privkey.pem`**. Sono i
due file che il playbook dovrà sostituire: nomi e percorso vanno visti, non dedotti. Attenzione a
eventuali file extra o link simbolici, che cambierebbero la strategia di sostituzione atomica.

Contenuto reale dei PEM presenti (scadenze di tutti i cert custom, non solo di quello servito):

```bash
docker exec nginx-proxy-manager sh -c \
  'for d in /data/custom_ssl/npm-*; do echo "== $d"; openssl x509 -in "$d/fullchain.pem" -noout -subject -dates -ext subjectAltName 2>&1; echo; done'
```

Cosa guardare: quanti certificati custom esistono, se sono duplicati dello stesso nome (residui di
rinnovi manuali precedenti) e se `fullchain.pem` contiene davvero **due** blocchi (leaf +
intermediate). Verifica del numero di blocchi:

```bash
docker exec nginx-proxy-manager sh -c 'grep -c "BEGIN CERTIFICATE" /data/custom_ssl/npm-*/fullchain.pem'
```

Cosa guardare: atteso `2`. Se fosse `1`, la catena servita è incompleta e lo «split» descritto nei
README (leaf e intermediate separati, poi ricomposti da NPM) non ha prodotto la fullchain attesa —
cambia il passo di trasformazione che G2 dovrà automatizzare.

### B6 — Dove `tailscale cert` scrive davvero, in questo container (domanda 7, e verifica di A4)

```bash
docker exec tailscale sh -c 'pwd; ls -la / | grep -i "ts.net\|certs"; echo "--- /tmp ---"; ls -la /tmp 2>&1; echo "--- state dir ---"; ls -la /var/lib/tailscale/ /var/lib/tailscale/certs 2>&1'
```

Cosa guardare:
- `pwd` — la cwd di `docker exec`. Attesa `/` (nessun WORKDIR nell'immagine, vedi A4). Se è `/`,
  i file `.crt`/`.key` prodotti senza flag finiscono in `/`, **non** in `/tmp/certs/` come dice
  `docker/vaultwarden/README.md:93`.
- residui `*.ts.net.crt` / `*.ts.net.key` in `/` o `/tmp/certs` — dicono dove è finita l'ultima
  emissione manuale, e quindi qual è il percorso che il README ha cristallizzato (correttamente o
  no).
- `/var/lib/tailscale/certs/` — la cache interna di tailscaled (montata da
  `/volume1/docker/tailscale`). I file qui sono quelli che il rinnovo aggiorna: se ci sono
  `<domain>.crt` e `<domain>.key`, conferma il `certDir` di A4 e dà a G2 una sorgente stabile
  alternativa al redirect della CLI.

```bash
docker exec tailscale tailscale version
```

Cosa guardare: il digest pinnato nel compose non dice la versione. Serve per sapere se il client è
≥ v1.98 (soglia in cui la wildcard di A1 esiste nel codice) e per decidere se `--min-validity`
(flag usato dal rinnovo idempotente) è disponibile.

---

## Implicazioni per la mappa

1. **Il presupposto di perimetro va riscritto.** La mappa dice «un cert Tailscale che alimenta N
   proxy host NPM … Vaultwarden, Home Assistant e Nextcloud puntano tutti allo stesso nome
   macchina». Le due metà sono in contraddizione (A3): NPM rifiuta due host con lo stesso
   `domain_name`. Se B3 mostra un solo proxy host, il perimetro reale è **un cert, un proxy host**,
   e G1/G2/G3 si semplificano: nessuna orchestrazione multi-host, un solo `certificate_id` da
   toccare. La sostanza della mappa regge, ma la frase va corretta per non far progettare a G2 un
   fan-out che non esiste.

2. **Due righe di README sono da correggere, e la correzione non è cosmetica.**
   `docker/nextcloud/README.md:85` chiede un cert impossibile (A1);
   `docker/home-assistant/README.md:62` chiede un proxy host che NPM rifiuta (A3). La voce «Not yet
   specified → Aggiornamento della documentazione» della mappa oggi le tratta come procedure
   manuali obsolete da sostituire con l'automazione: in realtà **descrivono passi che non
   funzionano**. È una correzione, non un aggiornamento.

3. **La generalizzazione agli altri proxy host potrebbe non essere una scelta.** La mappa lascia
   aperta «Generalizzazione agli altri proxy host (Home Assistant, Nextcloud) una volta noto se
   sono davvero deployati dietro NPM». A3 dice che, con un nome macchina e senza la capability
   wildcard, l'unica strada per esporli via NPM sono le **Custom Locations** sotto l'unico proxy
   host esistente — e quelle **non aggiungono certificati**, quindi non toccano affatto
   l'automazione del rinnovo. Se B1/B2 escludono la wildcard, quella voce si può chiudere
   dichiarando che non esiste generalizzazione da fare.

4. **Un nuovo rischio da graduare: il nome del certificato potrebbe già essere sbagliato.** A2
   lascia aperta l'ipotesi che `dh4300plus-fix` non sia più il nome MagicDNS del nodo. Se B1
   restituisce `CertDomains = ["dh4300plus-3562.taile39e4f.ts.net"]`, allora l'automazione
   scritta sul nome del repo emetterebbe un cert per un nome che nessuno serve, e Vaultwarden
   resterebbe sul cert vecchio fino alla scadenza — fallimento silenzioso, la modalità peggiore su
   un password manager. Vale un ticket `task` HITL bloccante prima di G2, non una nota.

5. **Il playbook non deve affidarsi al percorso di output di default.** A4 mostra che senza
   `--cert-file`/`--key-file` i file finiscono nella cwd del container (`/`), mentre i README dicono
   `/tmp/certs/`. G2 deve passare percorsi espliciti; l'alternativa più solida è leggere la cache
   `/var/lib/tailscale/certs/`, già visibile sull'host in `/volume1/docker/tailscale/certs/` senza
   `docker cp`. Da confermare in B6.

6. **Il vincolo sul test della mappa non cambia.** Nulla in A1-A4 tocca la semantica di rinnovo:
   `tailscale cert` resta uno snapshot e fuori finestra restituisce il cert in cache. La scadenza
   di novembre 2026 va però **riverificata in B2** e non presa da `docs/homelab-hub-design.md`, che
   è un documento e non una misura.
