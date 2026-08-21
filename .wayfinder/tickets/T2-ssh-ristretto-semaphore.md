---
id: T2
title: Accesso SSH ristretto da Semaphore al NAS
labels: [wayfinder:task]
status: open
assignee:
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
