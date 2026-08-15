import { useEffect, useMemo, useRef, useState } from "react";
import { coverUrl } from "../api";
import type { Libro } from "../tipi";

interface Props {
  libri: Libro[];
  /** Titolo della ruota: cambia fra "da leggere" e "da comprare". */
  titolo: string;
  sottotitolo: string;
  /** Testo del pulsante di conferma. */
  etichetta: string;
  /** Colore dominante dell'effetto luminoso. */
  luce: string;
  onScegli: (libro: Libro) => void;
  onChiudi: () => void;
}

function mescola<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** La ruota: le copertine sfrecciano, rallentano, e il destino sceglie. */
export function Roulette({
  libri,
  titolo,
  sottotitolo,
  etichetta,
  luce,
  onScegli,
  onChiudi,
}: Props) {
  const [giro, setGiro] = useState(0);
  const [corrente, setCorrente] = useState<Libro | null>(null);
  const [fermo, setFermo] = useState(false);
  const timerRef = useRef(0);

  const pool = useMemo(() => mescola(libri).slice(0, 60), [libri, giro]);

  useEffect(() => {
    if (pool.length === 0) return;
    setFermo(false);
    let ritardo = 60;
    let i = Math.floor(Math.random() * pool.length);
    const tick = () => {
      setCorrente(pool[i % pool.length] ?? null);
      i++;
      ritardo *= 1.13;
      if (ritardo < 640) {
        timerRef.current = window.setTimeout(tick, ritardo);
      } else {
        setFermo(true);
      }
    };
    tick();
    return () => clearTimeout(timerRef.current);
  }, [pool]);

  if (libri.length === 0) {
    return (
      <div className="roulette" style={{ ["--luce" as string]: luce }}>
        <h1 className="roulette-titolo">{titolo}</h1>
        <p className="roulette-sotto">Non c'è ancora nessun libro da scegliere.</p>
        <button className="btn-fantasma roulette-chiudi" onClick={onChiudi}>
          ← Torna alla biblioteca
        </button>
      </div>
    );
  }

  return (
    <div className="roulette" style={{ ["--luce" as string]: luce }}>
      <div className="roulette-runa" aria-hidden />
      <h1 className="roulette-titolo">{titolo}</h1>
      <p className="roulette-sotto">{fermo ? "Il destino ha scelto per te." : sottotitolo}</p>

      <div className={`roulette-cornice ${fermo ? "ferma" : "gira"}`}>
        {corrente && <img src={coverUrl(corrente)} alt={corrente.titolo} />}
        <span className="roulette-scintilla s1" />
        <span className="roulette-scintilla s2" />
        <span className="roulette-scintilla s3" />
        <span className="roulette-scintilla s4" />
      </div>

      {fermo && corrente && (
        <div className="roulette-esito">
          <h2>{corrente.titoloBreve}</h2>
          {corrente.autore && <p className="roulette-autore">di {corrente.autore}</p>}
          {corrente.prezzo && <p className="roulette-prezzo">{corrente.prezzo}</p>}
          <div className="roulette-azioni">
            <button className="btn-oro" onClick={() => onScegli(corrente)}>
              {etichetta}
            </button>
            <button className="btn-fantasma" onClick={() => setGiro((g) => g + 1)}>
              🎲 Gira ancora
            </button>
          </div>
        </div>
      )}

      <button className="btn-fantasma roulette-chiudi" onClick={onChiudi}>
        ← Torna alla biblioteca
      </button>
    </div>
  );
}
