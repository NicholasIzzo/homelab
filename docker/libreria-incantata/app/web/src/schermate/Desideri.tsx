import { coverUrl } from "../api";
import type { Libro } from "../tipi";

interface Props {
  desideri: Libro[];
  onApri: (libro: Libro) => void;
  onChiudi: () => void;
}

/** Il Sentiero dei Desideri: i libri della wishlist Amazon, ancora da conquistare. */
export function Desideri({ desideri, onApri, onChiudi }: Props) {
  return (
    <div className="desideri">
      <button className="scheda-chiudi" onClick={onChiudi} aria-label="Chiudi">✕</button>
      <h1 className="desideri-titolo">⭐ Il Sentiero dei Desideri</h1>
      <p className="desideri-sotto">
        {desideri.length} libri che aspettano di entrare nella biblioteca.
      </p>
      <div className="desideri-griglia">
        {desideri.map((d) => (
          <button key={d.id} className="desiderio" onClick={() => onApri(d)}>
            <div className="desiderio-cop">
              <img src={coverUrl(d.id)} alt={d.titolo} loading="lazy" />
              {d.prezzo && <span className="desiderio-prezzo">{d.prezzo}</span>}
            </div>
            <span className="desiderio-titolo">{d.titoloBreve}</span>
            {d.autore && <span className="desiderio-autore">{d.autore}</span>}
          </button>
        ))}
      </div>
      <button className="btn-fantasma desideri-chiudi" onClick={onChiudi}>
        ← Torna alla biblioteca
      </button>
    </div>
  );
}
