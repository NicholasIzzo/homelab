# Setup manuale — monitor di scadenza certificato in Uptime Kuma

Istruzioni passo-passo per configurare l'unica rete di sicurezza contro
"il job di rinnovo non è mai partito" — corrisponde alle decisioni di
[G4a](../../../.wayfinder/tickets/G4a-kuma-expiry-monitor.md). Non
automatizzato di proposito: nessun file di questo repo configura Kuma da
solo, va fatto una volta nella UI.

**Perché questo monitor non è opzionale**: con NPM davanti a Vaultwarden,
il refresh loop interno di `tailscaled` non parte mai (R2 — serve una
`ServeConfig` HTTPS che qui non esiste). Il job Semaphore è quindi l'unico
motore di rinnovo. Se muore in silenzio, nessun'altra parte del sistema se
ne accorge da sola: questo monitor è quella parte.

## 1. Crea il monitor

Nella UI di Uptime Kuma (`http://<NAS_IP>:3002`):

1. **Add New Monitor**
2. **Monitor Type**: `HTTP(s)`
3. **Friendly Name**: `Vaultwarden — scadenza certificato`
4. **URL**: `https://192.168.0.36:44075/`

   Non usare il nome Tailscale (`dh4300plus-fix.taile39e4f.ts.net`): Kuma
   gira in un container su bridge Docker di default (verificato nel
   compose, nessun `network_mode: host`), senza risoluzione MagicDNS. La
   porta 44075 è comunque pubblicata da NPM direttamente sull'host (T1/B4),
   quindi l'IP LAN raggiunge lo stesso identico listener TLS.

5. **Ignore TLS Error**: **attivo**

   Necessario perché il certificato ha CN/SAN per il nome Tailscale, non
   per l'IP `192.168.0.36` — la validazione completa del client
   segnalerebbe sempre un mismatch di hostname, permanente e atteso, non
   un guasto reale. L'estrazione della data di scadenza funziona comunque:
   Kuma legge il certificato presentato dal server indipendentemente
   dall'esito della validazione hostname.
6. **Heartbeat Interval**: a scelta (es. 60 minuti — non è il segnale che
   conta qui, quello vero è la notifica di scadenza al punto 3)

## 2. Abilita la notifica di scadenza certificato

Nella stessa schermata del monitor, sezione avanzata:

1. Attiva **Certificate Expiry Notification**
2. Soglia: **10 giorni**

   Non un valore arbitrario: R2 lo suggerisce esplicitamente. La finestra
   di rinnovo si restringe nel tempo (~30gg oggi, con i profili Let's
   Encrypt che si accorciano: ~21gg dal 2027-02-10, ~15gg dal
   2028-02-16). Una soglia troppo vicina al limite attuale (es. 25gg)
   diventerebbe un falso allarme permanente una volta ristretta la
   finestra futura. 10 giorni resta sotto tutte e tre le finestre senza
   bisogno di essere mai rivista, con margine reale per intervenire a
   mano prima della scadenza vera.

## 3. Collega la notifica email

Se non esiste già una Notification SMTP in Kuma:

1. **Settings → Notifications → Setup Notification**
2. Tipo: **Email (SMTP)**
3. Stesse credenziali già in uso per Grafana (`docker/grafana/.env`):
   - Host: `smtp.office365.com`, porta `587`, STARTTLS
   - Username/From: `nicholas.izzo01@outlook.com`
4. Salva, poi torna sul monitor creato al punto 1 e aggancia questa
   notifica (checkbox nella sezione Notifications del monitor).

Un solo canale, nessuna escalation aggiuntiva — coerente con la scelta già
fissata nelle Note di `map.md` (Telegram resta l'upgrade path se l'email
si dimostrasse insufficiente, non implementato qui senza un segnale
concreto che serva).

## 4. Verifica che il monitor legga davvero il certificato

Subito dopo il setup, e poi **una volta l'anno** (promemoria a mano, non
c'è un job che lo controlla): apri Kuma → questo monitor → cronologia
scadenza (badge o grafico "Cert Exp." nella pagina di dettaglio). Deve
mostrare una data plausibile (vicina a novembre 2026, poi la prossima
scadenza dopo ogni rinnovo). Se mostra `n/a` o un valore incoerente,
`Ignore TLS Error` potrebbe essersi disattivato (es. dopo un aggiornamento
di Kuma) o l'URL potrebbe essere cambiato — non aspettare la prossima
scadenza per scoprirlo.

## Limite noto, accettato esplicitamente

Questo monitor gira sullo stesso NAS del servizio che sorveglia: se il NAS
intero è giù, non se ne accorge nessuno da qui dentro. Non risolto in
questa mappa — è un limite dichiarato, non un buco dimenticato.

**Se un giorno si vorrà coprirlo** (priorità bassa, non decisa né
programmata ora): un monitor esterno all'infrastruttura di casa — es.
Uptime Robot o healthchecks.io — che verifica dall'esterno la
raggiungibilità dell'endpoint. Richiederebbe esporre qualcosa a internet o
un heartbeat in uscita dal NAS verso un servizio esterno: una scelta con
implicazioni di sicurezza sue proprie, fuori perimetro rispetto a questa
mappa (che esclude esplicitamente l'esposizione a internet — vedi "Out of
scope" in `map.md`). Da riconsiderare come sforzo a sé, se mai servisse.
