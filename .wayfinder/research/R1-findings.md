---
labels: [wayfinder:research]
ticket: R1
status: complete
---

# R1 — Dove NPM conserva i certificati custom

## Versione a cui si riferiscono questi risultati

Il digest pinnato in `docker/nginx-proxy-manager/docker-compose.yaml:4`
(`sha256:52b2c5999...58bb`) è stato risolto sul registry Docker Hub. La config image contiene:

```
NPM_BUILD_VERSION=2.15.1
NPM_BUILD_COMMIT=76f09db6
NPM_BUILD_DATE=2026-06-03 04:29:14 UTC
OPENRESTY_VERSION=1.29.2.5
```

Fonte: `GET registry-1.docker.io/v2/jc21/nginx-proxy-manager/blobs/sha256:bd94715ff0d6…`, via
il manifest arm64 `sha256:a36f72b9b4a4…` dell'index `sha256:52b2c599…`.

**Quindi il commento nel compose — "Digest pin (no version label upstream)" — è sbagliato:
la versione è ricavabile, è la v2.15.1.** Vale la pena correggerlo.

Tutte le citazioni sotto sono al tag `v2.15.1`, il cui commit è `76f09db6` — **lo stesso
`NPM_BUILD_COMMIT` dell'immagine in esecuzione**. Il sorgente letto è quindi esattamente quello
che ha costruito il container in produzione, non una versione vicina.

> Attenzione a non leggere il branch `develop`: lì `backend/package.json` dichiara `2.0.0`, che è
> una riscrittura non rilasciata. Non è ciò che gira sul NAS.

Repo: <https://github.com/NginxProxyManager/nginx-proxy-manager> (l'org `jc21` redirige qui).

---

## 1. Storage — è un **ibrido**, e i due lati non sono simmetrici

Un **cert splittato** caricato come "Custom Certificate" finisce in **due posti**:

**(a) File PEM su disco**, sotto il volume `/data`:

```
/data/custom_ssl/npm-<id>/fullchain.pem
/data/custom_ssl/npm-<id>/privkey.pem
```

dove `<id>` è l'`id` numerico della riga nella tabella `certificate`.

- `backend/internal/certificate.js:490` — `const dir = "/data/custom_ssl/npm-" + certificate.id;`
- `backend/internal/certificate.js:512` e `:521` — le due `fs.writeFile`.
- La directory è creata da `backend/internal/certificate.js:503-506` (`fs.mkdirSync(dir)`,
  **non** ricorsiva, senza `mode`); il parent `/data/custom_ssl` è creato all'avvio del container
  da `docker/rootfs/etc/s6-overlay/s6-rc.d/prepare/20-paths.sh:18-20`.

Che siano proprio questi i file serviti da nginx è confermato dai template:

- `backend/templates/_certificates.conf:11-12` →
  `ssl_certificate /data/custom_ssl/npm-{{ certificate_id }}/fullchain.pem;`
  `ssl_certificate_key /data/custom_ssl/npm-{{ certificate_id }}/privkey.pem;`
- `backend/templates/_certificates_stream.conf:10-11` — idem per gli stream.

Da notare il ramo `{% if certificate.provider == "letsencrypt" %}` alla riga 2 dello stesso
template: i cert Let's Encrypt vanno invece in `/etc/letsencrypt/live/npm-<id>/`. I due percorsi
sono disgiunti, e `writeCustomCert` **rifiuta esplicitamente** di scrivere un cert letsencrypt
(`certificate.js:493-496`).

**Composizione di `fullchain.pem`** — rilevante per il vocabolario "cert splittato":

```js
// backend/internal/certificate.js:498-501
let certData = certificate.meta.certificate;
if (typeof certificate.meta.intermediate_certificate !== "undefined") {
    certData = `${certData}\n${certificate.meta.intermediate_certificate}`;
}
```

Cioè: NPM riceve leaf e intermediate **separati** e li concatena lui, con un singolo `\n`, in
`fullchain.pem`. Non accetta un fullchain già concatenato nel campo `certificate` come modo
previsto (funzionerebbe, ma `intermediate_certificate` resterebbe vuoto).

**(b) Riga nel DB SQLite**, tabella `certificate`:

```js
// backend/migrations/20180618015850_initial.js:150-161
knex.schema.createTable("certificate", (table) => {
    table.increments().primary();          // id
    table.dateTime("created_on").notNull();
    table.dateTime("modified_on").notNull();
    table.integer("owner_user_id").notNull().unsigned();
    table.integer("is_deleted").notNull().unsigned().defaultTo(0);
    table.string("provider").notNull();     // "other" per i custom
    table.string("nice_name").notNull().defaultTo("");
    table.json("domain_names").notNull();
    table.dateTime("expires_on").notNull();
    table.json("meta").notNull();           // <-- i PEM stanno qui dentro
});
```

Il DB è `/data/database.sqlite` per default (`backend/lib/config.js:89`, override
`DB_SQLITE_FILE`) — quindi **anche il DB vive nel volume `/data`**, cioè in
`/volume1/docker/nginx-proxy-manager/data/database.sqlite`.

Dentro la colonna JSON `meta` finiscono i PEM **in chiaro come stringhe**, sotto le chiavi
elencate in `backend/internal/certificate.js:32`:

```js
allowedSslFiles: ["certificate", "certificate_key", "intermediate_certificate"],
```

scritte da `backend/internal/certificate.js:608-612`.

### Il punto non ovvio: la copia nel DB è di fatto *write-only*

Ho cercato tutti i punti in cui quei blob vengono **riletti**:

```
$ grep -rn "meta\.certificate\b|meta\.certificate_key" backend/
backend/internal/certificate.js:498   → dentro writeCustomCert
backend/internal/certificate.js:521   → dentro writeCustomCert
```

Due sole occorrenze, entrambe dentro `writeCustomCert`. E `writeCustomCert` ha **un solo
chiamante in tutto il sorgente**:

```
$ grep -rn "writeCustomCert" --include=*.js .
backend/internal/certificate.js:487   → la definizione
backend/internal/certificate.js:622   → dentro upload()
```

Inoltre `cleanMeta` (`certificate.js`, funzione omonima) sostituisce quei blob con `true` prima
di restituirli via API o di scriverli nell'audit log — quindi non escono mai dal DB per altre vie.

**Conseguenza**: il DB conserva i PEM, ma nessun percorso di codice li rilegge per rigenerare i
file su disco. La copia nel DB serve solo a ri-scriverli quando si ri-esegue una `upload`.

---

## 2. Sostituibilità a caldo — **sì, sovrascrivere in place funziona e non viene disfatto**

Domanda del ticket: "NPM rigenera la configurazione da database e sovrascriverebbe la modifica
alla prima occasione?" **No**, e questo è stabilito da tre fatti indipendenti:

1. **Nessun rigeneratore.** `writeCustomCert` è chiamato solo da `upload()` (grep sopra). Non
   esiste alcun percorso avvio-container → riscrittura dei PEM custom.
2. **Il setup all'avvio non li tocca.** `backend/setup.js` ricostruisce dal DB solo le credenziali
   DNS di Certbot (`setup.js:101-125`, scrive `/etc/letsencrypt/credentials/credentials-<id>`).
   Nessun riferimento a `custom_ssl`.
3. **La rigenerazione della config nginx non tocca i cert.** `internalNginx.configure`
   (`backend/internal/nginx.js:27-99`) rigenera solo il `.conf` dell'host sotto
   `/data/nginx/<tipo>/<id>.conf` (`nginx.js:124-129`). Quel `.conf` include il template
   `_certificates.conf`, che **cita il path** dei PEM ma non ne scrive il contenuto.

Non c'è nemmeno un file watcher: `grep -rn "fs.watch|chokidar|inotify" backend/ docker/` non dà
occorrenze nel codice (chokidar compare solo in `yarn.lock` come dipendenza transitiva di
nodemon, cioè dev).

Da notare anche che la cancellazione di un certificato dalla UI è un **soft delete**
(`certificate.js:396-423`: `patch({ is_deleted: 1 })`) e **non rimuove** la directory
`/data/custom_ssl/npm-<id>`. I file restano orfani sul disco.

> **Ma attenzione — sovrascrivere i file NON basta perché nginx serva il cert nuovo.** nginx
> carica i certificati in memoria al load della configurazione; un file cambiato sotto i piedi non
> ha effetto finché non c'è un reload. Vedi il punto 3.

---

## 3. Reload — ed è qui che c'è la sorpresa

### Come nginx viene ricaricato da NPM

```js
// backend/internal/nginx.js:104-117
test: () => utils.execFile("/usr/sbin/nginx", ["-t", "-g", "error_log off;"]),

reload: () => internalNginx.test().then(() => {
    logger.info("Reloading Nginx");
    return utils.execFile("/usr/sbin/nginx", ["-s", "reload"]);
}),
```

Cioè: `nginx -t` e, **solo se passa**, `nginx -s reload`. Un `SIGHUP` classico, senza restart del
container e senza droppare connessioni.

### La sorpresa: `POST /upload` **non ricarica nginx**

Ho letto l'intero flusso di `upload()` (`backend/internal/certificate.js:597-624`):

```js
upload: async (access, data) => {
    const row = await internalCertificate.get(access, { id: data.id });
    if (row.provider !== "other") { throw new error.ValidationError(...); }
    const validations = await internalCertificate.validate(data);
    if (typeof validations.certificate === "undefined") { throw ... }
    _.map(data.files, (file, name) => {
        if (internalCertificate.allowedSslFiles.indexOf(name) !== -1) {
            row.meta[name] = file.data.toString();
        }
    });
    const certificate = await internalCertificate.update(access, {
        id: data.id,
        expires_on: moment(validations.certificate.dates.to, "X").format("YYYY-MM-DD HH:mm:ss"),
        domain_names: validations.certificate.cn ? [validations.certificate.cn] : [],
        meta: _.clone(row.meta),
    });
    certificate.meta = row.meta;
    await internalCertificate.writeCustomCert(certificate);
    return _.pick(row.meta, internalCertificate.allowedSslFiles);
},
```

Non c'è nessun `internalNginx.reload()`. E `internalCertificate.update()` (letto per intero) fa
solo `patchAndFetchById` + audit log — nessuna operazione nginx. Il route handler
(`backend/routes/nginx/certificates.js:278-294`) chiama `upload()` e basta.

Il motivo per cui nella UI "funziona lo stesso" è che il flusso della UI **crea sempre un cert
nuovo**: `frontend/src/modals/CustomCertificateModal.tsx:38-46` fa `validateCertificate` →
`createCertificate` → `uploadCertificate(cert.id, …)`. Il reload arriva **dopo**, quando si
associa il cert a un proxy host e si salva l'host — è quel salvataggio a chiamare
`internalNginx.configure` → `reload()`. La UI non ha proprio un flusso "sostituisci il cert di una
entry esistente".

**Per l'automazione questo è il fatto operativo centrale: qualunque sia la strada scelta (file o
API), il reload va innescato esplicitamente. Nessuno lo fa per noi.**

### Non esiste un endpoint API "reload nginx"

Ho enumerato tutti i metodi HTTP registrati su `/nginx/certificates`
(`backend/routes/nginx/certificates.js`):

| Route | Metodi |
|---|---|
| `/` | GET, POST |
| `/dns-providers` | GET |
| `/test-http` | POST |
| `/validate` | POST |
| `/:certificate_id` | GET, **DELETE** |
| `/:certificate_id/upload` | **POST** |
| `/:certificate_id/renew` | POST |
| `/:certificate_id/download` | GET |

Nessun endpoint di reload, e — vedi punto 4 — **nessun PUT**. `renew` è solo per Let's Encrypt, e
`download` pure: `internalCertificate.download` termina con
`throw new error.ValidationError("Only Let'sEncrypt certificates can be downloaded")` per ogni
provider diverso da `letsencrypt`.

Quindi il modo di ricaricare senza riavviare il container è **eseguire il comando dentro il
container**:

```
docker exec nginx-proxy-manager /usr/sbin/nginx -t && \
docker exec nginx-proxy-manager /usr/sbin/nginx -s reload
```

che è letteralmente ciò che NPM fa a sé stesso (`nginx.js:106` e `:115`). Non è un'API documentata,
ma non è nemmeno un hack: è la stessa coppia di invocazioni del prodotto.

**NON STABILITO**: non ho trovato in nessuna pagina della documentazione ufficiale
(`nginxproxymanager.com`, e `docs/src/**` nel repo) una riga che *raccomandi* o *supporti*
formalmente il reload esterno. Il fatto è stabilito dal sorgente, non da una promessa di
compatibilità. Va messo in conto che un aggiornamento maggiore possa cambiarlo — motivo in più per
tenere il pin a digest.

### L'API è documentata?

Sì, ma non sul sito. Lo schema OpenAPI è **servito dall'istanza stessa** su `GET /api/schema`
(`backend/routes/schema.js:21-40`, montato in `backend/routes/main.js:49`), e
`backend/schema/swagger.json` si autodescrive:

> `"title": "Nginx Proxy Manager API"` — `"This is the official API documentation for Nginx Proxy
> Manager. Most endpoints require authentication via Bearer Token (JWT). You can generate a token
> by logging in via the POST /tokens endpoint."`

L'endpoint di upload ha il suo file di schema dedicato,
`backend/schema/paths/nginx/certificates/certID/upload/post.json`:
`operationId: "uploadCertificate"`, `summary: "Uploads a custom Certificate"`, security
`bearerAuth: ["certificates.manage"]`, body multipart con i tre campi `certificate`,
`certificate_key`, `intermediate_certificate`.

Quindi: **documentato e ufficiale, ma solo in-band** (`https://<npm>/api/schema`). Le pagine su
`nginxproxymanager.com/guide/` e `/advanced-config/` non menzionano affatto l'API — verificato
fetchandole.

---

## 4. Identità della entry — **l'`id` numerico, e non c'è PUT**

- La chiave stabile è **`certificate.id`**, intero autoincrementale
  (`table.increments().primary()`, migration `20180618015850_initial.js:151`). È lo stesso `id`
  che compare nel path `/data/custom_ssl/npm-<id>/` e nel template nginx.
- **`nice_name` non è unico** e non ha vincolo di unicità nello schema: non è una chiave.
  `domain_names` nemmeno.
- **Non esiste `PUT /api/nginx/certificates/{id}`** — vedi la tabella dei metodi al punto 3. Il
  solo modo di rimpiazzare il contenuto di una entry esistente via API è
  **`POST /api/nginx/certificates/{id}/upload`**, che accetta un `id` già esistente e lo aggiorna
  in place (`upload()` fa `update({ id: data.id, … })`, riga 614-619).

Questo è esattamente ciò che serve per l'idempotenza: **ri-uploadare sullo stesso `id` non crea una
nuova entry**, aggiorna quella. L'`id` va scoperto una volta (`GET /api/nginx/certificates`, o
leggendo il DB) e poi **fissato come variabile del playbook** — non ri-cercato per nome a ogni run.

Due effetti collaterali di ogni `upload`, da conoscere:

- `expires_on` viene ricalcolato dal cert (riga 616).
- **`domain_names` viene sovrascritto con il solo CN** del certificato
  (riga 617: `domain_names: validations.certificate.cn ? [validations.certificate.cn] : []`).
  Per un cert Tailscale il CN è il nome macchina `*.tsnet`, stabile, quindi in pratica innocuo —
  ma è una riscrittura, non un merge. Se qualcuno avesse messo a mano più domini su quella entry,
  l'upload li perde.

`nice_name` invece è preservato (`update()` lo ripristina esplicitamente per i provider `other`).

### Cosa valida `upload`, e cosa **non** valida

`internalCertificate.validate` (`certificate.js:554-588`) fa, su file temporanei:

- sulla chiave: `openssl pkey -in <file> -check -noout`, e pretende che l'output contenga
  "key is valid" (`checkPrivateKey`, righe 632-653), con timeout di 10s per il caso di chiave
  protetta da passphrase;
- su `certificate` e `intermediate_certificate`: `openssl x509 …`, con `throwExpired = true`
  (riga 573) — **un cert scaduto viene rifiutato**.

**Ma non verifica che la chiave corrisponda al certificato.** I due controlli sono indipendenti.
Caricare un leaf e una privkey scorrelati passa la validazione, scrive i file, e fa fallire
`nginx -t` al reload successivo. È un argomento forte per far girare `nginx -t` nel playbook
*prima* di considerare l'operazione riuscita, e per tenere il backup pre-sostituzione.

---

## 5. Ownership e permessi

### Utente: di default **root**, e nel nostro compose è proprio così

```bash
# docker/rootfs/usr/bin/common.sh:12-13
PUID=${PUID:-0}
PGID=${PGID:-0}
```

Confermato dalla documentazione ufficiale
(<https://nginxproxymanager.com/advanced-config/>, sezione "Running as a non-root user"):

> "By default, the services (nginx etc) will run as `root` user inside the docker container. You
> can change this behaviour by setting the following environment variables. Not only will they run
> the services as this user/group, they will change the ownership on the `data` and `letsencrypt`
> folders at startup."

Il nostro `docker/nginx-proxy-manager/docker-compose.yaml` **non imposta né `PUID` né `PGID`** →
valgono i default 0:0. Sia il backend (`s6-overlay/s6-rc.d/backend/run:18`,
`s6-setuidgid "$PUID:$PGID"`) sia nginx (`.../nginx/run:9`) girano quindi **come root**, e i file
scritti in `/data/custom_ssl/npm-<id>/` sono **`root:root`**.

Questo si sposa bene col vincolo di `CLAUDE.md` che `/volume1` è root-owned: non c'è mismatch da
gestire, e un playbook che scrive quei file deve farlo **come root sul NAS** (o via
`docker exec`, che entra già come root).

> Nota di contorno: `docker/rootfs/etc/nginx/nginx.conf:4` dice `user npm;`. Non è in
> contraddizione — è la direttiva per i **worker**; il master resta l'utente che ha lanciato il
> processo (root, qui). Il master è ciò che conta per leggere `privkey.pem` al load.

### Il chown all'avvio è **condizionale**, e la condizione è insidiosa

```bash
# docker/rootfs/etc/s6-overlay/s6-rc.d/prepare/30-ownership.sh:25-43
chownit() {
    local dir="$1"
    local recursive="${2:-true}"
    local have
    have="$(stat -c '%u:%g' "$dir")"
    if [ "$have" != "$PUID:$PGID" ]; then
        if [ "$recursive" = 'true' ] && [ -d "$dir" ]; then
            chown -R "$PUID:$PGID" "$dir"
        ...
```

`/data` è nella lista dei `locations` (riga 12). Ma il test guarda **solo l'ownership del nodo
`/data` stesso**: se `/data` è già `0:0`, il ramo ricorsivo **non viene eseguito** e un file
interno con ownership sbagliata **resta sbagliata**, per sempre, a ogni riavvio. Non contare sul
restart del container per "raddrizzare" i permessi di un file scritto male dal playbook.

### Modo (bit di permesso): **NON STABILITO con certezza**

Questo è il punto che non riesco a chiudere da sorgente, e preferisco dirlo che indovinarlo.

```js
// backend/internal/certificate.js:512, 521 — nessun argomento `mode`
fs.writeFile(`${dir}/fullchain.pem`, certData, (err) => { … });
fs.writeFile(`${dir}/privkey.pem`, certificate.meta.certificate_key, (err) => { … });
```

`fs.writeFile` senza `mode` usa il default `0o666`, mascherato dall'`umask` del processo. E
l'`umask` **non è impostato da nessuna parte**: `grep -rn "umask" backend/ docker/` (escluso
`yarn.lock`) non dà occorrenze. Quindi il modo effettivo dipende dall'umask ereditato da s6/init,
che non è fissato nel sorgente. Con l'umask usuale `022` verrebbe `0644`, ma **è una deduzione, non
un fatto stabilito** — ed è esattamente il tipo di deduzione che il ticket chiede di non fare.

Stessa cosa per la directory: `fs.mkdirSync(dir)` (riga 505) senza `mode` → `0o777 & ~umask`.

**Il contrasto è però stabilito e vale la pena segnalarlo**: nello stesso file, le credenziali DNS
di Certbot sono scritte con modo esplicito —

```js
// backend/internal/certificate.js:833
fs.writeFileSync(credentialsLocation, certificate.meta.dns_provider_credentials, { mode: 0o600 });
```

— mentre `privkey.pem` **no**. La chiave privata TLS riceve un trattamento *meno* restrittivo delle
credenziali DNS. Se sul NAS risultasse `0644`, sarebbe world-readable per chiunque abbia accesso al
filesystem del volume.

**Da verificare sull'istanza reale**, con un comando puramente diagnostico:

```bash
ssh nicholasizzo@192.168.0.36 \
  "sudo ls -la /volume1/docker/nginx-proxy-manager/data/custom_ssl/"
# e, per la entry specifica, una volta noto l'id:
ssh nicholasizzo@192.168.0.36 \
  "sudo stat -c '%n %U:%G %a' /volume1/docker/nginx-proxy-manager/data/custom_ssl/npm-*/*.pem"
```

Il playbook dovrebbe comunque **imporre lui** il modo che vogliamo (es. `0600` su `privkey.pem`,
`0644` su `fullchain.pem`, owner `root:root`) invece di ereditare quello che capita — anche perché
il punto precedente dice che nessun riavvio lo correggerà.

---

## Riepilogo per domanda

| # | Domanda | Risposta |
|---|---|---|
| 1 | Storage | **Ibrido**: file PEM in `/data/custom_ssl/npm-<id>/{fullchain,privkey}.pem` **+** blob in chiaro nella colonna JSON `meta` della tabella `certificate` in `/data/database.sqlite`. nginx legge **solo i file**. |
| 2 | Sostituibilità a caldo | **Sì.** Nessun percorso di codice rigenera i PEM dal DB: `writeCustomCert` ha un solo chiamante (`upload`). Sovrascrivere in place non viene disfatto, né dal riavvio né dalla rigenerazione delle config. |
| 3 | Reload | `nginx -t` poi `nginx -s reload`, cioè `docker exec`. **Nessun endpoint API di reload**, e `POST /upload` **non ricarica nginx da solo** — va innescato comunque. |
| 4 | Identità | **`certificate.id` numerico.** Nessun `PUT`; l'update in place si fa con `POST /api/nginx/certificates/{id}/upload`, che è idempotente sull'id. `nice_name` non è una chiave. |
| 5 | Ownership/permessi | **`root:root`** (PUID/PGID default 0, non sovrascritti nel nostro compose) — coerente con `/volume1` root-owned. **Bit di permesso NON STABILITI** (nessun `mode`, nessun `umask` nel sorgente): da verificare sull'istanza. |

---

## Implicazioni per la mappa

### Per G1 (NPM vs `tailscale serve`)

Il risultato **non impone** l'abbandono di NPM. Anzi, indebolisce l'argomento principale a favore
di `tailscale serve`: l'idea che il cert fosse "sepolto in un DB SQLite" e quindi sostituibile solo
per vie traverse **è falsa**. È un file su disco, in un path deterministico e derivabile dall'`id`,
che nessun processo rigenera alle nostre spalle. Automatizzarlo è alla portata di un playbook
leggibile.

Restano però tre costi reali che G1 deve pesare, ora quantificati:

1. **Il reload è a carico nostro.** Nessuna delle due strade (file o API) ricarica nginx. Serve
   `docker exec … nginx -s reload`, che significa: l'utenza SSH ristretta di T2 deve poter eseguire
   un `docker exec` su quel container. Questo **allarga il `command=`** previsto in T2 e va
   riconciliato con la scelta già fissata di **non** montare `/var/run/docker.sock`: qui il socket
   non serve, ma serve un utente sul NAS che possa parlare col demone Docker.
   **È il punto che merita più attenzione nel prossimo giro, ed è materia di T2 più che di R1.**
2. **La validazione di NPM non verifica cert↔chiave.** Un upload malformato passa i controlli e fa
   fallire `nginx -t` dopo. Il playbook deve fare `nginx -t` **prima** del reload e trattare il
   fallimento come rollback, non come warning.
3. **Il pin a digest diventa più importante, non meno.** Tutto quanto sopra è stabilito dal
   sorgente della v2.15.1, non da un contratto pubblico: il path `/data/custom_ssl/npm-<id>/` è
   stabile almeno da v2.1.0 a v2.15.1 (verificato via `raw.githubusercontent.com` sui tag v2.1.0,
   v2.5.0, v2.9.19, v2.11.3, v2.12.6, v2.15.1), ma non è una promessa. Il pin è ciò che rende
   l'automazione affidabile. **Da non sciogliere.**

### Per la fattibilità di un playbook idempotente

**È fattibile, e in modo pulito.** Ci sono due strade, ed è una decisione vera che G2/G3 devono
prendere — non la anticipo qui:

**Strada A — scrittura diretta dei file.** Confronto byte-a-byte del cert Tailscale contro
`/data/custom_ssl/npm-<id>/fullchain.pem`, e se differisce: backup, scrittura, `nginx -t`, reload.

- *Pro*: nessuna autenticazione JWT da custodire, nessun token da rinnovare, l'innesco su
  byte-diff previsto dalla mappa cade naturalmente (il file **è** lo stato). Nessun tocco al DB,
  quindi nessun rischio di corruzione SQLite — il vincolo `CLAUDE.md` sul DB resta intatto.
- *Contro*: `meta.certificate` nel DB resta **stale**, e `expires_on` pure. La UI mostrerebbe una
  data di scadenza vecchia. Funzionalmente innocuo (§1: quei blob non vengono mai riletti), ma è
  una **divergenza fra il "cert nel DB NPM" e il cert effettivamente servito** — sgradevole, e una
  trappola per il te stesso di fra sei mesi che guarda la UI e crede che il rinnovo non sia
  avvenuto. Se si sceglie A, va documentato in modo prominente.

**Strada B — `POST /api/nginx/certificates/{id}/upload`.** Idempotente sull'id, mantiene DB e
file coerenti, usa l'API ufficiale.

- *Pro*: nessuna divergenza; è il percorso che il prodotto prevede.
- *Contro*: serve un token JWT (`POST /tokens`) e quindi una credenziale in più da custodire in
  Semaphore; e **comunque non ricarica nginx**, quindi il `docker exec` resta necessario lo stesso.
  Il byte-diff va calcolato a parte, perché l'API non offre un "leggi il cert attuale" per i
  provider `other` (`download` è solo letsencrypt).

**Osservazione trasversale**: siccome B non evita il `docker exec` e in più aggiunge una
credenziale, il vantaggio di B si riduce alla sola coerenza del DB. Vale la pena che G2/G3
decidano *sapendo* che il costo di accesso (SSH + docker exec) è identico nei due casi. Una terza
via — A per la sostituzione, più un `POST /upload` solo quando il cert cambia davvero, cioè una
volta ogni ~3 mesi — è possibile ma va valutata, non la do per buona qui.

**Sul test di no-op** (il vincolo della mappa, sostituzione solo su byte-diff): il confronto è
banale in entrambe le strade — si confronta il cert Tailscale con `fullchain.pem` su disco. Se
identici, **il playbook non fa nulla: nessuna scrittura, nessun reload, nessun restart**. Questo
soddisfa direttamente il requisito "l'inserimento di un cert identico non deve causare restart né
downtime", e lo soddisfa in modo *dimostrabile oggi* — perché il ramo che non fa nulla è
osservabile senza aspettare novembre 2026. Il ramo che sostituisce, invece, resta non testabile
end-to-end fino al primo rinnovo reale, esattamente come la mappa prevede.

**Prerequisito operativo per tutte le strade**: scoprire l'`id` della entry esistente e fissarlo
come variabile. Comando diagnostico, in sola lettura:

```bash
ssh nicholasizzo@192.168.0.36 \
  "sudo ls -la /volume1/docker/nginx-proxy-manager/data/custom_ssl/"
```

Le directory `npm-<id>` presenti danno subito gli id dei cert custom. Per associarli ai nomi
servirebbe leggere il DB (`sqlite3 … "SELECT id, nice_name, provider, expires_on FROM certificate
WHERE is_deleted=0;"`) — **da fare in sola lettura, su una copia, mai sul file vivo**.

---

## Cosa NON è stabilito

1. **Il modo (bit di permesso) effettivo di `fullchain.pem` e `privkey.pem`.** Il sorgente non
   passa `mode` e non imposta `umask`. Va letto sull'istanza (comando `stat` al §5).
2. **Il supporto formale del reload esterno.** `nginx -s reload` è ciò che NPM fa a sé stesso, ma
   nessuna documentazione ufficiale lo dichiara un'interfaccia stabile per terzi.
3. **L'`id` della entry del cert Tailscale in uso.** Non ispezionabile da qui — richiede accesso
   all'istanza.
4. **Se la entry attuale sia stata creata come cert splittato** (leaf + intermediate separati) o
   con un fullchain già concatenato nel campo `certificate`. Cambia cosa deve mandare il playbook
   per riprodurre lo stesso `fullchain.pem`. Verificabile confrontando `meta` nel DB con il file su
   disco.

---

*Fonti primarie: sorgente `NginxProxyManager/nginx-proxy-manager` al tag `v2.15.1`
(commit `76f09db6`, corrispondente a `NPM_BUILD_COMMIT` dell'immagine pinnata); OpenAPI schema
`backend/schema/**` dello stesso commit; documentazione ufficiale `nginxproxymanager.com`;
Docker Hub registry API per la risoluzione del digest.*
