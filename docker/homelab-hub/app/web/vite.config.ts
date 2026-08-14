import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // File esterno invece di uno <script> inline: la CSP tiene script-src 'self'.
      injectRegister: 'script-defer',
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        name: 'Homelab Hub',
        short_name: 'Homelab Hub',
        description: 'Dashboard di monitoring del homelab',
        lang: 'it',
        dir: 'ltr',
        start_url: '/stato',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0b0f14',
        theme_color: '#0b0f14',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Solo asset statici prodotti dalla build. Nessuna regola di runtime
        // caching: le risposte /api non devono MAI finire in cache, ne' i dati
        // di monitoraggio (sarebbero vecchi) ne' quelli protetti da sessione.
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    // Il polyfill di modulepreload verrebbe iniettato come script inline e
    // farebbe a pugni con la CSP.
    modulePreload: { polyfill: false },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8090', changeOrigin: false },
    },
  },
});
