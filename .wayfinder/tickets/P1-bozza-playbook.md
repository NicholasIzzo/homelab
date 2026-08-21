---
id: P1
title: Bozza del playbook di rinnovo
labels: [wayfinder:prototype]
status: open
assignee:
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
