import { Card } from '../components/Card.tsx';
import { useLogout } from '../lib/useAuth.ts';

export function Impostazioni() {
  const logout = useLogout();

  return (
    <>
      <Card title="Installazione su iPhone">
        <ol className="list-decimal space-y-1 pl-4">
          <li>
            Apri <span className="text-ink">http://100.92.242.72:8090</span> in Safari, con
            Tailscale attivo.
          </li>
          <li>
            Tocca <span className="text-ink">Condividi</span> e poi{' '}
            <span className="text-ink">Aggiungi a Home</span>.
          </li>
          <li>L&apos;app si apre a schermo intero, senza barra del browser.</li>
        </ol>
        <p className="mt-2">
          Deve essere Safari: da altri browser iOS la voce &quot;Aggiungi a Home&quot; non installa
          la PWA.
        </p>
      </Card>

      <Card title="Sessione">
        <p>
          La sessione dura 90 giorni e si rinnova a ogni utilizzo, quindi il login non ricompare se
          apri l&apos;app con regolarita&apos;.
        </p>
        <button
          type="button"
          onClick={() => logout.mutate()}
          disabled={logout.isPending}
          className="mt-3 w-full rounded-xl border border-crit/40 bg-crit/10 py-3 text-sm font-medium text-crit disabled:opacity-50"
        >
          {logout.isPending ? 'Uscita…' : 'Esci'}
        </button>
      </Card>

      <Card title="Sicurezza" hint="v1.0.0">
        <ul className="list-disc space-y-1 pl-4">
          <li>Raggiungibile solo dall&apos;IP Tailscale, non dalla LAN.</li>
          <li>Password argon2id, cookie di sessione HttpOnly e SameSite strict.</li>
          <li>Container non-root, filesystem in sola lettura, capability eliminate.</li>
          <li>L&apos;app e&apos; in sola lettura sull&apos;infrastruttura: nessuna azione sui container.</li>
        </ul>
      </Card>
    </>
  );
}
