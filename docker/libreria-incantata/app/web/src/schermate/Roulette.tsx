import { useEffect, useMemo, useRef, useState } from "react";
import { coverUrl } from "../api";
import type { Libro } from "../tipi";

interface Props {
  libri: Libro[];
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

/** La Ruota del Destino: le copertine sfrecciano, rallentano, il fato sceglie. */
export function Roulette({ libri, onScegli, onChiudi }: Props) {
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

  return (
    <div className="roulette">
      <div className="roulette-runa" aria-hidden />
      <h1 className="roulette-titolo">🔮 La Ruota del Destino</h1>
      <p className="roulette-sotto">
        {fermo ? "Il destino ha scelto per te." : "Le pagine girano nel vuoto…"}
      </p>

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
          <div className="roulette-azioni">
            <button className="btn-oro" onClick={() => onScegli(corrente)}>
              📖 Leggo questo!
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
