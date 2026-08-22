---
id: P1
title: Bozza del playbook di rinnovo
labels: [wayfinder:prototype]
status: closed
assignee: claude+nicholas
blocked-by: [G2, T2]
map: ../map.md
---

## Question

**HITL.** Alzare la fedeltà della discussione con un artefatto concreto da criticare: una bozza
del playbook Ansible che implementa il meccanismo deciso in G2, eseguito attraverso il canale
predisposto in T2.

Non è codice di produzione. È qualcosa di abbastanza reale da far emergere ciò che il grilling non
ha visto: la forma dei task, dove la logica diventa goffa, quali fatti mancano ancora.

Da mettere sul tavolo:

- Struttura dei task: emissione, estrazione, confronto byte-diff, sostituzione, reload, backup.
- Dove vive la condizione di idempotenza, e se il playbook è leggibile o è diventato un albero
  di `when:` annidati.
- Come si esprime il backup del DB NPM prima di ogni sostituzione, e cosa succede se fallisce.
- Quali variabili sono parametri (hostname, path, nome della entry) e quali sono costanti — il
  perimetro della mappa è **un cert, N proxy host**, quindi l'hostname va parametrizzato anche se
  oggi ce n'è uno solo.
- Cosa il playbook stampa a log in un giorno no-op: sarà l'output che l'utente vedrà 89 volte su
  90, e deve rendere ovvio a colpo d'occhio che non è successo nulla di anomalo.

**Vincolo didattico dalle Note della mappa**: è il primo playbook Ansible serio dell'utente. A
parità di risultato, preferisci il modo **idiomatico e leggibile** a quello compatto o astuto.
Se un modulo Ansible nativo fa il lavoro, usalo invece di un `shell:` che fa la stessa cosa.

Chiama `prototype`. Linka il file prodotto come asset nella risoluzione, non incollarlo qui.

---

## Risoluzione

Il percorso previsto da questo ticket (bozza throwaway per alzare la fedeltà della discussione
*prima* del grilling) è stato invertito: le decisioni di [G1](G1-npm-o-tailscale-serve.md),
[G2](G2-installazione-cert-senza-downtime.md), [T2](T2-ssh-ristretto-semaphore.md),
[G3](G3-test-e-rollback.md), [G4a](G4a-kuma-expiry-monitor.md) e
[G4b](G4b-notifica-fallimento-job.md) sono state prese per esteso, un ticket alla volta con
conferma esplicita, **prima** di scrivere qualunque codice. Il playbook è stato quindi scritto
direttamente in forma quasi-definitiva — non una bozza da criticare e poi buttare, ma l'artefatto
finale stesso.

Struttura dei task, dove vive l'idempotenza, backup del DB/dei file, parametri vs costanti, e cosa
viene loggato in un giorno no-op — tutti i punti che questo ticket chiedeva di mettere sul tavolo —
sono risolti in `ansible/tailscale-cert-renewal/playbook.yml` e
`ansible/tailscale-cert-renewal/remote/tailscale-cert-renew.sh`. Non linkati come asset separato
perché sono il deliverable finale, non una bozza a parte.
