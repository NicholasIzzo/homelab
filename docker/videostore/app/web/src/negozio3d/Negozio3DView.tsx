import { useEffect, useRef, useState } from "react";
import { temaDi } from "../temi";
import type { Shelf, StoreItem } from "../tipi";
import { ScenaNegozio } from "./scena";

interface Props {
  shelves: Shelf[];
  mock: boolean;
  onPick: (item: StoreItem, shelfId: string) => void;
  onRoulette: () => void;
  onEsci: () => void;
}

const TOCCO = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;

/** Il negozio 3D: canvas Three.js + HUD (uscita, insegne rapide, suggerimenti). */
export function Negozio3DView({ shelves, mock, onPick, onRoulette, onEsci }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scenaRef = useRef<ScenaNegozio | null>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const onRouletteRef = useRef(onRoulette);
  onRouletteRef.current = onRoulette;
  const [corsia, setCorsia] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || shelves.length === 0) return;
    const scena = new ScenaNegozio(canvas, shelves, {
      onPickItem: (item, shelfId) => onPickRef.current(item, shelfId),
      onArrivo: setCorsia,
      onRoulette: () => onRouletteRef.current(),
    });
    scenaRef.current = scena;
    return () => {
      scenaRef.current = null;
      scena.dispose();
    };
  }, [shelves]);

  const shelfAttuale = shelves.find((s) => s.id === corsia);

  return (
    <div className="scena3d">
      <canvas ref={canvasRef} className="scena3d-canvas" />

      <div className="hud hud-alto">
        <button className="btn-uscita" onClick={onEsci}>← Esci</button>
        {shelfAttuale ? (
          <span className="hud-corsia" style={{ ["--neon" as string]: temaDi(shelfAttuale.id).neon }}>
            {temaDi(shelfAttuale.id).icona} {shelfAttuale.name}
          </span>
        ) : (
          <span className="hud-suggerimento">
            {TOCCO
              ? "Tocca il pavimento per camminare, un'insegna per avvicinarti · trascina per guardarti attorno"
              : "Clicca il pavimento o un'insegna per muoverti · WASD per camminare · trascina il mouse per guardarti attorno"}
          </span>
        )}
        {mock && <span className="badge-demo">DEMO</span>}
      </div>

      {TOCCO && (
        <div className="hud-passi">
          <button
            aria-label="Cammina avanti"
            onPointerDown={() => scenaRef.current?.impostaPasso(1)}
            onPointerUp={() => scenaRef.current?.impostaPasso(0)}
            onPointerLeave={() => scenaRef.current?.impostaPasso(0)}
            onPointerCancel={() => scenaRef.current?.impostaPasso(0)}
          >
            ▲
          </button>
          <button
            aria-label="Cammina indietro"
            onPointerDown={() => scenaRef.current?.impostaPasso(-1)}
            onPointerUp={() => scenaRef.current?.impostaPasso(0)}
            onPointerLeave={() => scenaRef.current?.impostaPasso(0)}
            onPointerCancel={() => scenaRef.current?.impostaPasso(0)}
          >
            ▼
          </button>
        </div>
      )}

      <div className="hud hud-basso">
        <button
          className="hud-insegna"
          style={{ ["--neon" as string]: "#66ff99" }}
          onClick={() => scenaRef.current?.vaiAllIngresso()}
        >
          🚪 Ingresso
        </button>
        <button
          className="hud-insegna"
          style={{ ["--neon" as string]: "#ffd166" }}
          onClick={() => scenaRef.current?.vaiAllaRoulette()}
        >
          🎲 Indeciso?
        </button>
        {shelves.map((s) => {
          const tema = temaDi(s.id);
          return (
            <button
              key={s.id}
              className={`hud-insegna ${corsia === s.id ? "attiva" : ""}`}
              style={{ ["--neon" as string]: tema.neon }}
              onClick={() => scenaRef.current?.vaiAllaCorsia(s.id)}
            >
              {tema.icona} {s.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
