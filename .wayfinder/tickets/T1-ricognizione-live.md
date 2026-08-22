---
id: T1
title: Ricognizione live sul NAS
labels: [wayfinder:task]
status: closed
assignee: claude+nicholas
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

---

## Risoluzione

Checklist eseguita dal vivo (2026-08-22) via SSH interattivo, con me a dettare i comandi a blocchi.
Tutti i comandi erano di sola lettura; nessuna scrittura, riavvio o emissione di certificati.

**B1 — identità Tailscale reale.**
`CertDomains = ["dh4300plus-fix.taile39e4f.ts.net"]` — **il repo è allineato**, nessun problema di
nome. `HostName` del container è `DH4300PLUS-3562`, `DNSName` è
`dh4300plus-fix.taile39e4f.ts.net.`: conferma **ipotesi 1 di A2** (nodo unico, rinominato a mano in
admin console, auto-generate disattivato) e scarta l'ipotesi 2 (nessun peer omonimo nello status).
`tailscale cert` senza argomenti conferma lo stesso dominio come unico valido.

**B2 — certificato realmente servito.**
`CN=dh4300plus-fix.taile39e4f.ts.net`, issuer `Let's Encrypt, CN=YE1`,
**`notAfter=Nov 5 11:23:47 2026 GMT`** — la data di `docs/homelab-hub-design.md:21` è confermata da
**misura**, non più solo da documento: la finestra del primo rinnovo reale resta novembre 2026.
`subjectAltName` contiene un solo DNS (nessuna wildcard) → `dns-subdomain-resolve` non è in uso su
questo tailnet.

**B3 — proxy host reali.**
**Un solo proxy host esiste** (`/data/nginx/proxy_host/2.conf`), `server_name
dh4300plus-fix.taile39e4f.ts.net`, `ssl_certificate` → `certificate_id = 3` (`npm-3`). Chiude il
NON STABILITO numerico lasciato da [R1](R1-npm-cert-storage.md). Nessun redirection host, nessun
dead host.

**B4 — Home Assistant e Nextcloud.**
Home Assistant **è deployato e in esecuzione** (`homeassistant-app-1`, `ugreen/home-assistant:v2`,
`Up 2 weeks`) — non è un README aspirazionale, il servizio gira. Ma da B3 esiste un solo proxy
host (quello di Vaultwarden): HA **non è dietro NPM**, coerente con A3 (NPM rifiuterebbe un secondo
host sullo stesso nome). È raggiungibile solo per IP:porta.
Nextcloud **non ha alcun container**, nemmeno arrestato (`docker ps -a` non lo elenca affatto),
pur avendo una directory `/volume1/docker/nextcloud` su disco — il README è non solo aspirazionale
ma descrive un servizio mai avviato.

Conseguenza per la mappa: la voce "Not yet specified → Generalizzazione agli altri servizi" si
chiude come **non-problema**, non come decisione — vedi nota in `map.md`.

**B5 — layout su disco dei certificati custom.**
Confermato `/data/custom_ssl/npm-<id>/{fullchain.pem,privkey.pem}`. `privkey.pem` è **`700`,
root:root** — chiude l'altro NON STABILITO di R1. Trovata non anticipata: `npm-3` (l'entry attiva)
ha **4 blocchi** in `fullchain.pem`, non i 2 attesi (leaf + intermediate). Verificato con
`openssl pkcs7 -print_certs`: è una catena completa e valida fino alla root self-signed
(`leaf → YE1 → Root YE → ISRG Root X2 → ISRG Root X1`), non un residuo duplicato. Risposta al
NON STABILITO di R1 "se l'entry sia stata creata splittata o pre-concatenata": è stata caricata
fornendo l'intera catena come campo "intermediate", non solo leaf+intermediate minimale — NPM
concatena senza validare la lunghezza. **Da decidere in G2**: normalizzare a 2 blocchi o replicare 4
— non è indifferente per la strategia byte-diff se `tailscale cert` produce una catena di lunghezza
diversa.

**B6 — dove scrive `tailscale cert`.**
`pwd` nel container `tailscale` è `/` (nessun `WORKDIR` nell'immagine) — conferma A4. Nessun
residuo `*.ts.net.crt/.key` in `/` o `/tmp`. La cache interna
`/var/lib/tailscale/certs/dh4300plus-fix.taile39e4f.ts.net.{crt,key}` esiste, `.crt` è `644`
(world-readable), `.key` è `600` (root-only), e contiene **la stessa catena a 4 blocchi** installata
in `npm-3` (verificato con `grep -c "BEGIN CERTIFICATE"`) — la differenza di ~96 byte rispetto a
`npm-3/fullchain.pem` è coerente con una differenza di formattazione, non di contenuto. **Questa
cache è quindi la fonte diretta utilizzabile da G2**, senza passare da `docker cp` o da un'invocazione
esplicita di `tailscale cert --cert-file/--key-file`. Versione tailscale: **1.102.2** (sopra la
soglia per il codice wildcard e per `--min-validity`).

**Effetto collaterale osservato, non richiesto dalla checklist**: `/var/lib/tailscale/` è di
proprietà `1000:wheel`, ma `/var/lib/tailscale/certs/` è `root:root` con **zero bit di permesso**
(`d---------`). I file dentro sono comunque leggibili/aggiornati, quindi il processo `tailscaled`
nel container gira evidentemente come root nonostante l'ownership host a UID 1000. Da tenere a
mente in G2: l'utente con cui Semaphore esegue il `docker exec` per leggere questa cache non è
rilevante per il filesystem del container (il comando gira dentro come root via `docker exec`), ma
vale la pena verificarlo esplicitamente quando si scrive il playbook.
