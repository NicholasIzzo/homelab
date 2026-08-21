---
id: R3
title: Ricognizione dello stato reale su NAS
labels: [wayfinder:research]
status: closed
assignee: subagent
blocked-by: []
map: ../map.md
---

## Question

Il repo e la realtà potrebbero divergere. Questo ticket separa ciò che è stabilibile da fonti
documentali da ciò che richiede accesso live al NAS.

> **Vincolo noto.** L'SSH verso `nicholasizzo@192.168.0.36` richiede password interattiva
> (`Permission denied (publickey,password)` in modalità batch). Un subagent **non raggiunge il
> NAS**. Le domande del gruppo B non vanno indovinate: vanno lasciate aperte e graduate come
> ticket `task` HITL alla risoluzione di questo.

### Gruppo A — rispondibile da documentazione (AFK)

1. **Sotto-sottodomini Tailscale.** `docker/nextcloud/README.md:85` propone
   `nextcloud.<hostname>.taile39e4f.ts.net`. Tailscale emette certificati per il nome macchina
   nel tailnet: emette anche per sotto-sottodomini arbitrari di quel nome? Se no, quella riga del
   README è irrealizzabile e va corretta — stabiliscilo dalla documentazione Tailscale.
2. **Nomi macchina e MagicDNS.** Come si deriva il nome DNS effettivo di un nodo dal suo hostname?
   Un hostname `DH4300PLUS-3562` che nel repo compare come `dh4300plus-fix.taile39e4f.ts.net`
   è spiegabile (normalizzazione, rinomina, suffisso di deduplica), o indica due nodi distinti?
3. **Un cert, più proxy host.** Servire N proxy host NPM con lo **stesso** certificato Tailscale
   è supportato e sensato, o ogni hostname vuole il suo cert? Conferma il presupposto di perimetro
   fissato nella mappa.

### Gruppo B — richiede accesso live (NON indovinare)

4. Quali proxy host esistono realmente in NPM, e quali certificati hanno associati?
5. Home Assistant e Nextcloud sono davvero deployati dietro NPM, o i loro README sono
   documentazione aspirazionale? Nel repo usano `<hostname>` placeholder mentre Vaultwarden ha un
   valore concreto (`dh4300plus-fix.taile39e4f.ts.net`), il che suggerisce la seconda ipotesi.
6. Qual è l'hostname Tailscale reale del NAS, e la scadenza attuale del certificato in uso?
7. Il layout su disco dei certificati custom nell'istanza NPM reale, a conferma di quanto R1
   stabilisce dalla documentazione.

Per il gruppo B, produci in output una **checklist precisa di comandi read-only** che l'utente
possa incollare in una sessione SSH interattiva, con indicazione di cosa guardare nell'output.
Nessun comando che scriva, riavvii o modifichi alcunché.

---

## Risoluzione

**Findings completi:** [`.wayfinder/research/R3-findings.md`](../research/R3-findings.md)

### Gruppo A — stabilito

**A1. Tailscale non emette cert per sotto-sottodomini.** `feature/acme/cert.go` @ v1.102.3,
`resolveCertDomain`, col commento esplicito: *"Subdomain requests like `app.node.ts.net` are
rejected"*. Quindi `docker/nextcloud/README.md:85` è **irrealizzabile**.
Sfumatura: la wildcard `*.<machine>.<tailnet>.ts.net` **esiste nel codice rilasciato** ma è gated
dalla node capability `dns-subdomain-resolve`, assegnata dal control plane e **non documentata**.
Non assumerla disponibile: va misurata (B1/B2).

**A2. `dh4300plus-fix` non è spiegabile.** `DH4300PLUS-3562` normalizzerebbe a
`dh4300plus-3562`, e la deduplica Tailscale è numerica (`-1`, `-2`), mai un suffisso semantico.
Restano due ipotesi entrambe legittime: rinomina manuale in admin console, oppure **due nodi
distinti** — ipotesi non peregrina visto `--reset` in `TS_EXTRA_ARGS`. Serve il live.

**A3. La premessa di perimetro della mappa era sbagliata.** Vanno separate due domande:
- *Riusare lo stesso certificato su più proxy host*: **sì**, supportato e ordinario
  (`certificate_id` è una semplice FK interpolata in `_certificates.conf`).
- *Più proxy host sullo stesso nome macchina*: **impossibile**. `isHostnameTaken`
  (`backend/internal/proxy-host.js`) fa fallire il secondo con `… is already in use`. E
  distinguerli per porta non si può: `_listen.conf` è cablato su `listen 80` / `listen 443 ssl`;
  la 44075 è solo la pubblicazione Docker `44075:443`, un unico listener TLS.

Perciò **entrambe** le righe dei README sono rotte, per motivi diversi:
`home-assistant/README.md:62` usa lo stesso nome di Vaultwarden → collisione;
`nextcloud/README.md:85` usa un sub-subdomain → nessun cert e nessuna risoluzione MagicDNS.

**A4 (collaterale, impatta G2).** I README copiano da `tailscale:/tmp/certs/`, ma la CLI senza flag
scrive in **cwd**, e lo stage finale del Dockerfile Tailscale (`FROM alpine:3.22`) non imposta
`WORKDIR` → i file finiscono in `/`. Il playbook deve passare `--cert-file`/`--key-file` espliciti,
oppure leggere la cache `/var/lib/tailscale/certs/`, già montata su `/volume1/docker/tailscale/`.

### Gruppo B — checklist, non risposte

Sei blocchi (B1–B6) di soli comandi di lettura, ciascuno con "cosa guardare e perché". Leggono
**dall'interno dei container** per aggirare `/volume1` root-owned (solo due comandi usano `sudo`,
segnalati), e usano i file `/data/nginx/proxy_host/*.conf` invece del DB SQLite: sono la verità che
nginx carica davvero, e rispondono alle domande 4, 5 e 7 senza toccare il database in esercizio.

Avviso incorporato nella checklist: **non** lanciare `tailscale cert <dominio>` durante la
ricognizione — è una scrittura e può innescare un ordine ACME. Per elencare i domini validi basta
`tailscale cert` **senza argomenti**, errore d'uso che stampa `CertDomains`.

### Graduato da questa risoluzione

- **T1 — [Ricognizione live sul NAS](T1-ricognizione-live.md)**: task HITL bloccante, esegue B1–B6.
- La scadenza `notAfter=Nov 5 2026` citata nella mappa viene da `docs/homelab-hub-design.md`, che è
  **un documento, non una misura**. B2 la rimisura.
