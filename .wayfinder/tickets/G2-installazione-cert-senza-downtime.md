---
id: G2
title: Installazione del cert in NPM senza downtime
labels: [wayfinder:grilling]
status: open
assignee:
blocked-by: [T1, G1]
map: ../map.md
---

## Question

Dato il meccanismo scelto in G1 e i fatti di R1 e R2: **come, esattamente, il playbook porta il
cert emesso da Tailscale fino a essere servito da nginx, senza interruzione di servizio?**

Il cuore della mappa. Da decidere:

1. **La catena di trasformazione.** Il percorso oggi manuale è: `tailscale cert` → `docker cp`
   fuori dal container → split del `.crt` in leaf e intermediate → upload nella UI di NPM.
   Quali di questi passi sopravvivono nell'automazione, e quali spariscono? Lo split è ancora
   necessario o è un artefatto della UI?
2. **Il confronto byte-diff.** Su cosa si confronta per decidere se sostituire: il cert emesso,
   il cert splittato, o quello già installato in NPM? Sono tre confronti diversi con tre
   significati diversi, e R2 dirà se il no-op è davvero byte-identico.
3. **L'atomicità.** Se il playbook viene interrotto a metà sostituzione, in che stato resta NPM?
   Serve una scrittura atomica (write-then-rename) o un ordine di operazioni che non lasci mai
   nginx con un leaf e una chiave disallineati?
4. **Il reload.** Come si fa ricaricare nginx senza riavviare il container e senza far cadere
   connessioni in corso. Se l'unica via fosse il restart, quantifica il downtime e decidi se è
   accettabile su questo servizio.
5. **Il caso "primo giro".** La entry del cert in NPM esiste già, creata a mano. Il playbook la
   aggiorna, o la ricrea? Se la ricrea, i proxy host che la referenziano restano agganciati?
6. **Idempotenza reale.** Eseguito due volte di fila senza che nulla sia cambiato, il playbook
   deve essere un no-op completo: nessuna scrittura, nessun reload, nessun backup nuovo.

**Fatti già acquisiti che vincolano la risposta:**

- Il **percorso reale** dei certificati è `/volume1/docker/tailscale/certs/<dominio>.crt|.key`
  ([R2](R2-tailscale-cert-renewal.md)), **non** `/tmp/certs/` come dicono i README
  ([R3](R3-stato-reale-nas.md)): la CLI senza flag scrive in cwd, e l'immagine non imposta
  `WORKDIR`. Passa path assoluti espliciti, o leggi la cache già montata.
- Il confronto byte-diff **è affidabile**: nel no-op `writeIfChanged` non apre nemmeno il file in
  scrittura. Il punto 2 qui sotto si semplifica di conseguenza.
- `nginx -t` va usato come **cancello duro con rollback** prima di ogni reload
  ([R1](R1-npm-cert-storage.md)): NPM non verifica che chiave e certificato corrispondano, quindi
  una coppia disallineata passa la validazione e rompe nginx dopo.
- **Non passare `--min-validity`** ([R2](R2-tailscale-cert-renewal.md)): bypassa ARI e, se mal
  tarato, emette un certificato a ogni esecuzione fino al blocco.
- L'esecuzione che innesca il rinnovo stampa `unchanged` e installa il giorno dopo: il playbook
  **non** deve trattare quel ritardo come un errore né tentare di forzarlo.

Chiama `grilling` e `domain-modeling`. Rileggi il vincolo sul test nelle Note della mappa prima
di proporre qualunque verifica: **non esiste end-to-end onesto prima di novembre 2026**.
