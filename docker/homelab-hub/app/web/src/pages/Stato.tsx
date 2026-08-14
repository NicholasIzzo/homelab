import { useEffect, useState } from 'react';

import { Card, Placeholder } from '../components/Card.tsx';
import { api, type Health } from '../lib/api.ts';

export function Stato() {
  const [health, setHealth] = useState<Health | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    api<Health>('/health')
      .then((h) => vivo && setHealth(h))
      .catch((e: unknown) => vivo && setErrore(e instanceof Error ? e.message : 'errore'));
    return () => {
      vivo = false;
    };
  }, []);

  return (
    <>
      <Card
        title="Backend"
        hint={health ? `v${health.version}` : errore ? 'non raggiungibile' : 'verifica…'}
      >
        {health ? (
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-ok" />
            <span>
              API attive, database {health.db ? 'connesso' : 'non disponibile'}, in esecuzione da{' '}
              {health.uptime_s}s
            </span>
          </div>
        ) : errore ? (
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-crit" />
            <span>{errore}</span>
          </div>
        ) : (
          <span>Verifica in corso…</span>
        )}
      </Card>

      <Card title="Monitoring">
        <Placeholder
          fase="Fase 3"
          cosa="dischi Scrutiny (sdb in guasto), container del NAS, backup Restic, certificato TLS, uptime Kuma"
        />
      </Card>
    </>
  );
}
