---
id: G3
title: Procedura di test e piano di rollback
labels: [wayfinder:grilling]
status: open
assignee:
blocked-by: [R1, G2]
map: ../map.md
---

## Question

Come si prova questo meccanismo **senza rompere Vaultwarden**, e come si torna indietro se rompe.
La spec non è completa senza entrambe le cose: è un requisito esplicito della destinazione.

### Il vincolo che governa tutto

Rileggi le Note della mappa. `tailscale cert` fuori dalla finestra di rinnovo restituisce il cert
in cache: un test eseguito oggi produce byte identici e **passa senza dimostrare nulla**. Quindi:

- Il vero end-to-end è il **primo rinnovo reale, atteso a novembre 2026**. Non c'è modo onesto di
  anticiparlo, e non si forza una scadenza artificiale per provare.
- Ciò che si può verificare prima è **solo** che il no-op non causi danno: l'inserimento di un
  cert identico non deve provocare restart di nginx, né downtime, né accumulo di backup.

La strategia scelta rende il vincolo tollerabile: essendo il playbook idempotente e a byte-diff,
il giorno del rinnovo vero non fa nulla di diverso da quello che ha già fatto 89 volte — cambia
solo il ramo che finora non è mai stato preso.

### Da decidere

1. **Il proxy host di scarto.** Si crea un host NPM usa-e-getta sullo stesso cert Tailscale per
   esercitare il ciclo senza toccare Vaultwarden. Come si costruisce, come si verifica che serva
   davvero TLS, e come si smonta senza lasciare residui nel DB di NPM.
2. **Cosa si asserisce nel test del no-op.** Nginx non ha ricaricato? Nessun file è cambiato?
   Nessuna connessione caduta? Serve un criterio osservabile, non un "sembra a posto".
3. **Il rollback.** Backup del DB NPM e dei file di certificato prima di ogni sostituzione — ma
   *dove*, con quale nome, e **come si ripristina in pratica**. Nota che un rollback presuppone di
   sapere dove NPM tiene i certificati: se R1 non lo ha stabilito con certezza, il piano di
   rollback è scritto sulla sabbia e va detto.
4. **Il criterio di successo a novembre.** Cosa si guarda, il giorno del primo rinnovo vero, per
   dire che ha funzionato — e chi se ne accorge se non ha funzionato (si intreccia con G4a).
   ⚠️ **Il runbook deve dire esplicitamente che il rinnovo è asincrono**
   ([R2](R2-tailscale-cert-renewal.md)): il giorno N l'esecuzione stampa `unchanged` e non installa
   nulla, perché ha solo *innescato* il rinnovo in background; l'installazione avviene il giorno
   N+1. Un osservatore che non lo sa vedrà un no-op nel giorno in cui si aspettava il rinnovo e
   concluderà che il job è rotto — proprio nel momento più delicato. Segnali per distinguere:
   `docker logs tailscale` mostra `cert("<dominio>"): starting async renewal`. Il health warning
   `tls-cert-pending` **non** serve: si alza solo alla prima emissione, mai durante un rinnovo con
   cert valido in cache.
5. **Il piano B manuale.** Se l'automazione fallisce a novembre e Vaultwarden è giù, qual è la
   procedura minima per rimettere in piedi il servizio a mano, e dove sta scritta perché sia
   trovabile in quel momento — cioè quando il password manager non è raggiungibile.

Chiama `grilling` e `domain-modeling`.
