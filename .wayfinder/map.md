---
labels: [wayfinder:map]
status: closed
---

# Automazione del certificato Tailscale servito da NPM

## Destinazione

Una **spec versionata in questo repo** — playbook Ansible, configurazione Semaphore, procedura di
test e piano di rollback — che rinnova e installa il certificato Tailscale servito da Nginx Proxy
Manager senza passaggi manuali.

La mappa **pianifica, non esegue**: il `git pull && docker compose up -d` sul NAS resta un atto
esplicito dell'utente, come da regola "esecuzione solo su conferma esplicita" in `CLAUDE.md`.

## Note

**Dominio.** Homelab IaC, flusso GitOps. Rispondi in italiano, conciso. Timezone Europe/Rome.
Leggi `CLAUDE.md` a ogni sessione: le regole invarianti valgono anche qui.

**Skill da consultare.** Per default `grilling` + `domain-modeling`. I ticket `research` chiamano
`research`; i ticket `prototype` chiamano `prototype`.

**Vocabolario** (fissato, usalo con precisione — i tre termini sono cose diverse e confonderli
è il modo in cui i ticket su NPM vanno storti):

| Termine | Significato |
|---|---|
| **cert emesso da Tailscale** | I file `.crt` / `.key` prodotti da `tailscale cert` |
| **cert splittato** | Leaf e intermediate separati in file distinti, pronti per l'inserimento |
| **cert nel DB NPM** | La entry corrispondente nel database SQLite di Nginx Proxy Manager |

**Preferenze fissate per questo sforzo** (decise in fase di charting, non ridiscuterle senza motivo):

- **Sede di esecuzione**: Semaphore, via SSH con chiave dedicata e `command=` ristretto in
  `authorized_keys`. Scartato il mount di `/var/run/docker.sock`: Semaphore custodisce già le
  credenziali dell'homelab, e il socket Docker è root sull'host.
- **Innesco**: giornaliero, idempotente, sostituzione **solo su byte-diff**. Sopravvive a una
  propria esecuzione persa senza intervento umano.
- **Allarmi**: SMTP Office365, già configurato e provato in Grafana. Telegram è l'upgrade path
  se l'email non si dimostra abbastanza raggiungibile. Scartato ntfy self-hosted: ospitare il
  canale d'allarme sullo stesso NAS che deve sorvegliare è un punto singolo di guasto condiviso.
- **Perimetro**: **un** cert Tailscale, **un** proxy host NPM. ⚠️ Corretto dopo
  [R3](tickets/R3-stato-reale-nas.md): la formulazione originale era «un cert, N proxy host», basata
  sull'idea che Vaultwarden, Home Assistant e Nextcloud puntassero tutti allo stesso nome macchina.
  **Non è possibile in NPM**: `isHostnameTaken` rifiuta un secondo host con lo stesso nome, e la
  porta non li distingue (`_listen.conf` è cablato su 80/443). Condividere un `certificate_id` fra
  più proxy host resta supportato — ma richiede **nomi diversi**, che Tailscale non emette
  (niente sub-subdomain senza la capability non documentata `dns-subdomain-resolve`). Quindi non
  parametrizzare per generalità speculativa: qui c'è un nome solo, e resterà uno.

**Vincolo sul test — leggilo prima di progettare qualunque verifica.** `tailscale cert` non è un
demone: scrive uno snapshot, e il rinnovo *è* la re-invocazione del comando. Fuori dalla finestra
di rinnovo, re-invocare restituisce il cert **già in cache, identico**. Un test end-to-end eseguito
oggi produrrebbe byte identici e passerebbe **senza dimostrare nulla**. Quindi:

- Nessun end-to-end onesto è possibile prima del primo rinnovo reale, atteso a **novembre 2026** —
  ma quella data viene da `docs/homelab-hub-design.md`, che è **un documento, non una misura**.
  Il blocco B2 di [T1](tickets/T1-ricognizione-live.md) la rimisura sul certificato realmente
  servito; fino ad allora trattala come stima.
- Prima di allora si verifica **solo** che il no-op non rompa NPM: l'inserimento di un cert
  identico non deve causare restart né downtime.
- Non forzare una scadenza artificiale per provare: su un password manager il costo di sbagliare
  è sproporzionato rispetto a ciò che il test aggiunge. In particolare **non passare
  `--min-validity`** per provocare un rinnovo: [R2](tickets/R2-tailscale-cert-renewal.md) ha
  stabilito che bypassa ARI e, se mal tarato, emette a ogni esecuzione fino al blocco.
- **Il rinnovo è asincrono** ([R2](tickets/R2-tailscale-cert-renewal.md)): l'esecuzione del giorno N
  innesca il rinnovo in background e stampa `unchanged`; l'installazione avviene il giorno N+1.
  La prima esecuzione "che non fa niente" **è** quella che ha innescato tutto: chi legge i log senza
  saperlo concluderà che il job è rotto.

**Obiettivo didattico.** È il primo playbook Ansible non banale dell'utente in Semaphore. A parità
di risultato, preferisci la soluzione **leggibile e idiomatica** a quella elegante o compatta.

## Decisions so far

<!-- indice: una riga per ticket chiuso, poi zooma il link per il dettaglio -->

- [Dove NPM conserva i certificati custom](tickets/R1-npm-cert-storage.md): storage **ibrido**
  (file in `/data/custom_ssl/npm-<id>/` + blob nel DB, ma nginx legge solo i file e la copia nel DB
  è write-only), quindi **sovrascrivere in place è sicuro**; nessun endpoint di reload esiste, così
  che **ogni** strategia richiede un `docker exec` — e NPM non verifica che chiave e certificato
  corrispondano, per cui `nginx -t` va usato come cancello duro prima del reload.
- [Ricognizione dello stato reale su NAS](tickets/R3-stato-reale-nas.md): il sub-subdomain di
  Nextcloud è **irrealizzabile** e più proxy host sullo stesso nome sono **impossibili** in NPM,
  quindi il perimetro è un cert e un solo host (Note corrette sopra); il nome
  `dh4300plus-fix` **non è spiegabile** da normalizzazione né deduplica e va misurato; e
  `tailscale cert` senza flag non scrive in `/tmp/certs/` come dicono i README, ma in cwd.
  Lo stato live resta scoperto → graduato in [T1](tickets/T1-ricognizione-live.md).
- [Semantica di rinnovo di tailscale cert](tickets/R2-tailscale-cert-renewal.md): la strategia
  byte-diff **regge senza riserve** (nel no-op il file non viene nemmeno aperto in scrittura) e la
  cadenza giornaliera è sicura sui rate limit con margine ~100x; ma il rinnovo è **asincrono** —
  l'esecuzione che lo innesca stampa `unchanged` e installa solo il giorno dopo — il **cron è
  l'unico motore di rinnovo** e non un guardiano, e `--min-validity` non va passato mai.
- [Ricognizione live sul NAS](tickets/T1-ricognizione-live.md): checklist B1-B6 eseguita dal vivo.
  `CertDomains` reale = `dh4300plus-fix.taile39e4f.ts.net`, repo allineato; scadenza cert **misurata**
  = `Nov 5 2026`; **un solo proxy host** esiste, `certificate_id = 3`; Home Assistant gira ma non
  dietro NPM, Nextcloud non ha alcun container; `privkey.pem` è `700` root:root; l'entry attiva
  (`npm-3`) ha una catena a **4 blocchi** (leaf+intermediate+root, non 2) da cui G2 deve decidere se
  normalizzare; la cache `/var/lib/tailscale/certs/` è utilizzabile come fonte diretta per G2.
- [NPM o tailscale serve](tickets/G1-npm-o-tailscale-serve.md): **si resta su NPM**. L'argomento
  principale a favore della migrazione (cert sepolto in un DB) è falso (R1); migrare costringerebbe
  a riconfigurare ogni client Bitwarden e toglierebbe a CrowdSec la visibilità su Vaultwarden. Il
  rischio "cron unico motore di rinnovo" (R2) si mitiga con G4a, non con la scelta architetturale.
- [Accesso SSH ristretto da Semaphore](tickets/T2-ssh-ristretto-semaphore.md): utente `nicholasizzo`,
  nessun sudo (tutto passa per `docker exec`); script fisso in `/home/nicholasizzo/bin/`, chiave
  dedicata con `command=` ristretto. Il `command=` fisso è incompatibile con i moduli Ansible via
  SSH → il playbook gira su `localhost` e raggiunge il NAS con un solo comando `ssh` esplicito.
- [Installazione cert senza downtime](tickets/G2-installazione-cert-senza-downtime.md): niente
  split leaf/intermediate (la cache tailscaled è già la catena completa); scrittura diretta dei
  file (Strada A di R1, non l'API); backup singolo sovrascritto, rename privkey-poi-fullchain,
  `nginx -t` come cancello duro; `certificate_id = 3` è costante, mai cercata per nome.
- [Test e rollback](tickets/G3-test-e-rollback.md): l'host NPM usa-e-getta non è realizzabile
  (NPM rifiuta un secondo host sullo stesso nome) — sostituito con un config nginx sintetico e
  scartabile per isolare il gate `nginx -t` senza toccare la produzione. Primo run atteso
  `RESULT: renewed` cosmetico (differenza di formattazione T1/B5, non un rinnovo vero).
- [Monitor di scadenza in Kuma](tickets/G4a-kuma-expiry-monitor.md): **priorità alta, non
  opzionale** — è l'unica rete di sicurezza contro "il job non è mai partito" (R2: il cron è
  l'unico motore di rinnovo). Monitor sull'endpoint TLS live via IP LAN, soglia 10 giorni (sotto
  tutte le finestre future fino al 2028), stessa notifica SMTP di Grafana.
- [Notifica di fallimento job](tickets/G4b-notifica-fallimento-job.md): notifica solo su
  `error`/`rollback`; il playbook manda l'email da sé (non la notifica nativa Semaphore) per non
  perdere il contenuto strutturato della riga `RESULT: <stato> | <messaggio>`; trap EXIT garantisce
  che un crash imprevisto non esca 0 in silenzio.
- [Bozza del playbook](tickets/P1-bozza-playbook.md): percorso invertito — le decisioni sono state
  prese per esteso prima di scrivere codice, quindi il playbook è stato scritto direttamente in
  forma quasi-definitiva in `ansible/tailscale-cert-renewal/`, non come bozza a parte.

## Not yet specified

- **Aggiornamento della documentazione**: i README di Vaultwarden, Home Assistant e Nextcloud
  descrivono oggi la procedura manuale a 9 passi, che l'automazione rende obsoleta. Dopo
  [T1](tickets/T1-ricognizione-live.md) la correzione non è più solo cosmetica:
  `docker/home-assistant/README.md:62` propone un proxy host che NPM rifiuta comunque (nome già in
  uso), e `docker/nextcloud/README.md:85` descrive un servizio che **non esiste come container**.
- **Retention e rotazione dei backup del DB NPM** presi prima di ogni sostituzione. Un job
  giornaliero che fa backup accumula; nessuno ha deciso quanti tenerne.
- **Riuso del pattern SMTP per notifiche di altri servizi** (Scrutiny, e futuri). Decisione
  trasversale che questa mappa **apre ma non risolve**: qui si fissa il canale per un solo job,
  ma la scelta crea un precedente per tutto l'homelab.

## Out of scope

Ruled beyond the destination. Non graduano: tornano solo se la destinazione viene ridisegnata,
e allora come sforzo nuovo, non come ripresa di questo.

- **Let's Encrypt pubblico ed esposizione a internet.** Dominio diverso (challenge ACME,
  superficie d'attacco); il NAS non è esposto e non deve diventarlo per questa mappa.
- **Sostituire NPM con Caddy o Traefik.** Gestirebbero i certificati nativamente e dissolverebbero
  il problema, ma è una ri-architettura del percorso TLS di tutto l'homelab, non questa mappa.
- **Migrazione generale di tutti i servizi a `tailscale serve`.** Se G1 decide di usarlo per il
  solo Vaultwarden, quello è dentro; il refactor complessivo no.

---

## Convenzioni del tracker (markdown locale)

Nessun tracker esterno è configurato, quindi la mappa vive nel repo.

- La mappa è questo file. I ticket sono `.wayfinder/tickets/<id>-<slug>.md`.
- Il **claim** è il campo `assignee` nel frontmatter: va scritto **prima** di ogni lavoro, così le
  sessioni concorrenti saltano il ticket. Un ticket `open` con `assignee` vuoto è libero.
- Il **blocking** è il campo `blocked-by`, lista di id. Un ticket è sbloccato quando ogni ticket
  che lo blocca è `status: closed`.
- Il **frontier** è l'insieme dei ticket `open`, sbloccati e non claimati. Per calcolarlo:
  `.wayfinder/frontier.sh`
- La risoluzione si registra come sezione `## Risoluzione` in coda al ticket, si mette
  `status: closed`, e si aggiunge una riga in **Decisions so far** qui sopra.
