import type { FastifyInstance } from 'fastify';

/**
 * 'unsafe-inline' su style-src e' necessario: le barre di progresso usano
 * l'attributo style per la larghezza calcolata. Riguarda solo gli attributi
 * inline, non consente <style> arbitrari iniettati da terzi via script,
 * perche' script-src resta 'self' senza eccezioni.
 *
 * Niente CDN, niente font esterni, niente analytics: default-src 'self' basta.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const HEADER: Record<string, string> = {
  'Content-Security-Policy': CSP,
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'geolocation=(), camera=(), microphone=(), payment=(), usb=()',
  // Nessun HSTS: l'app e' servita in HTTP sull'IP Tailscale. Annunciare HSTS
  // qui non protegge nulla e bloccherebbe l'accesso al primo cambio di setup.
};

export function registraHeaderSicurezza(app: FastifyInstance): void {
  app.addHook('onSend', async (_req, reply, payload) => {
    for (const [k, v] of Object.entries(HEADER)) reply.header(k, v);
    // Le risposte API non devono finire in nessuna cache, ne' del browser
    // ne' del service worker.
    if (_req.url.startsWith('/api/')) {
      reply.header('Cache-Control', 'no-store, no-cache, must-revalidate');
    }
    return payload;
  });
}
