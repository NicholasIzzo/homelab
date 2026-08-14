import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';

import { App } from './App.tsx';
import { ApiError } from './lib/api.ts';
import { useAuth } from './lib/useAuth.ts';
import { Finanze } from './pages/Finanze.tsx';
import { Impostazioni } from './pages/Impostazioni.tsx';
import { AuthNonConfigurata, Login } from './pages/Login.tsx';
import { Scadenze } from './pages/Scadenze.tsx';
import { Stato } from './pages/Stato.tsx';
import './styles/theme.css';

let qc: QueryClient | undefined;

// Se una query qualsiasi incassa un 401, la sessione e' scaduta durante l'uso:
// rivalutiamo lo stato di autenticazione e l'app torna al login da sola.
const cache = new QueryCache({
  onError: (err) => {
    if (err instanceof ApiError && err.status === 401) {
      void qc?.invalidateQueries({ queryKey: ['auth'] });
    }
  },
});

qc = new QueryClient({
  queryCache: cache,
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: 1,
      refetchOnReconnect: true,
    },
  },
});

function Gate({ children }: { children: ReactNode }) {
  const { data, isLoading, isError } = useAuth();

  if (isLoading) {
    return <p className="p-8 text-center text-sm text-muted">Caricamento…</p>;
  }
  if (isError) {
    return <p className="p-8 text-center text-sm text-crit">Backend non raggiungibile.</p>;
  }
  if (!data?.configured) return <AuthNonConfigurata problema={data?.problema} />;
  if (!data.authenticated) return <Login />;

  return <>{children}</>;
}

const root = document.getElementById('root');
if (!root) throw new Error('#root non trovato');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Gate>
          <Routes>
            <Route element={<App />}>
              <Route index element={<Navigate to="/stato" replace />} />
              <Route path="/stato" element={<Stato />} />
              <Route path="/scadenze" element={<Scadenze />} />
              <Route path="/finanze" element={<Finanze />} />
              <Route path="/impostazioni" element={<Impostazioni />} />
              <Route path="*" element={<Navigate to="/stato" replace />} />
            </Route>
          </Routes>
        </Gate>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
