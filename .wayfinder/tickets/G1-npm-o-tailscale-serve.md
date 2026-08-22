---
id: G1
title: NPM o tailscale serve sul percorso TLS
labels: [wayfinder:grilling]
status: closed
assignee: claude+nicholas
blocked-by: [T1]
map: ../map.md
---

## Question

È il bivio architetturale della mappa, e va sciolto prima di progettare qualunque meccanismo di
inserimento: **Nginx Proxy Manager resta sul percorso TLS di Vaultwarden, o si passa a
`tailscale serve`?**

`tailscale serve` termina TLS da solo e rinnova i certificati automaticamente: eliminerebbe la
classe di problema invece di automatizzarla — niente `docker exec`, niente split, niente
inserimento in NPM. La domanda è se il costo di migrazione lo giustifichi.

Elementi già raccolti da mettere sul piatto:

**A favore di tenere NPM**
- Il percorso di accesso e la porta 44075 restano invariati: **nessun client Bitwarden da
  riconfigurare**. Riconfigurare ogni client di un password manager è precisamente il momento in
  cui non si vuole sbagliare.
- **CrowdSec legge i log di NPM** (`docker/crowdsec/docker-compose.yaml` monta
  `/volume1/docker/nginx-proxy-manager:/var/log/npm:ro` con la collection
  `crowdsecurity/nginx-proxy-manager`). Spostare Vaultwarden fuori da NPM sottrae a CrowdSec la
  visibilità proprio sul servizio più sensibile, e rende quel sistema più fragile.
- NPM resta comunque in piedi per gli altri servizi: `tailscale serve` non riduce il numero di
  sistemi da mantenere, lo aumenta.

**A favore di `tailscale serve`**
- Dissolve il problema invece di costruirci sopra automazione: meno parti mobili in totale, e
  nessun rischio che l'automazione fallisca in silenzio.
- Nessuna dipendenza dai dettagli interni di NPM, che R1 sta indagando proprio perché non sono
  un'interfaccia stabile.

**Un argomento pro-`tailscale serve` emerso da [R2](R2-tailscale-cert-renewal.md), che va pesato
onestamente perché indebolisce la posizione verso cui il charting propendeva.** Il refresh loop
interno di `tailscaled` si attiva **solo** in presenza di una `ServeConfig` HTTPS
(`refresh.go:36`). Con NPM davanti quella config non esiste, quindi **il nostro cron non è un
guardiano che integra un rinnovo automatico: è l'unico motore di rinnovo esistente.** Se il job non
gira, nessuno rinnova. Con `tailscale serve`, invece, il rinnovo è di `tailscaled` e non serve
alcun cron. Non ribalta da solo la decisione — i costi di migrazione elencati sopra restano — ma
va messo sul piatto come tale, non minimizzato.

**Da decidere con i fatti di R1 in mano.** Se R1 stabilisce che i cert custom sono file
sovrascrivibili a caldo, il costo di tenere NPM crolla e l'opzione (a) diventa nettamente
preferibile. Se invece l'unica via è manipolare il DB SQLite o un'API interna non documentata,
il costo di manutenzione di quell'automazione va confrontato seriamente con la migrazione.

Chiama `grilling` e `domain-modeling`. La decisione è dell'utente, non tua.

---

## Risoluzione

**Decisione: si resta su NPM, non si migra a `tailscale serve`.**

R1 smonta l'argomento principale a favore della migrazione: il certificato non è "sepolto in un
DB SQLite irraggiungibile" — è un file in un path deterministico (`/data/custom_ssl/npm-<id>/`),
sovrascrivibile in place senza rischio (dimostrato in pratica dal playbook di G2). Migrare a
`tailscale serve` costringerebbe a riconfigurare ogni client Bitwarden — il tipo di operazione a
rischio massimo su un password manager — e toglierebbe a CrowdSec la visibilità sui log di
Vaultwarden, che oggi legge.

Il rischio "il cron è l'unico motore di rinnovo" ([R2](R2-tailscale-cert-renewal.md)) esiste
**comunque**, indipendentemente da NPM o `tailscale serve`: si mitiga con [G4a](G4a-kuma-expiry-monitor.md)
(monitor sull'endpoint), non con la scelta architetturale — non è un argomento decisivo in nessuna
direzione. Il perimetro confermato in [T1](T1-ricognizione-live.md) (un cert, un proxy host) non
introduce complessità multi-host che avrebbe reso `tailscale serve` comparativamente più economico.

Nessuna migrazione eseguita: l'automazione in `ansible/tailscale-cert-renewal/` è scritta per NPM.
