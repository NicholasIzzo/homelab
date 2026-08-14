import { useMutation, useQueryClient } from '@tanstack/react-query';

import { ElencoParziale, Riga, SezioneMonitor } from '../components/Monitor.tsx';
import { Barra, COLORE, Glifo, Pill, Tessera } from '../components/Stati.tsx';
import { api } from '../lib/api.ts';
import {
  formattaByte,
  formattaCentesimi,
  formattaDataOra,
  formattaGiorni,
  formattaOre,
  tempoRelativo,
} from '../lib/format.ts';
import type {
  BackupPayload,
  Container,
  DisksPayload,
  DockerPayload,
  Status,
  TlsPayload,
  UptimePayload,
} from '../lib/types.ts';
import { bandaScadenza, useDeadlines } from '../lib/useDeadlines.ts';
import { useFinance } from '../lib/useFinance.ts';
import { trova, useMonitors, useMonitorStream } from '../lib/useMonitors.ts';

export function Stato() {
  useMonitorStream();
  const { data, isLoading, isError } = useMonitors();
  const scadenze = useDeadlines();
  const finanze = useFinance();
  const qc = useQueryClient();

  const refresh = useMutation({
    mutationFn: () => api<{ ok: boolean }>('/monitors/refresh', { method: 'POST' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['monitors'] }),
  });

  const monitors = data?.monitors;
  const dischi = trova<DisksPayload>(monitors, 'disks');
  const docker = trova<DockerPayload>(monitors, 'docker');
  const backup = trova<BackupPayload>(monitors, 'backup');
  const tls = trova<TlsPayload>(monitors, 'tls');
  const uptime = trova<UptimePayload>(monitors, 'uptime');

  if (isLoading) return <p className="corpo py-10 text-center">Caricamento…</p>;
  if (isError) {
    return (
      <p className="card border-crit/50 bg-crit/12 p-4 text-[13px] text-crit">
        Backend non raggiungibile.
      </p>
    );
  }

  const listaDischi = dischi?.payload?.disks ?? [];
  const listaContainer = docker?.payload?.containers ?? [];
  const listaServizi = uptime?.payload?.monitors ?? [];

  const dischiGuasti = listaDischi.filter((d) => d.device_status !== 0);
  const containerCritici = listaContainer.filter((c) => c.status === 'crit');
  const containerAttenzione = listaContainer.filter((c) => c.status === 'warn');
  const serviziGiu = listaServizi.filter((m) => m.status === 'crit');
  const scadenzeUrgenti = (scadenze.data?.deadlines ?? []).filter(
    (d) => d.due_date && bandaScadenza(d).status !== 'ok',
  );

  const critici =
    dischiGuasti.length +
    containerCritici.length +
    serviziGiu.length +
    (backup?.status === 'crit' ? 1 : 0) +
    (tls?.status === 'crit' ? 1 : 0) +
    scadenzeUrgenti.filter((d) => bandaScadenza(d).status === 'crit').length;

  const attenzione =
    containerAttenzione.length +
    (backup?.status === 'warn' ? 1 : 0) +
    (tls?.status === 'warn' ? 1 : 0) +
    scadenzeUrgenti.filter((d) => bandaScadenza(d).status === 'warn').length;

  const globale: Status = critici > 0 ? 'crit' : attenzione > 0 ? 'warn' : 'ok';

  return (
    <>
      <Riepilogo critici={critici} attenzione={attenzione} globale={globale} />

      <div className="mb-2.5 grid grid-cols-2 gap-2.5">
        <Tessera
          etichetta="Container"
          valore={
            docker?.payload ? `${docker.payload.in_esecuzione}/${docker.payload.totale}` : '—'
          }
          nota={
            containerCritici.length + containerAttenzione.length > 0
              ? `${containerCritici.length + containerAttenzione.length} da guardare`
              : 'tutti regolari'
          }
          status={docker?.status ?? 'unknown'}
        />
        <Tessera
          etichetta="Dischi"
          valore={`${listaDischi.length - dischiGuasti.length}/${listaDischi.length || '—'}`}
          nota={dischiGuasti.length > 0 ? `${dischiGuasti[0]!.name} in guasto` : 'SMART ok'}
          status={dischi?.status ?? 'unknown'}
        />
        <Tessera
          etichetta="Servizi"
          valore={uptime?.payload ? `${uptime.payload.up}/${uptime.payload.totale}` : '—'}
          nota={serviziGiu.length > 0 ? `${serviziGiu[0]!.name} non risponde` : 'tutti raggiungibili'}
          status={uptime?.status ?? 'unknown'}
        />
        <Tessera
          etichetta="Backup"
          valore={
            backup?.payload?.age_hours !== null && backup?.payload
              ? `${Math.round(backup.payload.age_hours ?? 0)} h`
              : '—'
          }
          nota={backup?.payload?.exit_code === 0 ? 'ultimo esito ok' : 'ultimo esito in errore'}
          status={backup?.status ?? 'unknown'}
        />
      </div>

      {dischiGuasti.map((d) => (
        <section key={d.wwn} className="card mb-2.5 border-crit/50 bg-crit/12 p-4" role="alert">
          <div className="flex items-center gap-2">
            <Glifo status="crit" size={12} />
            <h2 className="text-[13px] font-bold text-crit">
              Disco {d.name} in guasto — RMA da avviare
            </h2>
          </div>
          <p className="corpo mt-1">
            {d.model} · {formattaByte(d.capacity_bytes)}
          </p>

          <ul className="mt-3 grid grid-cols-2 gap-2">
            {d.attrs.map((a) => (
              <li
                key={a.id}
                className={`rounded-lg border px-2.5 py-2 ${
                  a.critico ? 'border-crit/50 bg-crit/12' : 'border-line bg-surface'
                }`}
              >
                <p className="etichetta">{a.label}</p>
                <p className={`valore mt-1 ${a.critico ? 'text-crit' : 'text-ink'}`}>{a.raw}</p>
              </li>
            ))}
          </ul>

          <p className="nota mt-3">
            {d.temp_c !== null ? `${d.temp_c} °C · ` : ''}
            {formattaOre(d.power_on_hours)} · rilevato {tempoRelativo(d.collected_at)}
          </p>
        </section>
      ))}

      {containerCritici.length + containerAttenzione.length + serviziGiu.length > 0 ? (
        <section className="card mb-2.5 p-4">
          <h2 className="titolo-card mb-2.5">Da guardare</h2>
          <ul className="space-y-2">
            {serviziGiu.map((m) => (
              <li key={`s-${m.name}`} className="flex items-center gap-2.5">
                <Glifo status="crit" size={9} />
                <span className="min-w-0 flex-1 truncate text-[13px]">{m.name}</span>
                <span className="nota shrink-0">non risponde</span>
              </li>
            ))}
            {[...containerCritici, ...containerAttenzione].map((c) => (
              <li key={`c-${c.name}`} className="flex items-center gap-2.5">
                <Glifo status={c.status} size={9} />
                <span className="min-w-0 flex-1 truncate text-[13px]">{c.name}</span>
                <span className="nota shrink-0">{c.label}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {scadenzeUrgenti.length > 0 ? (
        <section className="card mb-2.5 p-4">
          <h2 className="titolo-card mb-2.5">Scadenze imminenti</h2>
          <ul className="space-y-2">
            {scadenzeUrgenti.slice(0, 5).map((d) => {
              const { status, giorni } = bandaScadenza(d);
              return (
                <li key={d.id} className="flex items-center gap-2.5">
                  <Glifo status={status} size={9} />
                  <span className="min-w-0 flex-1 truncate text-[13px]">{d.title}</span>
                  <span className={`nota tabular shrink-0 ${COLORE[status].testo}`}>
                    {giorni !== null ? formattaGiorni(giorni) : '—'}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {finanze.data && finanze.data.budget.amount_cents > 0 ? (
        <section className="card mb-2.5 p-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="titolo-card">Budget del mese</h2>
            <span className="nota tabular">
              {formattaCentesimi(finanze.data.budget.spent_cents)} di{' '}
              {formattaCentesimi(finanze.data.budget.amount_cents)}
            </span>
          </div>
          <div className="mt-2.5">
            <Barra
              percento={finanze.data.budget.percent}
              status={
                finanze.data.budget.remaining_cents < 0
                  ? 'crit'
                  : finanze.data.budget.percent > 80
                    ? 'warn'
                    : 'ok'
              }
            />
          </div>
        </section>
      ) : null}

      <SezioneMonitor
        stato={docker}
        titolo="Container NAS"
        riepilogo={
          docker?.payload ? `${docker.payload.in_esecuzione}/${docker.payload.totale} attivi` : undefined
        }
      >
        <ElencoParziale
          voci={ordina(listaContainer)}
          problemi={ordina([...containerCritici, ...containerAttenzione])}
          etichettaTutti={`Mostra tutti i container (${listaContainer.length})`}
          render={(gruppo) =>
            gruppo.length === 1 ? (
              <Riga
                key={gruppo[0]!.name}
                status={gruppo[0]!.status}
                nome={gruppo[0]!.name}
                dettaglio={gruppo[0]!.image}
                destra={
                  <>
                    {gruppo[0]!.label}
                    {gruppo[0]!.restarts > 0 ? (
                      <span className="block">{gruppo[0]!.restarts} riavvii</span>
                    ) : null}
                  </>
                }
              />
            ) : (
              <li key="mullvad" className="border-t border-line/70 px-4 py-2.5 first:border-t-0">
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <Glifo status={peggiore(gruppo)} size={9} />
                  <span className="text-[13px]">Stack Mullvad</span>
                  <Pill status="warn">aggiornare solo insieme</Pill>
                </div>
                <ul className="ml-4 space-y-1">
                  {gruppo.map((c) => (
                    <li key={c.name} className="nota flex items-center gap-2">
                      <Glifo status={c.status} size={8} />
                      <span className="flex-1 truncate">{c.name}</span>
                      <span>{c.label}</span>
                    </li>
                  ))}
                </ul>
              </li>
            )
          }
        />
      </SezioneMonitor>

      <SezioneMonitor
        stato={dischi}
        titolo="Dischi"
        riepilogo={dischi?.payload ? `${listaDischi.length} unita'` : undefined}
      >
        <ul>
          {listaDischi.map((d) => (
            <Riga
              key={d.wwn}
              status={d.status}
              nome={`${d.name} — ${d.model}`}
              dettaglio={`${formattaByte(d.capacity_bytes)} · ${formattaOre(d.power_on_hours)}`}
              destra={
                <>
                  {d.temp_c !== null ? `${d.temp_c} °C` : '—'}
                  <span className="block">
                    {d.device_status === 0 ? 'SMART ok' : 'SMART fallito'}
                  </span>
                </>
              }
            />
          ))}
        </ul>
      </SezioneMonitor>

      <SezioneMonitor
        stato={backup}
        titolo="Backup Restic"
        riepilogo={backup?.payload ? tempoRelativo(backup.payload.last_run) : undefined}
      >
        <div className="px-4 pb-3">
          {backup?.payload ? (
            <>
              <p className="corpo">Ultima esecuzione {formattaDataOra(backup.payload.last_run)}</p>
              <p className="nota mt-0.5">
                {backup.payload.age_hours} ore fa · esito{' '}
                {backup.payload.exit_code === 0 ? 'ok' : `errore ${backup.payload.exit_code}`}
              </p>
            </>
          ) : (
            <p className="nota">Nessun dato.</p>
          )}
        </div>
      </SezioneMonitor>

      <SezioneMonitor
        stato={tls}
        titolo="Certificato TLS Vaultwarden"
        riepilogo={tls?.payload?.days_remaining != null ? `${tls.payload.days_remaining} gg` : undefined}
      >
        <div className="px-4 pb-3">
          {tls?.payload ? (
            <>
              <p className="corpo truncate">{tls.payload.servername}</p>
              <p className="nota mt-0.5">
                Scade il {formattaDataOra(tls.payload.valid_to)} · emesso da{' '}
                {tls.payload.issuer ?? '—'}
              </p>
            </>
          ) : (
            <p className="nota">Nessun dato.</p>
          )}
        </div>
      </SezioneMonitor>

      <SezioneMonitor
        stato={uptime}
        titolo="Servizi"
        riepilogo={uptime?.payload ? `${uptime.payload.up}/${uptime.payload.totale} su` : undefined}
      >
        <ElencoParziale
          voci={listaServizi}
          problemi={serviziGiu}
          etichettaTutti={`Mostra tutti i servizi (${listaServizi.length})`}
          render={(m) => (
            <Riga
              key={m.name}
              status={m.status}
              nome={m.name}
              dettaglio={m.target}
              destra={m.response_ms !== null ? `${m.response_ms} ms` : m.label}
            />
          )}
        />
      </SezioneMonitor>

      <button
        type="button"
        onClick={() => refresh.mutate()}
        disabled={refresh.isPending}
        className="card nota mb-2 w-full py-3 font-medium active:bg-surface-2 disabled:opacity-50"
      >
        {refresh.isPending ? 'Aggiornamento…' : 'Aggiorna adesso'}
      </button>
      {refresh.isError ? (
        <p className="nota text-center text-warn">
          Aggiornamento troppo frequente: riprova fra qualche secondo.
        </p>
      ) : null}
    </>
  );
}

/** Il colpo d'occhio: una riga sola deve bastare a decidere se aprire il resto. */
function Riepilogo({
  critici,
  attenzione,
  globale,
}: {
  critici: number;
  attenzione: number;
  globale: Status;
}) {
  const c = COLORE[globale];

  return (
    <section className={`card mb-2.5 border p-4 ${c.bordo} ${c.sfondo}`}>
      <div className="flex items-center gap-3">
        <Glifo status={globale} size={22} />
        <div className="min-w-0">
          {globale === 'ok' ? (
            <p className="valore text-ok">Tutto sotto controllo</p>
          ) : (
            <p className={`valore-xl ${c.testo}`}>
              {critici > 0 ? critici : attenzione}
              <span className="valore ml-2 font-medium text-ink">
                {critici > 0
                  ? critici === 1
                    ? 'problema critico'
                    : 'problemi critici'
                  : attenzione === 1
                    ? 'voce da verificare'
                    : 'voci da verificare'}
              </span>
            </p>
          )}
        </div>
      </div>

      <p className="corpo mt-2">
        {globale === 'ok'
          ? 'Nessuna anomalia su container, dischi, servizi, backup e certificato.'
          : critici > 0 && attenzione > 0
            ? `Inoltre ${attenzione} ${attenzione === 1 ? 'voce' : 'voci'} da verificare, meno urgenti.`
            : critici > 0
              ? 'Nient’altro richiede attenzione.'
              : 'Nessun problema critico.'}
      </p>
    </section>
  );
}

/** I container dello stack Mullvad viaggiano insieme, il resto e' individuale. */
function ordina(containers: Container[]): Container[][] {
  const gruppo = containers.filter((c) => c.group === 'mullvad');
  const singoli = containers.filter((c) => c.group !== 'mullvad').map((c) => [c]);
  return gruppo.length > 0 ? [gruppo, ...singoli] : singoli;
}

function peggiore(containers: Container[]): Status {
  if (containers.some((c) => c.status === 'crit')) return 'crit';
  if (containers.some((c) => c.status === 'warn')) return 'warn';
  return 'ok';
}
