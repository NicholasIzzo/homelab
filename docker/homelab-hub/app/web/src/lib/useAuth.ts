import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, ApiError } from './api.ts';

export type StatoAuth = { configured: boolean; authenticated: boolean };

export function useAuth() {
  return useQuery({
    queryKey: ['auth'],
    queryFn: () => api<StatoAuth>('/auth/me'),
    staleTime: 30_000,
    retry: false,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (password: string) =>
      api<{ ok: boolean }>('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      }),
    onSuccess: () => void qc.invalidateQueries(),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      // Via anche i dati gia' scaricati: il logout non deve lasciare in memoria
      // la pagina precedente.
      qc.clear();
      void qc.invalidateQueries({ queryKey: ['auth'] });
    },
  });
}

export function messaggioErroreLogin(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return 'Password errata.';
    if (err.status === 429) return 'Troppi tentativi. Riprova fra qualche minuto.';
    if (err.status === 503) return 'Autenticazione non ancora configurata sul server.';
  }
  return 'Accesso non riuscito.';
}
