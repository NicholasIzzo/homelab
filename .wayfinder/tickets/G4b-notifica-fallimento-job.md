---
id: G4b
title: Notifica di fallimento del job Semaphore
labels: [wayfinder:grilling]
status: closed
assignee: claude+nicholas
blocked-by: [G2]
map: ../map.md
---

## Question

Come il job di rinnovo segnala di **essere girato e di essere andato male**. È il gemello di
G4a — che copre "non è mai partito" — e va deciso separatamente perché vive in un sistema
diverso: qui Semaphore, là Uptime Kuma.

Da decidere:

1. **Cosa conta come fallimento.** Con esecuzione giornaliera e cert valido, il caso normale è il
   no-op: quello **non** è un fallimento e non deve notificare nulla. Vanno distinti almeno:
   no-op riuscito, rinnovo riuscito, errore di emissione, errore di installazione, reload fallito.
   Solo alcuni meritano una email.
2. **Il fallimento silenzioso.** Uno script che esce 0 quando non dovrebbe è invisibile a
   qualunque notifica basata su exit code. Quali asserzioni deve fare il playbook su sé stesso
   perché un guasto si traduca davvero in exit non-zero?
3. **Meccanismo in Semaphore.** Notifiche native del task, o il playbook che manda l'email da sé?
   Il primo è meno codice ma segnala solo il fallimento del task nel suo complesso; il secondo
   può dire *cosa* è fallito. Verifica cosa offre `semaphoreui/semaphore:v2.19.7`.
4. **Contenuto della notifica.** Cosa deve contenere per essere azionabile alle 3 di notte senza
   aprire Semaphore: quale host, quale passo, cosa è stato tentato, e soprattutto **se il servizio
   è attualmente su o giù**.
5. **Rumore.** Se il rinnovo fallisce, fallirà probabilmente anche i giorni successivi: 30 email
   identiche prima della scadenza. Serve deduplica o escalation, o si accetta il rumore in cambio
   della semplicità?
6. **Fragilità del canale.** Lo SMTP Office365 è password-based e morirebbe in silenzio se
   Microsoft imponesse OAuth2. Va rilevato — un canale d'allarme rotto è indistinguibile dal
   silenzio di "tutto bene" — o si accetta il rischio e si segna Telegram come upgrade path?

Chiama `grilling` e `domain-modeling`.

---

## Risoluzione

1. **Cosa notifica**: solo gli stati `error` e `rollback` (dei 5 fissati durante il grilling di T2:
   `nochange`/`pending`/`renewed`/`error`/`rollback`) — gli altri tre sono già "va tutto bene" per
   costruzione, niente email su un run normale.
2. **Fallimento silenzioso**: `set -euo pipefail` nello script remoto, asserzioni esplicite
   (byte-diff post-scrittura, verifica del certificato live post-reload), e un `trap` su `EXIT` che
   garantisce comunque una riga `RESULT:` anche in caso di crash imprevisto — nessun percorso può
   uscire 0 in silenzio.
3. **Meccanismo**: il playbook manda l'email da sé (`community.general.mail`), non la notifica
   nativa del task Semaphore — una notifica nativa vedrebbe solo l'exit code del task, perdendo
   l'informazione strutturata della riga `RESULT:`, che è appunto il motivo per cui quel formato
   esiste (deciso in T2, ripreso qui).
4. **Contenuto**: hostname, stato, messaggio, output completo dello script, e un controllo live del
   certificato eseguito **al momento della notifica** (non riciclato) — risponde subito a "il
   servizio è su o giù ORA".
5. **Rumore**: accettato senza deduplica — un'email per ogni run fallito, volume basso a cadenza
   giornaliera su un solo servizio.
6. **Fragilità SMTP**: rischio accettato esplicitamente, fuori scope rilevarlo (richiederebbe un
   secondo canale indipendente); Telegram resta l'upgrade path già scritto nelle Note della mappa.

Implementato in `ansible/tailscale-cert-renewal/playbook.yml`.
