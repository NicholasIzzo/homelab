# Rinnovo certificato Tailscale su NPM (Vaultwarden)

Automazione del rinnovo del certificato TLS emesso da Tailscale e servito
da Nginx Proxy Manager per Vaultwarden. Nasce dalla mappa wayfinder
[`.wayfinder/map.md`](../../.wayfinder/map.md) — questa cartella è
volutamente self-contained (script, playbook, doc, `.gitignore` propri) per
poter essere spostata o rimossa in blocco senza toccare il resto del repo.

## Come si incastrano i pezzi

```
Semaphore (cron giornaliero, notte)
    │
    │  esegue playbook.yml su localhost (dentro il container Semaphore)
    ▼
playbook.yml
    │
    │  UNA sessione SSH, chiave ristretta (T2)
    ▼
NAS (192.168.0.36, utente nicholasizzo)
    │
    │  authorized_keys forza SEMPRE l'esecuzione di:
    ▼
remote/tailscale-cert-renew.sh
    │
    │  docker exec (nessun sudo, nessun tocco a /volume1 come host)
    ▼
container tailscale ──► cache cert ──► container nginx-proxy-manager
```

## Perché il playbook gira su `localhost` e non modella il NAS come host

Questa è la scelta architetturale meno ovvia, quindi vale la pena
spiegarla una volta qui invece che ripeterla nei commenti sparsi.

[T2](../../.wayfinder/tickets/T2-ssh-ristretto-semaphore.md) fissa
"chiave dedicata + `command=` ristretto in `authorized_keys`" — così che
anche se Semaphore fosse compromesso, quella chiave non possa fare altro
che eseguire un unico script fisso. Ma il modo normale in cui Ansible
raggiunge un host è aprire SSH e spedire payload arbitrari (moduli Python
serializzati, trasferimenti sftp) per ogni singolo task — **incompatibile
per costruzione** con un `command=` fisso: ogni task fallirebbe
silenziosamente eseguendo sempre e solo lo script fisso, mai il modulo
richiesto.

Soluzione: il play gira su `hosts: localhost`, e l'unico punto di contatto
con il NAS è un task `ansible.builtin.command` che invoca `ssh` come
sottoprocesso. Il comando passato a `ssh` è irrilevante — il server esegue
comunque e solo `remote/tailscale-cert-renew.sh` — Ansible cattura
`stdout`/`stderr`/`rc` di quell'unica chiamata e li usa per decidere
successo/fallimento. Tutta la logica idempotente (trigger, byte-diff,
backup, scrittura, `nginx -t`, reload, rollback) vive **dentro lo script
remoto**, non nei task Ansible: qui Ansible è un orchestratore che lancia
un comando e ne legge l'esito strutturato, non un motore di moduli sul NAS.

## Contenuto della cartella

| File | Cosa fa |
|---|---|
| `playbook.yml` | Orchestratore: materializza la chiave, chiama SSH, legge `RESULT:`, notifica sui fallimenti |
| `inventory.ini` | Solo `localhost` — il NAS non è un host d'inventario (vedi sopra) |
| `requirements.yml` | Collection `community.general` (serve solo per `community.general.mail`) |
| `remote/tailscale-cert-renew.sh` | Lo script vero, che vive **sul NAS**. Versionato qui per revisione/storia; il deploy fisico è manuale (T2) |
| `remote/authorized_keys.snippet` | La riga `command=` da installare a mano in `~/.ssh/authorized_keys` sul NAS |
| `semaphore/task-template.yml` | Riferimento di cosa impostare a mano nella UI di Semaphore (v2.19.7 non ha config-as-code per i task template) |
| `docs/runbook.md` | Procedura di test pre-produzione, criterio di successo a novembre 2026, rollback manuale, piano B |
| `docs/kuma-setup.md` | Istruzioni passo-passo per il monitor di scadenza in Uptime Kuma (G4a) |

## Stato di deploy

**Nulla di questo è ancora installato sul NAS o in Semaphore.** Solo file
di repo, come da vincolo di questa sessione di lavoro. Prima di attivare il
cron:

1. [T2](../../.wayfinder/tickets/T2-ssh-ristretto-semaphore.md) — generare
   la chiave, installare `remote/authorized_keys.snippet` sul NAS, copiare
   `remote/tailscale-cert-renew.sh` in `/home/nicholasizzo/bin/` ed
   eseguire `chmod +x`.
2. `docs/runbook.md` — eseguire i test 1, 2, 3 e confermare gli esiti
   attesi (incluso il `RESULT: renewed` cosmetico atteso al primissimo
   run, per via della differenza di formattazione trovata in T1/B5).
3. `semaphore/task-template.yml` — configurare progetto, inventory,
   segreti, task template nella UI di Semaphore.
4. `docs/kuma-setup.md` — configurare il monitor di scadenza **prima** di
   attivare il cron, non dopo: è la rete di sicurezza contro "il job non è
   mai partito", non un accessorio da aggiungere più tardi.
5. Solo a quel punto, attivare lo schedule giornaliero nel task template.

## Decisioni e fatti da cui questa automazione dipende

Tutte le decisioni architetturali sono state prese e verbalizzate nei
ticket wayfinder prima di scrivere questi file — non ripetute qui in
dettaglio, solo indicizzate:

- [G1](../../.wayfinder/tickets/G1-npm-o-tailscale-serve.md) — si resta su
  NPM, non si migra a `tailscale serve`.
- [T1](../../.wayfinder/tickets/T1-ricognizione-live.md) — i fatti
  misurati dal vivo (`certificate_id=3`, `CertDomains`, layout su disco)
  che questa automazione usa come costanti, non parametri.
- [R1](../../.wayfinder/tickets/R1-npm-cert-storage.md) — perché la
  scrittura diretta dei file è sicura e perché il reload richiede sempre
  un `docker exec` esplicito.
- [R2](../../.wayfinder/tickets/R2-tailscale-cert-renewal.md) — semantica
  di `tailscale cert`: perché il cron è l'unico motore di rinnovo, perché
  il rinnovo è asincrono, perché la strategia byte-diff regge.
- [T2](../../.wayfinder/tickets/T2-ssh-ristretto-semaphore.md) — canale di
  esecuzione.
- [G2](../../.wayfinder/tickets/G2-installazione-cert-senza-downtime.md) —
  la catena di trasformazione e le garanzie di zero-downtime.
- [G3](../../.wayfinder/tickets/G3-test-e-rollback.md) — procedura di
  test e rollback (→ `docs/runbook.md`).
- [G4a](../../.wayfinder/tickets/G4a-kuma-expiry-monitor.md) — monitor di
  scadenza (→ `docs/kuma-setup.md`).
- [G4b](../../.wayfinder/tickets/G4b-notifica-fallimento-job.md) —
  notifica di fallimento (→ logica in `playbook.yml`).
