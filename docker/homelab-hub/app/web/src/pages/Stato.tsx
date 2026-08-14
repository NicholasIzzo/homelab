import { useMutation, useQueryClient } from '@tanstack/react-query';

import { Pill, Punto, Riga, SezioneMonitor } from '../components/Monitor.tsx';
import { api } from '../lib/api.ts';
import {
  formattaByte,
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
  TlsPayload,
  UptimePayload,
} from '../lib/types.ts';
import { trova, useMonitors, useMonitorStream } from '../lib/useMonitors.ts';

export function Stato() {
  useMonitorStream();
  const { data, isLoading, isError } = useMonitors();
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

  if (isLoading) {
    return <p className="py-8 text-center text-sm text-muted">Caricamento…</p>;
  }
  if (isError) {
    return (
      <p className="rounded-xl border border-crit/40 bg-crit/10 p-4 text-sm text-crit">
        Backend non raggiungibile.
      </p>
    );
  }

  const dischiGuasti = (dischi?.payload?.disks ?? []).filter((d) => d.device_status !== 0);
  const containerProblemi = (docker?.payload?.containers ?? []).filter(
    (c) => c.status === 'crit' || c.status === 'warn',
  );
  const serviziGiu = (uptime?.payload?.monitors ?? []).filter((m) => m.status === 'crit');

  return (
    <>
      {/* Il disco in guasto sta sopra tutto: deve essere impossibile non vederlo. */}
      {dischiGuasti.map((d) => (
        <section
          key={d.wwn}
          className="mb-3 rounded-2xl border border-crit/50 bg-crit/10 p-4"
          role="alert"
        >
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-crit" />
            <h2 className="text-sm font-bold text-crit">
              Disco {d.name} in guasto — RMA in corso
            </h2>
          </div>
          <p className="mt-1 text-sm">
            {d.model} · {formattaByte(d.capacity_bytes)} · {d.serial.replace(/^ata-/, '')}
          </p>
          <ul className="mt-3 grid grid-cols-2 gap-2">
            {d.attrs.map((a) => (
              <li
                key={a.id}
                className={`rounded-lg border px-2.5 py-2 ${
                  a.critico ? 'border-crit/50 bg-crit/10' : 'border-line bg-surface'
                }`}
              >
                <p className="text-[11px] text-muted">{a.label}</p>
                <p className={`text-lg font-semibold ${a.critico ? 'text-crit' : ''}`}>{a.raw}</p>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">
            {d.temp_c !== null ? `${d.temp_c} °C · ` : ''}
            {formattaOre(d.power_on_hours)} · rilevato {tempoRelativo(d.collected_at)}
          </p>
        </section>
      ))}

      {/* Riepilogo delle anomalie: quello che va storto, in un posto solo. */}
      {containerProblemi.length + serviziGiu.length > 0 ? (
        <section className="mb-3 rounded-2xl border border-line bg-surface p-4">
          <h2 className="mb-2 text-sm font-semibold">Anomalie</h2>
          <ul className="space-y-1.5 text-sm">
            {serviziGiu.map((m) => (
              <li key={`s-${m.name}`} className="flex items-center gap-2">
                <Punto status="crit" />
                <span className="truncate">
                  {m.name} <span className="text-muted">non risponde</span>
                </span>
              </li>
            ))}
            {containerProblemi.map((c) => (
              <li key={`c-${c.name}`} className="flex items-center gap-2">
                <Punto status={c.status} />
                <span className="truncate">
                  {c.name} <span className="text-muted">{c.label}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section className="mb-3 rounded-2xl border border-ok/30 bg-ok/10 p-4 text-sm text-ok">
          Nessuna anomalia sui container e sui servizi monitorati.
        </section>
      )}

      <SezioneMonitor
        stato={docker}
        titolo="Container NAS"
        riepilogo={
          docker?.payload
            ? `${docker.payload.in_esecuzione}/${docker.payload.totale} attivi`
            : undefined
        }
      >
        <ul>
          {raggruppa(docker?.payload?.containers ?? []).map((gruppo) =>
            gruppo.length === 1 ? (
              <Riga
                key={gruppo[0]!.name}
                status={gruppo[0]!.status}
                nome={gruppo[0]!.name}
                dettaglio={gruppo[0]!.image}
                destra={
                  <span className="text-right">
                    {gruppo[0]!.label}
                    {gruppo[0]!.restarts > 0 ? (
                      <span className="block text-[10px]">{gruppo[0]!.restarts} riavvii</span>
                    ) : null}
                  </span>
                }
              />
            ) : (
              <li key="mullvad" className="border-t border-line/60 px-4 py-2.5 first:border-t-0">
                <div className="mb-1.5 flex items-center gap-2">
                  <Punto status={peggiore(gruppo)} />
                  <span className="text-sm">Stack Mullvad</span>
                  <Pill status="warn">aggiornare solo insieme</Pill>
                </div>
                <ul className="ml-4 space-y-1">
                  {gruppo.map((c) => (
                    <li key={c.name} className="flex items-center gap-2 text-xs text-muted">
                      <Punto status={c.status} />
                      <span className="flex-1 truncate">{c.name}</span>
                      <span>{c.label}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ),
          )}
        </ul>
      </SezioneMonitor>

      <SezioneMonitor
        stato={dischi}
        titolo="Dischi"
        riepilogo={dischi?.payload ? `${dischi.payload.disks.length} unita'` : undefined}
      >
        <ul>
          {(dischi?.payload?.disks ?? []).map((d) => (
            <Riga
              key={d.wwn}
              status={d.status}
              nome={`${d.name} — ${d.model}`}
              dettaglio={`${formattaByte(d.capacity_bytes)} · ${formattaOre(d.power_on_hours)}`}
              destra={
                <span className="text-right">
                  {d.temp_c !== null ? `${d.temp_c} °C` : '—'}
                  <span className="block text-[10px]">
                    {d.device_status === 0 ? 'SMART ok' : 'SMART fallito'}
                  </span>
                </span>
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
        <div className="px-4 pb-3 text-sm">
          {backup?.payload ? (
            <>
              <p>
                Ultima esecuzione: {formattaDataOra(backup.payload.last_run)}{' '}
                <span className="text-muted">
                  ({backup.payload.age_hours} h fa, esito{' '}
                  {backup.payload.exit_code === 0 ? 'ok' : `errore ${backup.payload.exit_code}`})
                </span>
              </p>
              {backup.payload.message && backup.payload.message !== 'ok' ? (
                <p className="mt-1 text-muted">Messaggio: {backup.payload.message}</p>
              ) : null}
            </>
          ) : (
            <p className="text-muted">Nessun dato.</p>
          )}
        </div>
      </SezioneMonitor>

      <SezioneMonitor
        stato={tls}
        titolo="Certificato TLS Vaultwarden"
        riepilogo={
          tls?.payload?.days_remaining !== null && tls?.payload
            ? `${tls.payload.days_remaining} giorni`
            : undefined
        }
      >
        <div className="px-4 pb-3 text-sm">
          {tls?.payload ? (
            <>
              <p className="truncate">{tls.payload.servername}</p>
              <p className="mt-1 text-muted">
                Scade il {formattaDataOra(tls.payload.valid_to)}
                {tls.payload.days_remaining !== null
                  ? ` — ${formattaGiorni(tls.payload.days_remaining)}`
                  : ''}
              </p>
              <p className="text-muted">Emesso da {tls.payload.issuer ?? '—'}</p>
            </>
          ) : (
            <p className="text-muted">Nessun dato.</p>
          )}
        </div>
      </SezioneMonitor>

      <SezioneMonitor
        stato={uptime}
        titolo="Servizi (Uptime Kuma)"
        riepilogo={uptime?.payload ? `${uptime.payload.up}/${uptime.payload.totale} su` : undefined}
      >
        <ul>
          {(uptime?.payload?.monitors ?? []).map((m) => (
            <Riga
              key={m.name}
              status={m.status}
              nome={m.name}
              dettaglio={m.target}
              destra={m.response_ms !== null ? `${m.response_ms} ms` : m.label}
            />
          ))}
        </ul>
      </SezioneMonitor>

      <button
        type="button"
        onClick={() => refresh.mutate()}
        disabled={refresh.isPending}
        className="mb-2 w-full rounded-xl border border-line bg-surface py-3 text-sm font-medium text-muted active:bg-surface-2 disabled:opacity-50"
      >
        {refresh.isPending ? 'Aggiornamento…' : 'Aggiorna adesso'}
      </button>
      {refresh.isError ? (
        <p className="text-center text-xs text-warn">
          Aggiornamento troppo frequente: riprova fra qualche secondo.
        </p>
      ) : null}
    </>
  );
}

/** I container dello stack Mullvad viaggiano insieme, il resto e' individuale. */
function raggruppa(containers: Container[]): Container[][] {
  const gruppo = containers.filter((c) => c.group === 'mullvad');
  const singoli = containers.filter((c) => c.group !== 'mullvad').map((c) => [c]);
  return gruppo.length > 0 ? [gruppo, ...singoli] : singoli;
}

function peggiore(containers: Container[]) {
  if (containers.some((c) => c.status === 'crit')) return 'crit' as const;
  if (containers.some((c) => c.status === 'warn')) return 'warn' as const;
  return 'ok' as const;
}
