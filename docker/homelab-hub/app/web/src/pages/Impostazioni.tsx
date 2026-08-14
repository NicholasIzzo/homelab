import { Card, Placeholder } from '../components/Card.tsx';

export function Impostazioni() {
  return (
    <>
      <Card title="Installazione" hint="iPhone">
        Safari → Condividi → <span className="text-ink">Aggiungi a Home</span>. Manifest e service
        worker arrivano in Fase 6: fino ad allora l'icona funziona ma senza modalita' standalone
        completa.
      </Card>
      <Card title="Accesso">
        <Placeholder fase="Fase 6" cosa="autenticazione a utente singolo e gestione della sessione" />
      </Card>
    </>
  );
}
