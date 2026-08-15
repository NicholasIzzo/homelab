import type { BibliotecaPayload } from "./tipi";

export async function fetchBiblioteca(): Promise<BibliotecaPayload> {
  const res = await fetch("/api/biblioteca");
  if (!res.ok) throw new Error(`/api/biblioteca → HTTP ${res.status}`);
  return res.json() as Promise<BibliotecaPayload>;
}

/**
 * URL (stesso-origine) della copertina proxata: sicura come texture WebGL.
 * L'impronta in coda fa sì che, cambiando l'immagine di origine, il browser
 * non continui a mostrare quella vecchia presa dalla cache.
 */
export const coverUrl = (libro: { id: string; copertinaVer?: string }) => {
  const v = libro.copertinaVer ? `?v=${encodeURIComponent(libro.copertinaVer)}` : "";
  return `/api/cover/${encodeURIComponent(libro.id)}${v}`;
};
