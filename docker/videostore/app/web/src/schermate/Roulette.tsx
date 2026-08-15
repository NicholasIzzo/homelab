import { useEffect, useMemo, useRef, useState } from "react";
import { coverUrl } from "../api";
import type { StoreItem } from "../tipi";

interface Props {
  items: StoreItem[];
  onNoleggia: (item: StoreItem) => void;
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

/** La ruota degli indecisi: le copertine sfrecciano, rallentano, e il destino sceglie. */
export function Roulette({ items, onNoleggia, onChiudi }: Props) {
  const [giro, setGiro] = useState(0);
  const [corrente, setCorrente] = useState<StoreItem | null>(null);
  const [fermo, setFermo] = useState(false);
  const timerRef = useRef(0);

  const pool = useMemo(() => mescola(items).slice(0, 40), [items, giro]);

  useEffect(() => {
    setFermo(false);
    let ritardo = 65;
    let i = 0;
    const tick = () => {
      setCorrente(pool[i % pool.length] ?? null);
      i++;
      ritardo *= 1.12;
      if (ritardo < 620) {
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
      <h1 className="roulette-titolo">🎲 La Ruota degli Indecisi</h1>
      <p className="roulette-sotto">{fermo ? "Il destino ha parlato!" : "Il destino sta scegliendo…"}</p>

      <div className={`roulette-cornice ${fermo ? "ferma" : "gira"}`}>
        {corrente && <img src={coverUrl(corrente.id, 500)} alt={corrente.title} />}
        <span className="roulette-lucina l1" />
        <span className="roulette-lucina l2" />
        <span className="roulette-lucina l3" />
        <span className="roulette-lucina l4" />
      </div>

      {fermo && corrente && (
        <div className="roulette-esito">
          <h2>{corrente.title}{corrente.year ? ` (${corrente.year})` : ""}</h2>
          <div className="roulette-azioni">
            <button className="btn-noleggia" onClick={() => onNoleggia(corrente)}>
              🎬 STASERA QUESTO
            </button>
            <button className="btn-rimetti" onClick={() => setGiro((g) => g + 1)}>
              🎲 Gira ancora
            </button>
          </div>
        </div>
      )}

      <button className="btn-rimetti roulette-chiudi" onClick={onChiudi}>
        ← Torna al negozio
      </button>
    </div>
  );
}
