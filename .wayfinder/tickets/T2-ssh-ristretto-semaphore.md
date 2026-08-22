---
id: T2
title: Accesso SSH ristretto da Semaphore al NAS
labels: [wayfinder:task]
status: closed
assignee: claude+nicholas
blocked-by: [T1, G1]
map: ../map.md
---

## Question

**HITL.** Predisporre il canale con cui Semaphore esegue il rinnovo sul NAS. Non c'è nulla da
decidere sul *se*: la sede e il pattern sono già fissati nelle Note della mappa. Qui si tratta di
fare il lavoro e registrare i fatti che i ticket successivi useranno.

**Il buco da colmare.** Semaphore gira in container (`docker/semaphore/docker-compose.yaml`),
`user: root`, e oggi **non può toccare Docker**: non monta `/var/run/docker.sock` e non ha chiavi
SSH. Ma il rinnovo richiede `docker exec tailscale tailscale cert ...` e la scrittura sotto
`/volume1/docker/nginx-proxy-manager/`, che è root-owned.

Il pattern scelto — utile ben oltre questa mappa, ed è una delle ragioni per cui è stato scelto:
**chiave dedicata + `command=` in `authorized_keys`**, così quella chiave può eseguire soltanto lo
script di rinnovo e nient'altro, anche se Semaphore venisse compromesso.

**Vincolo emerso da [R1](R1-npm-cert-storage.md).** NPM non espone alcun endpoint di reload: dopo
aver sostituito i file di certificato bisogna eseguire `nginx -t` e `nginx -s reload` **dentro** il
container `nginx-proxy-manager`. Quindi lo script vincolato da `command=` deve poter fare
`docker exec` su quel container, oltre che sul container `tailscale`. Questo **non** reintroduce il
mount di `/var/run/docker.sock` in Semaphore — il `docker exec` avviene sul NAS, dietro il confine
SSH — ma l'utente che esegue sul NAS deve raggiungere il daemon Docker, e va deciso come.

Da fare:

1. Generare una coppia di chiavi dedicata, usata **solo** per questo scopo.
2. Installare la chiave pubblica sul NAS con restrizione `command="..."`, più
   `no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty`.
3. Decidere e documentare **quale utente** sul NAS esegue lo script, dato che i path di
   destinazione sono root-owned: `nicholasizzo` con un `sudo` mirato, o un percorso diverso.
4. Registrare la chiave privata come credenziale in Semaphore (che la cifra con
   `SEMAPHORE_ACCESS_KEY_ENCRYPTION`).
5. Versionare in questo repo tutto ciò che è versionabile — lo script vincolato, la voce
   `authorized_keys` con la chiave pubblica — e **nulla** della chiave privata.
6. Verificare che la chiave non possa fare altro: tentare un comando arbitrario e confermare
   che venga rifiutato.

## Risposta attesa

La risoluzione deve registrare: dove vive la chiave privata, con quale nome è censita in
Semaphore, quale utente esegue sul NAS, il path esatto dello script vincolato, e l'esito della
verifica del punto 6.

---

## Risoluzione

**Utente sul NAS: `nicholasizzo`, nessun `sudo`.** La ricognizione live ([T1](T1-ricognizione-live.md))
ha dimostrato che questo utente esegue già `docker exec` su `tailscale` e `nginx-proxy-manager`
senza sudo — dentro quei container si entra come root del container indipendentemente da chi ha
lanciato `docker exec` sull'host, quindi non serve mai toccare i permessi host su `/volume1`.

**Script vincolato**: `/home/nicholasizzo/bin/tailscale-cert-renew.sh` — path scelto fuori da
`/volume1` apposta, non richiede root per essere installato o aggiornato. Versionato in
`ansible/tailscale-cert-renewal/remote/tailscale-cert-renew.sh`; il deploy fisico resta un passo
manuale (HITL), non eseguito in questa sessione.

**Riga `authorized_keys`**: template in `ansible/tailscale-cert-renewal/remote/authorized_keys.snippet`
— `command="/home/nicholasizzo/bin/tailscale-cert-renew.sh"` più
`no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty`.

**Chiave**: generata sul NAS (`ssh-keygen -t ed25519 -f ~/.ssh/semaphore-cert-renew -N ""`),
pubblica installata come sopra, privata da incollare in Semaphore come credenziale
`NAS_CERT_RENEWAL_SSH_KEY` (vedi `ansible/tailscale-cert-renewal/semaphore/task-template.yml`) e
poi cancellata dal NAS — non deve restare una copia della chiave privata sulla macchina che serve
a raggiungere.

**Conseguenza architetturale non anticipata dal ticket**: il `command=` fisso è incompatibile con
il modo normale in cui Ansible parla SSH (deve eseguire payload arbitrari per ogni modulo — moduli
Python serializzati, sftp). Risolto facendo girare il playbook su `hosts: localhost` e raggiungendo
il NAS con un singolo comando `ssh` esplicito dentro un task — dettagliato in
`ansible/tailscale-cert-renewal/README.md`. Tutta la logica idempotente vive nello script remoto,
non nei task Ansible.

**Regola fissata**: mai `docker exec -t` nello script remoto — nessuna allocazione TTY, coerente
con `no-pty`.

**Verifica del punto 6**: documentata come Test 1 in `ansible/tailscale-cert-renewal/docs/runbook.md`
(`ssh -i <chiave> nicholasizzo@192.168.0.36 "whoami"` deve **non** stampare `nicholasizzo`). Non
eseguita dal vivo in questa sessione — richiede la chiave installata sul NAS.
