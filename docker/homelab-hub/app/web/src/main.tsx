import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';

import { App } from './App.tsx';
import { Finanze } from './pages/Finanze.tsx';
import { Impostazioni } from './pages/Impostazioni.tsx';
import { Scadenze } from './pages/Scadenze.tsx';
import { Stato } from './pages/Stato.tsx';
import './styles/theme.css';

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: 1,
      // I dati arrivano gia' pronti dal DB del server: nessun refetch aggressivo.
      refetchOnReconnect: true,
    },
  },
});

const root = document.getElementById('root');
if (!root) throw new Error('#root non trovato');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
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
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
