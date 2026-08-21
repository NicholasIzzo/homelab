---
id: R2
title: Semantica di rinnovo di tailscale cert
labels: [wayfinder:research]
status: closed
assignee: subagent
blocked-by: []
map: ../map.md
---

## Question

Cosa fa esattamente `tailscale cert <nome>` quando viene invocato ripetutamente? La cadenza scelta
per questa mappa è **giornaliera**, quindi il comando girerà ~365 volte l'anno su un certificato
che si rinnova ogni ~90 giorni: quasi tutte le invocazioni saranno no-op, e serve sapere con
precisione cosa succede in quel caso.

Da stabilire su fonti primarie (documentazione e sorgente Tailscale):

1. **Cache.** Se il certificato esistente è ancora valido e lontano dalla scadenza, la
   re-invocazione restituisce il cert in cache **senza** contattare Let's Encrypt, oppure ne
   negozia comunque uno nuovo?
2. **Finestra di rinnovo.** A quanti giorni dalla scadenza tailscaled decide che è ora di
   rinnovare davvero? Il valore indicativo che abbiamo assunto è ~30 giorni: confermalo o
   correggilo con la fonte.
3. **Rate limit ACME.** Se una qualsiasi invocazione contatta Let's Encrypt, un'invocazione
   giornaliera rischia di sbattere contro i rate limit di LE (per dominio, per account,
   duplicate-certificate)? Quali limiti si applicano e con quale margine?
4. **Byte-identità.** Nel caso no-op, i file scritti sono **byte-identici** a quelli precedenti?
   È il presupposto su cui poggia tutta la strategia idempotente della mappa: la sostituzione
   avviene solo su byte-diff, quindi se il no-op producesse comunque output differente
   (timestamp, riordino, ri-serializzazione) l'intera logica va ripensata.
5. **Exit code e output.** Come si distingue programmaticamente "rinnovato davvero" da
   "restituito dalla cache"? C'è un segnale affidabile oltre al confronto dei file?
6. **Contesto container.** Il nostro tailscaled gira in container `network_mode: host` con stato
   in `/volume1/docker/tailscale`. Dove scrive i certificati `tailscale cert` in quel contesto, e
   sopravvivono al riavvio del container?

**Non inventare.** Dove la documentazione non è esplicita, dillo e indica dove nel sorgente
andrebbe verificato.

---

## Risoluzione

**Findings completi:** [`.wayfinder/research/R2-findings.md`](../research/R2-findings.md)

**Versione:** digest pinnato risolto a **tailscale 1.102.2**, rev `eb67e5dcbe145d63e1128b9b4b630f8a82da101f`.
Sorgenti scaricati a quella revisione, non da `main`; `cmd/tailscale/cli/cert.go` verificato
byte-identico fra le due.

**Risposte:**

1. **Cache**: il no-op **non** contatta LE per l'emissione (`feature/acme/cert.go:135-136`, test
   upstream `valid_no_renewal`). L'unica chiamata possibile è il check ARI, **memoizzato in RAM**
   (`renewCertAt`, `cert.go:178-179`): una volta per riavvio di `tailscaled`, non una al giorno.
2. **Finestra: ~30 giorni confermato**, ma via ARI — Boulder `RenewalInfoSimple` calcola ±0.9 g
   attorno ai 2/3 di vita, e Tailscale pesca un punto casuale lì dentro (`cert.go:305-307`), con
   fallback deterministico a 2/3 se ARI fallisce. ⚠️ **L'assunzione ha una scadenza**: dal
   **2027-02-10** il profilo `classic` di LE passa a 64 giorni → la finestra scende a **~21 giorni**.
3. **Rate limit: nessun rischio, margine ~100x.** ~4 emissioni/anno, tutte esenti via ARI
   (*"exempt from all rate limits"*). Regge anche lo scenario di fallimento quotidiano.
4. **Byte-identità: più forte del richiesto.** Nel no-op il file **non viene nemmeno aperto in
   scrittura**: `writeIfChanged` (`cli/cert.go:216-228`) fa `bytes.Equal` e ritorna. Catena
   pass-through ricostruita per intero, zero punti di ri-serializzazione. Stabile dal 2021
   (`d5e1abd0c424`). **La strategia byte-diff della mappa regge senza riserve.**
5. **Exit code: non distingue** (0 in entrambi i rami). Il flag `Cached` esiste lato daemon ma
   **non è esposto** su LocalAPI. Unico segnale: stdout `Wrote ...` vs `... unchanged at ...`.
6. **Container**: `/volume1/docker/tailscale/certs/<dominio>.crt|.key`, catena completa da
   `TS_STATE_DIR` a `certDir()`. Sopravvive a riavvio e ricreazione del container.

### Tre scoperte fuori dal ticket, che cambiano il piano

- ⚠️ **Il rinnovo è asincrono: l'invocazione che lo innesca restituisce ancora il cert VECCHIO**
  (`feature/acme/cert.go:137-146`, ramo `minValidity == 0`, il nostro). Il giorno N la CLI stampa
  `unchanged` e il job non fa nulla — **sembra un no-op ma è l'esecuzione che ha innescato tutto**.
  Il giorno N+1 la CLI legge il cert nuovo, stampa `Wrote`, e il job installa. Ritardo fino a ~24h
  su una finestra di ~30 giorni: irrilevante per la sicurezza, **essenziale per il runbook** — chi
  verifica a novembre senza saperlo concluderà che il job è rotto.
- ⚠️ **Il cron è l'unico motore di rinnovo, non un guardiano.** Il refresh loop interno di
  `tailscaled` parte solo in presenza di una `ServeConfig` HTTPS (`refresh.go:36`), che con NPM
  davanti **non esiste**. Se il job non gira, nessuno rinnova.
- ⚠️ **`--min-validity` è un'arma carica**: bypassa ARI e forza il rinnovo sincrono. Se maggiore
  della vita del cert, **ogni** esecuzione emette → 5 certificati in 5 giorni, poi blocco.
  **Non passarlo.**

Segnali diagnostici collaterali: log di `tailscaled` prefissati `cert("<dominio>"): `
(`starting async renewal`, `got cert`, `async renewal failed: ...`). Il health warning
`tls-cert-pending` è **inaffidabile** come segnale di rinnovo: si alza solo `if previous == nil`,
cioè alla prima emissione, deliberatamente non durante un rinnovo con cert valido in cache.

**Non stabilito**: verifica live sul NAS (appartiene a [T1](T1-ricognizione-live.md)); il valore
numerico del rate limit del control plane su `SetDNS`, che sta nel server chiuso — irrilevante a
cadenza giornaliera.
