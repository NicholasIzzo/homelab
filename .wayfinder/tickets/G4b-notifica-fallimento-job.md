---
id: G4b
title: Notifica di fallimento del job Semaphore
labels: [wayfinder:grilling]
status: open
assignee:
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
