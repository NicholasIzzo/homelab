---
id: T1
title: Ricognizione live sul NAS
labels: [wayfinder:task]
status: open
assignee:
blocked-by: []
map: ../map.md
---

## Question

**HITL — richiede le tue mani.** Graduato da [R3](R3-stato-reale-nas.md), che ha stabilito tutto
ciò che era stabilibile da documentazione e ha lasciato scoperto lo stato reale del NAS.
L'SSH verso `nicholasizzo@192.168.0.36` richiede password interattiva: nessun agent ci arriva.

Nulla da decidere qui. C'è da eseguire la checklist **B1–B6** in
[`.wayfinder/research/R3-findings.md`](../research/R3-findings.md) e registrare cosa risponde.

Sono **soli comandi di lettura**. Leggono dall'interno dei container per aggirare `/volume1`
root-owned (due usano `sudo`, segnalati nella checklist), e interrogano i file
`/data/nginx/proxy_host/*.conf` invece del DB SQLite in esercizio.

> **Avviso.** Non lanciare `tailscale cert <dominio>` durante la ricognizione: è una scrittura e
> può innescare un ordine ACME. Per elencare i domini validi serve `tailscale cert` **senza
> argomenti**, che è un errore d'uso e stampa `CertDomains`.

### Perché blocca invece di essere una nota a margine

Se B1 rivelasse che `CertDomains` contiene `dh4300plus-3562.taile39e4f.ts.net` mentre il repo dice
`dh4300plus-fix`, l'automazione costruita sul nome del repo emetterebbe felicemente un certificato
per **un nome che nessuno serve**, e Vaultwarden resterebbe sul cert vecchio fino alla scadenza.
Un fallimento silenzioso, su un password manager, scoperto ~90 giorni dopo. È esattamente il modo
di fallire che questa mappa esiste per evitare, e nessuna decisione a valle regge finché il nome
reale non è misurato.

### Cosa la risoluzione deve registrare

1. **B1** — `CertDomains` reali del nodo: il nome autoritativo su cui si costruisce tutto, e se la
   capability wildcard `dns-subdomain-resolve` sia presente o assente.
2. **B2** — Certificato realmente servito e la sua **scadenza misurata**. Rimpiazza il
   `notAfter=Nov 5 2026` che la mappa cita oggi da `docs/homelab-hub-design.md`, che è un documento
   e non una misura: da questa data dipende quando cade il primo test end-to-end onesto.
3. **B3** — Proxy host reali e `certificate_id` associati, incluso **l'`id` numerico della entry**
   lasciato NON STABILITO da [R1](R1-npm-cert-storage.md).
4. **B4** — Se Home Assistant e Nextcloud siano davvero dietro NPM o i loro README siano
   aspirazionali. Dato A3, se risultassero configurati significherebbe che lo sono in un modo
   diverso da quello documentato — e quel modo va capito.
5. **B5** — Layout su disco dei cert custom, a conferma di R1, **più i bit di permesso** su
   `privkey.pem`, l'altro NON STABILITO di R1.
6. **B6** — Dove `tailscale cert` scrive davvero in questo container, verifica di A4.
