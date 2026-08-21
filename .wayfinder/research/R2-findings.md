---
ticket: R2
title: Semantica di rinnovo di `tailscale cert` — esito ricerca
date: 2026-08-21
sources: primarie (sorgente tailscale/tailscale, sorgente letsencrypt/boulder, docs Let's Encrypt, docs Tailscale)
---

# R2 — Semantica di `tailscale cert` invocato ripetutamente

## 0. Perimetro delle fonti e versione analizzata

Tutto ciò che segue è verificato sul **sorgente della versione effettivamente in esecuzione sul NAS**,
non su `main` generico.

- Compose in repo: `docker/tailscale/docker-compose.yaml:4` pinna
  `tailscale/tailscale@sha256:321ce041508c19079b57a28b6666c8d81ab0b08accc0a2585b3ab663d557ac24`.
- Interrogando il registry Docker Hub, l'index OCI di quel digest riporta
  `org.opencontainers.image.version = "1.102.2"` e
  `org.opencontainers.image.revision = "eb67e5dcbe145d63e1128b9b4b630f8a82da101f"`
  (immagine costruita il 2026-07-31).
- Quindi ogni riferimento `file:riga` qui sotto è a
  `https://github.com/tailscale/tailscale/blob/eb67e5dcbe145d63e1128b9b4b630f8a82da101f/<path>`
  salvo diversa indicazione. Dove `main` differisce, lo segnalo.

Verifica di rilievo: **`cmd/tailscale/cli/cert.go` è byte-identico fra `eb67e5d` e `main`** (diff
eseguito localmente sui due raw file, 254 righe entrambi, nessuna differenza). Le differenze in
`feature/acme/cert.go` fra `eb67e5d` e `main` sono limitate a: guardia anti-concorrenza sul rinnovo
async (`beginAsyncRenewal`/`endAsyncRenewal`), hook `ARIReplacesAllower` per il cert-share
Kubernetes, e rinomine di simboli. **Nessuna tocca le risposte sotto.**

Nota di build: `build_docker.sh:51-55` include `tailscale.com/cmd/tailscale` in `/usr/local/bin/tailscale`
e non passa il build tag `ts_omit_acme` — quindi il supporto ACME/cert **è compilato** nell'immagine.

---

## 1. Cache — la re-invocazione contatta Let's Encrypt?

**Risposta: no, non per l'emissione. In condizioni normali il no-op non fa NESSUNA chiamata di rete
verso Let's Encrypt.** C'è una sola eccezione, limitata e innocua, descritta sotto.

Il percorso è `tailscale cert` → LocalAPI → `LocalBackend.GetCertPEMWithValidity` →
`extension.getCertPEMWithValidity`:

- `feature/acme/cert.go:121` — `pair, cacheErr := getCertPEMCached(cs, certDomain, now)` legge il
  cert dal `certStore` (dischi locali) e ne verifica la validità a `now`.
- `feature/acme/cert.go:135-136` — `if !shouldRenew { return pair, nil }`. Ritorno immediato del
  materiale in cache. Nessun ordine ACME, nessuna registrazione account, nessun challenge.

Confermato dal test upstream `TestGetCertPEMWithValidity`, caso `"valid_no_renewal"`
(`feature/acme/cert_test.go:702-708`): `wantAsyncRenewal: false, wantIssuance: false` — il test
sostituisce `getCertPEM` con uno stub e verifica che **non venga mai chiamato**.

**L'unica chiamata di rete possibile nel no-op** è il controllo ARI (ACME Renewal Information):
`shouldStartDomainRenewal` → `domainRenewalTimeByARI` → `ac.FetchRenewalInfo`
(`feature/acme/cert.go:182`, `:295`). Sono due GET non autenticate: `/directory` e
`/acme/renewal-info/<AKI>.<serial>` (`tempfork/acme/acme.go:263-297`).

Ma è **memoizzata in RAM**: `feature/acme/cert.go:178-179`

```go
if renewAt, ok := e.renewCertAt[domain]; ok {
    return now.After(renewAt), nil
}
```

`renewCertAt` è una mappa in-memory del processo `tailscaled` (`feature/acme/acme.go`, struct
`extension`, campo `renewCertAt map[string]time.Time`, "lazily initialized under renewMu"), svuotata
per quel dominio **solo dopo un rinnovo riuscito** (`domainRenewed`, chiamata da
`feature/acme/cert.go:566`). Conseguenza operativa concreta:

> Con `tailscaled` che gira per mesi senza riavvio, il controllo ARI avviene **una volta sola**, alla
> prima invocazione di `tailscale cert` dopo l'avvio del daemon. Tutte le ~364 invocazioni giornaliere
> successive dell'anno sono **puro I/O su file locale, zero pacchetti verso Let's Encrypt**.

**Nota rilevante per la mappa**: il loop di refresh interno di `tailscaled`
(`feature/acme/refresh.go:21`, `certRefreshInterval = time.Hour`) parte **solo** se
`state == ipn.Running && serveConfigUsesACMECerts(sc)` (`refresh.go:36`), cioè solo se esiste una
`ServeConfig` con una voce HTTPS (`tailscale serve` / Funnel / `--tls-terminated-tcp`,
`refresh.go:134-154`). Nel nostro scenario — NPM davanti, nessun `tailscale serve` — **quel loop non
gira**. Il cron giornaliero è quindi l'**unico** motore di rinnovo: se salta per settimane, nessuno
rinnova al posto suo. Questo giustifica la scelta di cadenza giornaliera e va detto esplicitamente
nel piano. (Se G1 decidesse per `tailscale serve`, la premessa cambia: lì `tailscaled` rinnova da solo.)

---

## 2. Finestra di rinnovo — quanti giorni prima della scadenza

**Risposta: ~30 giorni prima della scadenza, con un'oscillazione casuale di ±~22 ore. L'assunzione
"~30 giorni" del ticket è CONFERMATA, ma per un motivo diverso da quello che sembra, e con una data
di scadenza dell'assunzione: 10 febbraio 2027.**

Ci sono due meccanismi, in ordine di priorità.

### 2a. ARI (percorso normale)

`feature/acme/cert.go:275-308` interroga l'endpoint `renewalInfo` di Let's Encrypt e poi:

```go
// feature/acme/cert.go:305-307
start, end := ri.SuggestedWindow.Start, ri.SuggestedWindow.End
renewTime := start.Add(randv2.N(end.Sub(start)))
```

cioè sceglie un istante **uniformemente casuale** dentro la finestra suggerita da LE (randomizzazione
raccomandata da `draft-ietf-acme-ari`, citata nel commento del codice).

Come LE calcola quella finestra — fonte primaria, sorgente Boulder,
`letsencrypt/boulder/core/objects.go`, `RenewalInfoSimple`:

```go
// "calculate a point 2/3rds of the way through the validity period (or halfway
//  through, for short-lived certs), then give a 2%-of-validity wide window around that"
validity := expires.Add(time.Second).Sub(issued)
renewalOffset := validity / 3
if validity < 10*24*time.Hour { renewalOffset = validity / 2 }
idealRenewal := expires.Add(-renewalOffset)
margin := validity / 100
// window = [idealRenewal - margin, idealRenewal + margin]
```

Per un certificato a 90 giorni: `renewalOffset = 30d`, `margin = 0.9d = 21.6h` →
finestra ≈ **da 30g21h a 29g02h prima della scadenza**, larga ~43 ore. Tailscale pesca un punto a
caso lì dentro. Quindi: **rinnovo effettivo fra ~29 e ~31 giorni dalla scadenza.**

Caso speciale: se il cert è coinvolto in un incidente o è stato revocato, Boulder restituisce
`RenewalInfoImmediate` (finestra collocata **un'ora nel passato**) → Tailscale rinnova alla prima
invocazione utile. È un meccanismo di sicurezza che gioca a favore del job giornaliero.

### 2b. Fallback per scadenza (se ARI fallisce)

`feature/acme/cert.go:186-190`: se `FetchRenewalInfo` fallisce, log e fallback a
`domainRenewalTimeByExpiry`, che è deterministico (`feature/acme/cert.go:202-220`):

```go
// "check whether we're more than 2/3 of the way through the certificate's
//  lifetime, which is the officially-recommended best practice by Let's Encrypt"
// (rif. https://github.com/tailscale/tailscale/issues/8204)
renewalDuration := certLifetime * 2 / 3
renewAt := cert.NotBefore.Add(renewalDuration)
```

Su 90 giorni: rinnovo a `NotBefore + 60d` = **esattamente 30 giorni prima della scadenza**, senza
jitter. Test upstream `TestShouldStartDomainRenewal` (`feature/acme/cert_test.go:598-612`): a 89
giorni → rinnova; a 59 giorni su 90 → non rinnova ("not 2/3rds of the way through 90 days yet").

### 2c. Attenzione: la durata di 90 giorni ha una scadenza

Il codice non hardcoda 90 giorni — calcola sempre in frazione della vita reale del certificato. La
vita reale dipende dal **profilo ACME** di Let's Encrypt.

- Tailscale **non specifica un profilo**: `tempfork/acme/types.go:410-416` espone `WithOrderProfile`,
  ma `feature/acme/cert.go` non lo usa mai (verificato per grep su tutto il package `feature/acme`).
  Quindi si usa il profilo di default di LE, `classic`.
- Docs Tailscale, <https://tailscale.com/kb/1153/enabling-https>: *"The certificates provided by
  Let's Encrypt have a 90 day expiry and require periodic renewal."*
- Let's Encrypt, <https://letsencrypt.org/2025/12/02/from-90-to-45>: il profilo `tlsserver` è passato
  a **45 giorni il 13 maggio 2026**; il profilo **`classic` passa a 64 giorni il 10 febbraio 2027**, e
  a 45 giorni il 16 febbraio 2028.

Traduzione per la mappa:

| Periodo | Vita cert | Rinnovo a (2/3) | Giorni prima della scadenza | Rinnovi/anno |
|---|---|---|---|---|
| oggi → 2027-02-10 | 90 g | 60 g | **~30** | ~4 |
| 2027-02-10 → 2028-02-16 | 64 g | ~42,7 g | **~21** | ~6 |
| dal 2028-02-16 | 45 g | 30 g | **~15** | ~8 |

Il primo rinnovo reale atteso a **novembre 2026** (come da nota "Vincolo sul test" nella mappa) cade
ancora nel regime a 90 giorni. Ma **qualunque soglia di allarme espressa in giorni** (es. il monitor
di scadenza di G4a) va scelta sapendo che dal febbraio 2027 il margine si dimezza: una soglia a 25
giorni, sensata oggi, diventerebbe un falso allarme permanente. Suggerimento: allarmare a ~10 giorni,
non a ~25.

---

## 3. Rate limit ACME con cadenza giornaliera

**Risposta: nessun rischio. Il margine è di tre ordini di grandezza.**

Il ragionamento poggia su tre fatti già stabiliti:

1. Il no-op **non crea ordini ACME** (§1). Su ~365 invocazioni/anno, gli ordini creati sono ~4.
2. L'unico traffico del no-op è al massimo un GET `/directory` + un GET `/acme/renewal-info/...`,
   e solo **una volta per riavvio di `tailscaled`** grazie alla memoizzazione `renewCertAt` (§1).
3. Gli ordini di rinnovo che vengono effettivamente creati portano l'estensione ARI `replaces`
   (`feature/acme/cert.go:370-374`: se esiste un cert precedente, `opts` include
   `xacme.WithOrderReplacesCert(prevCrt)`).

Limiti Let's Encrypt applicabili, <https://letsencrypt.org/docs/rate-limits/> (citazioni testuali):

| Limite | Valore | Consumo nostro |
|---|---|---|
| New Orders per Account | *"Up to 300 new orders can be created by a single account every 3 hours."* | ~4/anno |
| New Certificates per Registered Domain | *"Up to 50 certificates can be issued per registered domain ... every 7 days."* | condiviso `ts.net` ma esente via ARI |
| New Certificates per Exact Set of Identifiers | *"Up to 5 certificates can be issued per exact same set of identifiers every 7 days."* (refill 1 ogni 34 h) | ~4/anno, esente via ARI |
| Authorization Failures per Identifier per Account | *"Up to 5 authorization failures per identifier ... every hour."* | 1 tentativo/giorno nel caso peggiore |
| Overall requests, `/acme/renewal-info` | 1000 req/s per IP, burst 100 | ≤1 richiesta per riavvio daemon |
| Overall requests, `/directory` | 40 req/s per IP, burst 40 | idem |

Esenzione ARI, citazione testuale dalla stessa pagina:

> *"Renewals coordinated by ARI offer the unique benefit of being exempt from all rate limits. ... If
> the new order includes at least one identifier matching the certificate it intends to replace and
> the certificate has not been previously replaced using ARI, the order will not be subject to any
> rate limits."*

E anche **senza** ARI, il fallback resterebbe sicuro: stesso set esatto di identificatori →
riconosciuto come renewal → esente da New Orders per Account e New Certificates per Registered
Domain, soggetto solo al limite 5-per-7-giorni (che ~4 rinnovi/anno non sfiorano).

### Il vero scenario patologico, e perché regge comunque

Se un rinnovo **fallisce**, `domainRenewed` non viene chiamata, quindi `renewCertAt[domain]` conserva
un istante ormai passato e **ogni invocazione successiva ritenta**. Con cadenza giornaliera: 1
tentativo/giorno finché non passa o finché il cert scade. Anche questo caso resta sotto tutti i
limiti (peggio che può capitare: ~1 ordine/giorno contro 300/3h; ~1 fallimento di autorizzazione/giorno
contro 5/ora). Il vincolo più stretto in quello scenario **non è Let's Encrypt** ma il control plane
Tailscale: `client/local/cert.go:62-71` documenta che *"the control plane rate limits SetDNS requests"*
per il challenge dns-01 — il valore numerico non è pubblicato. **NON STABILITO**: il rate limit di
`SetDNS` lato control plane Tailscale non è documentato pubblicamente né deducibile dal sorgente open
(la logica sta nel control server, che è chiuso). Irrilevante a 1 tentativo/giorno; da tenere presente
se qualcuno proponesse cadenze orarie.

### Il vero pericolo: `--min-validity` usato male

`cmd/tailscale/cli/cert.go:45` espone `--min-validity`. Se lo si passa, `shouldStartDomainRenewal`
**bypassa completamente ARI** e diventa un confronto secco (`feature/acme/cert.go:169-175`):

```go
if minValidity != 0 {
    cert, err := parseCertificate(pair)
    ...
    return cert.NotAfter.Sub(now) < minValidity, nil
}
```

e il rinnovo diventa **sincrono** (`feature/acme/cert.go:147-150`, "starting sync renewal"). Se
`min-validity` fosse ≥ della vita del certificato, **ogni singola esecuzione forzerebbe una nuova
emissione**: 5 certificati in 5 giorni e poi 34 ore di blocco per ogni cert successivo. Raccomandazione
per la mappa: **non passare `--min-validity` nel job giornaliero.** Il default 0 (ARI) è la scelta
corretta e la più sicura. Se un giorno lo si volesse per rendere il momento del rinnovo deterministico,
il valore va tenuto ben sotto un terzo della vita del cert e rivisto alle due date del §2c.

---

## 4. Byte-identità nel no-op ⭐

**Risposta: sì, ed è una garanzia più forte di quanto il ticket chieda. Nel no-op i file di output non
vengono nemmeno riscritti: `tailscale cert` li lascia intatti, mtime e inode compresi.**

Questa è la domanda su cui poggia tutta la strategia della mappa, quindi la catena è ricostruita per
intero, passo per passo, senza salti.

**Passo 1 — lettura da disco, nessun re-parse.** `feature/acme/certstore.go:135-154`:

```go
func (f certFileStore) Read(domain string, now time.Time) (*ipnlocal.TLSCertKeyPair, error) {
	certPEM, err := os.ReadFile(certFile(f.dir, domain))
	...
	keyPEM, err := os.ReadFile(keyFile(f.dir, domain))
	...
	if !validCertPEM(domain, keyPEM, certPEM, f.testRoots, now) {
		return nil, errCertExpired
	}
	return &ipnlocal.TLSCertKeyPair{CertPEM: certPEM, KeyPEM: keyPEM, Cached: true}, nil
}
```

I byte restituiti sono **letteralmente** quelli di `os.ReadFile`. `validCertPEM`
(`certstore.go:411-434`) fa solo `tls.X509KeyPair` + `x509.Verify` per **validare**: non produce
output, non riscrive nulla, non riordina la catena. Nessuna ri-serializzazione PEM, nessun timestamp
iniettato.

**Passo 2 — ritorno del medesimo puntatore.** `feature/acme/cert.go:135-136`: `return pair, nil`.
Lo stesso `*TLSCertKeyPair` del passo 1, non una copia trasformata.

**Passo 3 — trasporto LocalAPI, scrittura raw.** `ipn/localapi/cert.go:60-73`, `serveKeyPair`:
con `?type=pair` fa `w.Write(p.KeyPEM)` seguito da `w.Write(p.CertPEM)`. Concatenazione binaria
diretta nel body HTTP.

**Passo 4 — lato client, solo uno slice.** `client/local/cert.go:117-140`, `CertPairWithValidity`:
trova il delimitatore `"--\n--"` e fa `keyPEM, certPEM = res[:i], res[i:]`. È **slicing** di un array
di byte: nessuna copia, nessuna normalizzazione, nessun re-encode.

**Passo 5 — scrittura condizionale.** `cmd/tailscale/cli/cert.go:216-228`:

```go
func writeIfChanged(filename string, contents []byte, mode os.FileMode) (changed bool, err error) {
	if filename == "-" { Stdout.Write(contents); return false, nil }
	if old, err := os.ReadFile(filename); err == nil && bytes.Equal(contents, old) {
		return false, nil
	}
	if err := atomicfile.WriteFile(filename, contents, mode); err != nil { return false, err }
	return true, nil
}
```

`bytes.Equal` → **return anticipato senza aprire il file in scrittura**. Il file non viene toccato:
stesso inode, stesso mtime, stessi permessi.

Questo comportamento **non è recente né accidentale**: risale al commit `d5e1abd0c424` del
2021-08-18, *"cmd/tailscale/cli: only write cert file if it changed"* (Brad Fitzpatrick, updates
issue #1235), ed è presente identico in `eb67e5d` (= 1.102.2) e in `main`.

**Verdetto: la strategia "sostituzione solo su byte-diff" della mappa è solida.** Anzi, si può
irrobustire ulteriormente: invece di confrontare i byte, si può usare il fatto che i file **non
cambiano affatto** e triggerare su `mtime`/hash. Il confronto per contenuto resta comunque la scelta
più leggibile e più difensiva.

### Eccezioni e insidie da mettere nero su bianco nel playbook

Cinque casi in cui l'output **non** è identico. Vanno gestiti o esclusi per design.

1. **PKCS#12 (`.p12` / `.pfx`) — rompe tutto.** `cmd/tailscale/cli/cert.go:155-161`: se `--key-file`
   finisce in `.p12`/`.pfx`, il contenuto passa da `convertToPKCS12`, che chiama
   `pkcs12.Encode(rand.Reader, ...)` (`cert.go:234-254`). **Non deterministico**: byte diversi a ogni
   esecuzione → `writeIfChanged` riscriverebbe sempre → il job installerebbe un cert in NPM **ogni
   giorno**. NPM vuole PEM, quindi non è il nostro caso, ma va vietato esplicitamente.
2. **Percorsi di output relativi.** Senza `--cert-file`/`--key-file`, `cert.go:113-117` deriva i nomi
   dal dominio e li scrive **relativi alla CWD**. La config OCI dell'immagine pinnata ha
   `"WorkingDir": "/"`, quindi un `docker exec tailscale tailscale cert nome.ts.net` scriverebbe
   `/nome.ts.net.crt` nel **layer scrivibile del container** — perso alla ricreazione, e con esso il
   riferimento per il diff. **Passare sempre percorsi assoluti espliciti**, dentro il bind mount.
3. **Rinnovo appena avvenuto.** È il caso desiderato: byte diversi → sostituzione. Vedi §5.
4. **Perdita dello store.** Se `/volume1/docker/tailscale/certs` sparisce, la prima invocazione emette
   un cert nuovo (chiave privata nuova, `feature/acme/cert.go` genera sempre una ECDSA P-256 fresca a
   ogni emissione) → diff → sostituzione. Comportamento corretto, ma è anche un modo per bruciare
   quota LE se si distrugge il volume ripetutamente.
5. **Finestra di incoerenza durante il rinnovo (chiusa dal codice, ma va capita).**
   `feature/acme/certstore.go:164-169`, `WriteTLSCertAndKey` scrive **prima la chiave, poi il cert**,
   con due `atomicfile.WriteFile` distinti (`atomicfile/atomicfile.go:21-52`: tempfile + `Sync` +
   `Rename`). Ogni file è atomico da solo, ma **la coppia non lo è**: esiste un istante con chiave
   nuova e cert vecchio. Perché questo non ci danneggia: un lettore concorrente in quell'istante
   fallisce `tls.X509KeyPair` in `validCertPEM` → `errCertExpired` → `getCertPEMWithValidity` cade su
   `getCertPEM`, che come prima cosa fa `dm := e.lockDomain(domain); dm.Lock()`
   (`feature/acme/cert.go:314-316`) — lock già detenuto dalla goroutine che sta rinnovando per tutta
   la durata dell'emissione. Il lettore si blocca, poi rilegge una coppia coerente. **Non serve
   lock applicativo nel playbook**, ma non va nemmeno introdotto un timeout troppo aggressivo sul job:
   in quel frangente il comando può legittimamente attendere.

---

## 5. Exit code e output — distinguere "rinnovato" da "servito dalla cache"

**Risposta: l'exit code NON distingue i due casi. L'unico segnale affidabile è la riga di stdout,
che è esattamente il risultato del confronto byte-a-byte del §4 — quindi non aggiunge informazione
rispetto al confronto dei file, la conferma soltanto.**

`runCert` restituisce `nil` in entrambi i rami (`cmd/tailscale/cli/cert.go:139-175`): exit status 0
sia se ha scritto sia se non ha scritto. Diverso da zero solo su errore vero.

Il segnale testuale, `cert.go:147-150` e `:169-172`:

| Situazione | stdout |
|---|---|
| contenuto cambiato | `Wrote public cert to <path>` / `Wrote private key to <path>` |
| contenuto identico | `Public cert unchanged at <path>` / `Private key unchanged at <path>` |

Il flag `Cached bool` di `TLSCertKeyPair` esiste lato daemon (`ipn/ipnlocal/cert.go:20-24`, con il
commento *"whether result came from cache"*, valorizzato a `true` in `certstore.go:153`), ma
**non è esposto sull'API locale**: `serveKeyPair` scrive solo i PEM
(`ipn/localapi/cert.go:60-73`). La CLI non lo vede e non può riportarlo. **Non esiste quindi un flag
o un exit code dedicato.**

### La conseguenza più importante di questa sezione, e non è nel ticket

**Il rinnovo è asincrono: l'invocazione che lo innesca restituisce ancora il certificato VECCHIO.**
`feature/acme/cert.go:137-146`, con `minValidity == 0` (il nostro caso):

```go
if minValidity == 0 {
    logf("starting async renewal")
    // Start renewal in the background, return current valid cert.
    e.Go(func() { ... getCertPEM(...) ... })
    return pair, nil   // <-- il cert VECCHIO
}
```

Quindi la sequenza reale a novembre 2026 sarà:

- **Giorno N** (apertura finestra): il job gira, `tailscaled` avvia il rinnovo in background,
  la CLI stampa `unchanged`, il job non fa nulla. **Sembra un no-op ma non lo è.**
- **Giorno N+1**: la CLI legge dallo store il cert nuovo, stampa `Wrote ...`, il job rileva il
  byte-diff e installa in NPM.

Il ritardo è di **fino a ~24 ore**, contro una finestra di ~30 giorni: irrilevante per la sicurezza,
ma **essenziale per la procedura di test e per la lettura dei log**. Chi verificherà il rinnovo a
novembre deve sapere che la prima esecuzione "che non fa niente" è quella che ha innescato tutto, e
non concludere che il job è rotto. Va scritto nel runbook di G3.

Segnali diagnostici collaterali (utili in G3/G4a, non come trigger):

- Log di `tailscaled` (`docker logs tailscale`), prefissati `cert("<dominio>"): ` — `feature/acme/cert.go:106`.
  Righe attese: `starting async renewal`, `requesting cert...`, `got cert`, o
  `async renewal failed: getCertPem: ...`.
- Health warning `tls-cert-pending`: **inaffidabile come segnale di rinnovo**, perché
  `feature/acme/cert.go` lo alza solo `if previous == nil`, cioè solo alla **prima emissione** quando
  non c'è cert utilizzabile — deliberatamente non durante un rinnovo con cert valido in cache
  ("We don't fire the warning when previous is non-nil because then we have a working cert and the
  renewal is happening behind the scenes").
- Rate limit lato CA: se LE risponde 429, l'errore risale come tale
  (`client/local/cert.go:36-42`, `RateLimitRetryAfter`) e la CLI esce con errore. È il caso in cui il
  job **deve** allarmare.

---

## 6. Contesto container — dove finiscono i certificati

**Risposta: in `/var/lib/tailscale/certs/` dentro il container, cioè
`/volume1/docker/tailscale/certs/` sul NAS. Sopravvivono a riavvio E ricreazione del container.**

Catena completa, dal compose al filesystem:

1. `docker/tailscale/docker-compose.yaml:11` — `TS_STATE_DIR=/var/lib/tailscale`.
2. `cmd/containerboot/settings.go:110` — `StateDir: os.Getenv("TS_STATE_DIR")`.
3. `cmd/containerboot/tailscaled.go:78-79` — `case cfg.StateDir != "": args = append(args, "--statedir="+cfg.StateDir)`.
4. `cmd/tailscaled/tailscaled.go:219` — help di `--statedir`: *"path to directory for storage of config
   state, **TLS certs**, temporary incoming Taildrop files, etc."*
5. `cmd/tailscaled/tailscaled.go:400` — `o.VarRoot = args.statedir`; poi `:723` — `lb.SetVarRoot(opts.VarRoot)`.
6. `ipn/ipnlocal/local.go:6270-6283` — `TailscaleVarRoot()` restituisce `b.varRoot`.
7. `feature/acme/certstore.go:64-81` — `certDir()`: `full := filepath.Join(d, "certs")` +
   `os.MkdirAll(full, 0700)`.
8. `feature/acme/certstore.go:255-259` — nomi file: `<dominio>.crt` e `<dominio>.key`
   (per i wildcard, `*.` diventa `wildcard_.`).
9. `docker/tailscale/docker-compose.yaml:14` — bind mount `/volume1/docker/tailscale:/var/lib/tailscale`.

Quindi, per un nome macchina `dh4300plus-3562.<tailnet>.ts.net`:

```
/volume1/docker/tailscale/certs/dh4300plus-3562.<tailnet>.ts.net.crt   (0644)
/volume1/docker/tailscale/certs/dh4300plus-3562.<tailnet>.ts.net.key   (0600)
/volume1/docker/tailscale/certs/acme-account.key.pem                   (0600)
```

Permessi da `certstore.go:156-162` (`WriteCert` 0644, `WriteKey` 0600) e `:130-133`
(chiave account ACME 0600); directory 0700 da `certDir`. Il processo nel container è root, e
`/volume1` è root-owned sul NAS: coerente, ma significa che il job Semaphore deve avere privilegi
adeguati per leggerli (vedi T2).

**`network_mode: host` è irrilevante** per questa domanda: non influenza né lo state dir né il
percorso dei certificati. Influenza il raggiungimento del socket LocalAPI solo nel senso che non lo
influenza affatto — CLI e daemon vivono nello stesso container e parlano via socket unix.

Sul socket, dettaglio che può far perdere un'ora a chi scrive il playbook: containerboot **non** usa
il percorso di default del daemon. `cmd/containerboot/settings.go:123` —
`Socket: cmp.Or(os.Getenv("TS_SOCKET"), "/tmp/tailscaled.sock")`, mentre la CLI cerca per default
`/var/run/tailscale/tailscaled.sock` (`paths/paths.go:46-49`, via `cmd/tailscale/cli/cli.go:93`).
Il ponte lo mette containerboot stesso, `cmd/containerboot/main.go:466-482`:

```go
const defaultTailscaledSocketPath = "/var/run/tailscale/tailscaled.sock"
if cfg.Socket != "" && cfg.Socket != defaultTailscaledSocketPath {
    // "symlink it to the default location so that the CLI can find it without any extra flags"
    ... syscall.Symlink(cfg.Socket, defaultTailscaledSocketPath)
}
```

Quindi `docker exec tailscale tailscale cert ...` funziona senza flag. Ma il symlink è best-effort: in
caso di errore containerboot logga *"[warning] failed to symlink socket ... please use
`tailscale --socket=...`"*. Per robustezza, nel playbook conviene passare esplicitamente
`--socket=/tmp/tailscaled.sock`: è sempre corretto e non dipende dalla riuscita del symlink.

### Cosa NON è stato possibile verificare

**NON STABILITO — verifica live sul NAS.** Non ho accesso SSH da questo contesto
(`ssh nicholasizzo@192.168.0.36` → *Permission denied (publickey,password)*). Restano da confermare
sulla macchina reale, in sola lettura:

- `docker exec tailscale tailscale version` → conferma che il digest pinnato corrisponde davvero a
  1.102.2 in esecuzione (dedotto dall'annotazione OCI del registry, non osservato sul NAS).
- `docker exec tailscale ls -la /var/lib/tailscale/certs/` → conferma dell'esistenza dei file e del
  nome esatto del dominio.
- `docker exec tailscale tailscale status --json | jq .CertDomains` → conferma che HTTPS è abilitato
  sul tailnet (`resolveCertDomain` fallisce con *"your Tailscale account does not support getting TLS
  certs"* se `CertDomains` è vuoto, `feature/acme/cert.go:645-647`).
- `openssl x509 -in <cert> -noout -dates` → conferma della finestra reale e quindi della data del
  primo rinnovo.

Questi punti appartengono comunque a **R3** (stato reale del NAS), non a R2.

---

## Implicazioni per la mappa

### La cadenza giornaliera è sicura rispetto ai rate limit? Sì, senza riserve.

Su ~365 esecuzioni annue, quelle che parlano con Let's Encrypt sono: **~4 emissioni** (una per
rinnovo, tutte coperte dall'esenzione ARI *"exempt from all rate limits"*) più **una manciata di GET
`/renewalInfo`**, una per riavvio di `tailscaled` grazie alla memoizzazione `renewCertAt`. Il limite
più stretto che ci riguarda — 5 certificati per set esatto di identificatori ogni 7 giorni — resta
inutilizzato di un fattore ~100. Anche nello scenario patologico di un rinnovo che fallisce ogni
giorno per un mese, tutti i limiti reggono.

Due condizioni perché questo resti vero, entrambe da scrivere nel playbook:

- **Non passare `--min-validity`.** Il default 0 delega ad ARI. Un `--min-validity` maggiore della
  vita del certificato trasformerebbe il job in una macchina per esaurire la quota LE (§3).
- **Non usare output `.p12`/`.pfx`.** Renderebbe l'output non deterministico e il diff sempre vero
  (§4, insidia 1) — non per i rate limit, ma per NPM.

### La strategia byte-diff regge? Sì, ed è più forte del previsto.

Il no-op non produce un file identico: **non produce alcun file**. `writeIfChanged` confronta i byte e
ritorna prima di aprire il descrittore in scrittura, quindi mtime e inode restano invariati. La catena
dal disco all'output è pass-through puro — `os.ReadFile` → stesso puntatore → `w.Write` raw → slicing
→ `bytes.Equal`. Nessun punto in cui possa infilarsi un timestamp, un riordino di catena o una
ri-serializzazione PEM. Il comportamento è stabile dal 2021 (commit `d5e1abd0c424`) e identico fra la
versione in produzione e `main`.

### Tre cose che la mappa non sa ancora e che dovrebbe assorbire

1. **Il cron è l'unico motore di rinnovo, non un guardiano.** Senza `ServeConfig` HTTPS il loop
   interno di `tailscaled` (`refresh.go:36`) non parte. Se il job Semaphore muore in silenzio, nessuno
   rinnova. Questo alza l'importanza di G4a: il monitor di scadenza non è un di più, è la rete di
   sicurezza dell'unico meccanismo esistente. (Se G1 optasse per `tailscale serve`, la premessa cade.)
2. **Il rinnovo è asincrono: la prima esecuzione nella finestra restituisce ancora il cert vecchio.**
   L'installazione avviene il giorno dopo. Il runbook di test di G3 deve dirlo, altrimenti chi
   osserverà novembre 2026 concluderà erroneamente che il job non ha funzionato.
3. **La finestra "~30 giorni" ha una data di scadenza: 10 febbraio 2027.** Da lì il profilo `classic`
   di LE passa a 64 giorni e il rinnovo si sposta a ~21 giorni dalla scadenza (poi ~15 dal 2028). Le
   soglie di allarme di G4a vanno espresse tenendone conto — meglio ~10 giorni che ~25 — o
   quantomeno annotate come da rivedere a quelle due date.

---

## Indice delle fonti

**Sorgente Tailscale** — tutti a `github.com/tailscale/tailscale` rev `eb67e5dcbe145d63e1128b9b4b630f8a82da101f` (v1.102.2):

- `cmd/tailscale/cli/cert.go` — `runCert` (:59-176), flag `--min-validity` (:45), default path (:113-117),
  PKCS#12 (:155-161, :230-254), `writeIfChanged` (:216-228)
- `feature/acme/cert.go` — `getCertPEMWithValidity` (:81-162), `shouldStartDomainRenewal` (:168-199),
  `domainRenewalTimeByExpiry` (:202-220), `domainRenewalTimeByARI` (:275-308), `getCertPEM` (:314-...),
  ARI `replaces` (:370-374), `resolveCertDomain` (:645-...)
- `feature/acme/certstore.go` — `certDir` (:64-81), `certFileStore.Read` (:135-154),
  `WriteCert`/`WriteKey`/`WriteTLSCertAndKey` (:156-169), `keyFile`/`certFile` (:255-259),
  `validCertPEM` (:411-434)
- `feature/acme/refresh.go` — `certRefreshInterval` (:21), `updateCertRefreshLoop` (:35-49),
  `serveConfigUsesACMECerts` (:134-154)
- `feature/acme/cert_test.go` — `TestShouldStartDomainRenewal` (:559-...), `TestGetCertPEMWithValidity` (:660-...)
- `ipn/ipnlocal/cert.go` — `TLSCertKeyPair` con campo `Cached` (:20-24)
- `ipn/localapi/cert.go` — `serveCert` / `serveKeyPair` (:24-73)
- `client/local/cert.go` — `CertPairWithValidity` (:117-140), `RateLimitRetryAfter` (:36-42),
  nota sul rate limit di `SetDNS` (:62-71)
- `tempfork/acme/acme.go` — `FetchRenewalInfo` (:263-297); `tempfork/acme/types.go` — `WithOrderProfile` (:410-416)
- `cmd/tailscaled/tailscaled.go` — `--statedir` (:219), `o.VarRoot` (:400), `SetVarRoot` (:723)
- `ipn/ipnlocal/local.go` — `TailscaleVarRoot` (:6265-6283)
- `cmd/containerboot/settings.go` (:110, :123), `cmd/containerboot/tailscaled.go` (:68-81),
  `cmd/containerboot/main.go` (:466-482)
- `atomicfile/atomicfile.go` — `WriteFile` (:21-52)
- `paths/paths.go` — `DefaultTailscaledSocket` (:24-50)
- `build_docker.sh` (:51-64)
- Commit storico `d5e1abd0c424` (2021-08-18) — *"cmd/tailscale/cli: only write cert file if it changed"*

**Sorgente Let's Encrypt (Boulder)**

- `github.com/letsencrypt/boulder`, `core/objects.go` — `RenewalInfoSimple` / `RenewalInfoImmediate` /
  `SuggestedWindow` (:430-485)
- `github.com/letsencrypt/boulder`, `wfe2/wfe.go` — `determineARIWindow` (:2201-2242), `RenewalInfo` (:2793-2824)

**Documentazione**

- <https://letsencrypt.org/docs/rate-limits/> — limiti e sezione "Limit Exemptions for Renewals"
- <https://letsencrypt.org/2025/12/02/from-90-to-45> — calendario delle durate (45 g `tlsserver` dal
  2026-05-13; `classic` 64 g dal 2027-02-10, 45 g dal 2028-02-16)
- <https://tailscale.com/kb/1153/enabling-https> — durata 90 giorni, responsabilità del rinnovo lato
  utente per i cert ottenuti con `tailscale cert`
- Docker Hub registry API — index OCI del digest pinnato (`image.version` 1.102.2,
  `image.revision` eb67e5d, created 2026-07-31) e config dell'immagine arm64 (`WorkingDir: "/"`)
