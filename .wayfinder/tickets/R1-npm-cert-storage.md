---
id: R1
title: Dove NPM conserva i certificati custom
labels: [wayfinder:research]
status: closed
assignee: nicholas (agent)
blocked-by: []
map: ../map.md
---

## Question

Quando si carica un **cert splittato** come "Custom Certificate" in Nginx Proxy Manager, dove
finisce fisicamente? È il fatto che blocca l'intera mappa: da qui dipendono G1, G2 e G3.

Da stabilire, su fonti primarie (documentazione e sorgente di `jc21/nginx-proxy-manager`):

1. **Storage.** I certificati custom sono scritti come **file su disco** dentro il volume `/data`
   (e con quale layout di path), oppure conservati come blob dentro il database SQLite di NPM,
   o un ibrido (file su disco + riga di metadati nel DB)?
2. **Sostituibilità a caldo.** Se sono file, sovrascriverli in place è sufficiente perché nginx
   serva il cert nuovo, o NPM rigenera la configurazione da database e sovrascriverebbe la
   modifica alla prima occasione?
3. **Reload.** Qual è il modo supportato di far ricaricare nginx dopo la sostituzione, senza
   riavviare il container? Esiste un endpoint API di NPM per aggiornare un certificato custom
   esistente, e se sì è documentato o interno?
4. **Identità della entry.** Se il meccanismo passa per il DB o per l'API, come si identifica in
   modo stabile la entry già esistente (id numerico? nome?), per aggiornarla invece di crearne
   una nuova a ogni esecuzione giornaliera?
5. **Ownership e permessi** attesi sui file di certificato, tenendo presente che nel nostro caso
   il volume vive sotto `/volume1`, che è root-owned.

Rilevante: la versione in uso è pinnata a digest
`sha256:52b2c59994f3d36acfcf70a1626f29734df0ed8c71bacc0269f78b6f939858bb` — se il layout è
cambiato tra versioni, segnala a quale versione si riferisce ciò che trovi.

**Non inventare.** Se una risposta non è stabilibile da fonti primarie, dillo esplicitamente e
segnala che va verificata sull'istanza reale.

---

## Risoluzione

**Findings completi:** [`.wayfinder/research/R1-findings.md`](../research/R1-findings.md)

**Versione risolta:** il digest pinnato è **NPM v2.15.1, commit `76f09db6`** (build 2026-06-03),
letto dal config blob dell'immagine via registry API e verificato contro `NPM_BUILD_COMMIT`. Tutte
le citazioni sono al sorgente esatto che ha costruito il container in esecuzione.

**Risposte:**

1. **Storage: ibrido asimmetrico.** File in `/data/custom_ssl/npm-<id>/{fullchain,privkey}.pem`
   **più** PEM in chiaro nella colonna JSON `meta` della tabella `certificate` in
   `/data/database.sqlite`. nginx legge **solo i file** (`backend/templates/_certificates.conf:11-12`).
   NPM concatena da sé leaf + intermediate in `fullchain.pem` (`certificate.js:498-501`).
2. **Sovrascrittura in place: sicura.** `writeCustomCert` ha un solo chiamante (`upload`), e i blob
   nel DB sono letti solo lì dentro. Nulla rigenera i PEM all'avvio o durante la rigenerazione
   della config nginx; nessun file watcher. La copia nel DB è di fatto **write-only**.
3. **Reload: `nginx -t` poi `nginx -s reload`** — ma la scoperta decisiva è che
   **`POST /upload` non ricarica nginx affatto**. Nella UI "funziona" solo perché quel flusso crea
   sempre una entry *nuova* e il reload arriva dopo, dal salvataggio del proxy host. Non esiste un
   endpoint API di reload: **entrambe** le strategie richiedono un `docker exec` esplicito.
4. **Identità: `certificate.id` numerico, e non esiste `PUT`.** L'aggiornamento in place è
   `POST /api/nginx/certificates/{id}/upload`, idempotente sull'id. `nice_name` non è una chiave.
   Attenzione: ogni upload sovrascrive `domain_names` con il CN del certificato.
5. **Ownership: `root:root`** (PUID/PGID default 0, non sovrascritti nel nostro compose), coerente
   con `/volume1` root-owned. **Bit di permesso NON STABILITI**: nessun argomento `mode` né `umask`
   nel sorgente — e `privkey.pem` non riceve modo esplicito, mentre le credenziali DNS di Certbot
   ottengono `0o600` (`certificate.js:833`).

**Due trovate oltre il ticket:**

- **Il requisito di reload collide con T2.** Il `command=` ristretto dovrà permettere `docker exec`
  su quel container. Non reintroduce il mount di `docker.sock`, ma l'utente Semaphore deve
  comunque raggiungere il daemon Docker. Segnalato, non risolto: è problema di T2.
- **NPM non verifica che la chiave corrisponda al certificato**: `validate` esegue i due controlli
  openssl in modo indipendente. Una coppia disallineata **passa la validazione**, scrive i file, e
  fallisce `nginx -t` dopo. Quindi `nginx -t` prima del reload dev'essere un cancello duro con
  rollback.

**Non stabilito** (con il comando diagnostico per chiuderlo sull'istanza reale, nei findings): bit
di permesso, supporto formale al reload esterno, `id` reale della entry esistente, e se quella
entry sia stata creata splittata o pre-concatenata.
