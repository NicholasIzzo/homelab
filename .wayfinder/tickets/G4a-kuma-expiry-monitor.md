---
id: G4a
title: Monitor di scadenza cert in Uptime Kuma
labels: [wayfinder:grilling]
status: closed
assignee: claude+nicholas
blocked-by: [T1]
map: ../map.md
---

## Question

Come Uptime Kuma sorveglia la **scadenza del certificato**, indipendentemente da chi o cosa
avrebbe dovuto rinnovarlo.

Questo è il guasto che conta davvero: se il job non parte mai, nessun allarme di fallimento
scatta — perché non c'è fallimento, c'è assenza. Lo si scopre ~90 giorni dopo, quando il cert
scade e Vaultwarden smette di rispondere, cioè nel momento in cui serve una password. G4a copre
"il job non è mai partito"; il suo gemello G4b copre "è partito ed è andato male". Sono guasti
diversi e vanno sorvegliati separatamente: è stata una decisione esplicita, non ridondanza.

Da decidere:

1. **Cosa si monitora.** L'endpoint TLS di Vaultwarden su `:44075`, o il certificato in sé per
   sé? Il primo copre anche "NPM è giù", il secondo isola la scadenza.
2. **Soglia di preavviso.** A quanti giorni dalla scadenza si viene avvisati. Va scelta in
   relazione alla finestra di rinnovo che R2 stabilisce: avvisare *prima* che il rinnovo sia
   possibile genera allarmi su cui non si può agire, e allarmi su cui non si può agire vengono
   ignorati.
3. **Raggiungibilità.** Uptime Kuma gira sullo stesso NAS del servizio che sorveglia. Riesce a
   raggiungere l'endpoint Tailscale dall'interno? E se il NAS intero è giù, chi sorveglia il
   sorvegliante — o si accetta esplicitamente questo limite?
4. **Canale.** Le Note della mappa fissano SMTP Office365. Qui si decide solo come Kuma lo usa e
   con quale escalation al ridursi dei giorni.
5. **Il caso "cert rinnovato ma non installato".** Se il cert emesso da Tailscale è fresco ma
   quello servito da NPM è vecchio, un monitor sull'endpoint TLS lo vede — un monitor sui file no.
   È lo scenario di guasto più probabile dell'intera automazione: assicurati che la scelta al
   punto 1 lo copra.

**Alzato di priorità da [R2](R2-tailscale-cert-renewal.md).** Il cron non affianca un rinnovo
automatico di `tailscaled`: con NPM davanti **è l'unico motore di rinnovo**. Non esiste quindi
alcuna rete sotto il job, e questo monitor smette di essere una ridondanza prudente per diventare
**l'unica difesa** contro "il job non è mai partito". Decidilo con quel peso.

Nota per il punto 2: la soglia di preavviso va tarata su una finestra che **cambia nel tempo** —
~30 giorni oggi, ma ~21 dal 2027-02-10, quando il profilo `classic` di Let's Encrypt passa a 64
giorni di vita. Una soglia scelta oggi troppo vicina al limite diventerà silenziosamente sbagliata.

Chiama `grilling` e `domain-modeling`.

---

## Risoluzione

**Priorità alta, non opzionale** — confermato esplicitamente durante il grilling: con NPM davanti
a Vaultwarden il refresh loop interno di tailscaled non parte mai
([R2](R2-tailscale-cert-renewal.md)), quindi il cron Semaphore è l'**unico** motore di rinnovo, e
questo monitor è l'unica rete di sicurezza contro "il job non è mai partito".

1. **Cosa monitorare**: l'**endpoint TLS live** (`https://192.168.0.36:44075/`), non i file —
   unico modo di coprire lo scenario più probabile, "rinnovato da Tailscale ma non ancora installato
   in NPM".
2. **Soglia: 10 giorni**, come suggerito esplicitamente da R2 — resta sotto tutte le finestre di
   rinnovo future (~30gg oggi, ~21gg dal 2027-02-10, ~15gg dal 2028-02-16), senza bisogno di essere
   mai rivista.
3. **Raggiungibilità**: IP LAN (`192.168.0.36`) invece del nome Tailscale, perché Kuma gira su
   bridge Docker senza risoluzione MagicDNS (verificato nel compose). `Ignore TLS Error` attivo per
   il mismatch di hostname atteso — non impedisce la lettura della scadenza del certificato.
4. **Canale**: stessa notifica SMTP Office365 già in uso per Grafana, nessuna escalation aggiuntiva.
5. **Limite accettato esplicitamente**: il NAS non sorveglia sé stesso. Idea futura a bassa
   priorità (monitor esterno tipo Uptime Robot/healthchecks.io) annotata, non implementata — fuori
   perimetro (la mappa esclude l'esposizione a internet).

Istruzioni passo-passo in `ansible/tailscale-cert-renewal/docs/kuma-setup.md`, incluse la verifica
periodica che il monitor legga davvero il certificato. Configurazione nella UI di Kuma non eseguita
in questa sessione (HITL).
