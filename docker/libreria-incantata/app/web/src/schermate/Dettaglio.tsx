import { coverUrl } from "../api";
import { temaDi } from "../temi";
import type { Libro } from "../tipi";

interface Props {
  libro: Libro;
  onLeggi: () => void;
  onChiudi: () => void;
}

function stelle(voto: number): string {
  const pieni = Math.round(voto);
  return "★★★★★☆☆☆☆☆".slice(5 - pieni, 10 - pieni);
}

/** La scheda del libro: copertina grande, dettagli e link esterno. */
export function Dettaglio({ libro, onLeggi, onChiudi }: Props) {
  const tema = temaDi(libro.scaffale);
  const amazon = libro.fonte === "amazon";
  return (
    <div className="scheda" style={{ ["--luce" as string]: tema.luce }}>
      <button className="scheda-chiudi" onClick={onChiudi} aria-label="Chiudi">✕</button>
      <div className="scheda-corpo">
        <div className="scheda-copertina">
          <img src={coverUrl(libro)} alt={libro.titolo} />
        </div>
        <div className="scheda-testo">
          {libro.serie && <p className="scheda-serie">{tema.icona} {libro.serie}</p>}
          <h2 className="scheda-titolo">{libro.titoloBreve}</h2>
          {libro.autore && <p className="scheda-autore">di {libro.autore}</p>}

          <div className="scheda-meta">
            {libro.votoMedio != null && (
              <span title={`${libro.votoMedio} su Goodreads`}>
                <span className="scheda-stelle">{stelle(libro.votoMedio)}</span> {libro.votoMedio.toFixed(2)}
              </span>
            )}
            {libro.pagine != null && <span>📖 {libro.pagine} pp.</span>}
            {libro.anno != null && <span>🕰️ {libro.anno}</span>}
            {libro.prezzo && <span className="scheda-prezzo">💰 {libro.prezzo}</span>}
            {libro.formato && <span>{libro.formato}</span>}
          </div>

          {libro.descrizione && <p className="scheda-trama">{libro.descrizione}</p>}

          <div className="scheda-azioni">
            <button className="btn-oro" onClick={onLeggi}>
              🔥 Leggi accanto al camino
            </button>
            {libro.link && (
              <a className="btn-fantasma" href={libro.link} target="_blank" rel="noreferrer noopener">
                {amazon ? "🛒 Vedi su Amazon" : "🔗 Apri su Goodreads"}
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
