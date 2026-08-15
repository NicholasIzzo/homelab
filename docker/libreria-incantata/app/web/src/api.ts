import type { BibliotecaPayload } from "./tipi";

export async function fetchBiblioteca(): Promise<BibliotecaPayload> {
  const res = await fetch("/api/biblioteca");
  if (!res.ok) throw new Error(`/api/biblioteca → HTTP ${res.status}`);
  return res.json() as Promise<BibliotecaPayload>;
}

/** URL (stesso-origine) della copertina proxata: sicura come texture WebGL. */
export const coverUrl = (id: string) => `/api/cover/${encodeURIComponent(id)}`;
