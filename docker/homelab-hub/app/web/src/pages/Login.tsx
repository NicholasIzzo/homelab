import { useState } from 'react';

import { messaggioErroreLogin, useLogin } from '../lib/useAuth.ts';

export function Login() {
  const [password, setPassword] = useState('');
  const login = useLogin();

  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center bg-bg px-6 text-ink"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center">
          <img src="/icons/icon-192.png" alt="" width={64} height={64} className="rounded-2xl" />
          <h1 className="mt-4 text-xl font-semibold">Homelab Hub</h1>
          <p className="mt-1 text-sm text-muted">Accesso richiesto</p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (password !== '') login.mutate(password);
          }}
        >
          <label className="block">
            <span className="mb-1.5 block text-xs text-muted">Password</span>
            <input
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-base text-ink"
              required
            />
          </label>

          {login.isError ? (
            <p className="mt-3 rounded-lg border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">
              {messaggioErroreLogin(login.error)}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={login.isPending || password === ''}
            className="mt-5 w-full rounded-xl bg-accent py-3.5 text-sm font-semibold text-bg disabled:opacity-40"
          >
            {login.isPending ? 'Verifica…' : 'Entra'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-muted">
          Raggiungibile solo dal tailnet. La sessione dura 90 giorni e si rinnova da sola.
        </p>
      </div>
    </div>
  );
}

/** Mostrata quando il server non ha un hash utilizzabile. */
export function AuthNonConfigurata({ problema }: { problema?: string | null }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-bg px-6 text-ink">
      <div className="card w-full max-w-sm border-warn/45 bg-warn/12 p-5">
        <h1 className="text-[15px] font-semibold text-warn">
          {problema ? 'Hash della password non valido' : 'Autenticazione non configurata'}
        </h1>

        {problema ? (
          <p className="corpo mt-2 text-warn">{problema}</p>
        ) : (
          <p className="corpo mt-2">
            Il server non ha una password impostata, quindi non serve alcun dato.
          </p>
        )}

        <p className="corpo mt-3">Genera l&apos;hash:</p>
        <pre className="nota mt-2 overflow-x-auto rounded-lg bg-bg p-3">
{`docker compose run --rm \\
  --entrypoint node homelab-hub \\
  server/dist/tools/hash-password.js`}
        </pre>
        <p className="corpo mt-3">
          Incolla la riga <code className="text-ink">ADMIN_PASSWORD_HASH_B64=…</code> in{' '}
          <code className="text-ink">.env</code>, poi{' '}
          <code className="text-ink">docker compose up -d</code>.
        </p>
        <p className="nota mt-2">
          E&apos; in base64 perche&apos; l&apos;hash contiene <code>$</code> e Compose lo
          interpolerebbe, svuotandolo.
        </p>
      </div>
    </div>
  );
}
