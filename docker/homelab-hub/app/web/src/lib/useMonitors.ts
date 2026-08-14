import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { api } from './api.ts';
import type { MonitorState, MonitorsResponse, Source } from './types.ts';

export function useMonitors() {
  return useQuery({
    queryKey: ['monitors'],
    queryFn: () => api<MonitorsResponse>('/monitors'),
    // Rete di sicurezza: se l'SSE cade, i dati si aggiornano comunque.
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

/**
 * Il server annuncia via SSE ogni raccolta completata: invalidiamo la query
 * invece di fare polling stretto.
 */
export function useMonitorStream(): void {
  const qc = useQueryClient();

  useEffect(() => {
    const es = new EventSource('/api/stream');
    const onCollected = () => void qc.invalidateQueries({ queryKey: ['monitors'] });
    es.addEventListener('collected', onCollected);
    return () => {
      es.removeEventListener('collected', onCollected);
      es.close();
    };
  }, [qc]);
}

export function trova<T>(
  monitors: MonitorState[] | undefined,
  source: Source,
): MonitorState<T> | undefined {
  return monitors?.find((m) => m.source === source) as MonitorState<T> | undefined;
}
