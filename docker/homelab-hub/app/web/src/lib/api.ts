export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { Accept: 'application/json', ...init?.headers },
    ...init,
  });

  if (!res.ok) {
    throw new ApiError(`Richiesta fallita: ${res.status}`, res.status);
  }
  return (await res.json()) as T;
}

export type Health = {
  status: string;
  version: string;
  db: boolean;
  uptime_s: number;
  now: string;
};
