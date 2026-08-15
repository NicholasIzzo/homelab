import { useEffect, useRef, useState } from "react";
import { temaDi } from "../temi";
import type { Libro, Scaffale } from "../tipi";
import { ScenaBiblioteca } from "./scena";

interface Props {
  scaffali: Scaffale[];
  desideri: Libro[];
  mock: boolean;
  onPick: (libro: Libro) => void;
  onRoulette: () => void;
  onDesideri: () => void;
  onEsci: () => void;
}

const TOCCO = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;

/** La biblioteca 3D: canvas Three.js + HUD (uscita, insegne rapide, passi). */
export function Biblioteca3DView({ scaffali, desideri, mock, onPick, onRoulette, onDesideri, onEsci }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scenaRef = useRef<ScenaBiblioteca | null>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const onRouletteRef = useRef(onRoulette);
  onRouletteRef.current = onRoulette;
  const onDesideriRef = useRef(onDesideri);
  onDesideriRef.current = onDesideri;
  const [scaffale, setScaffale] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || scaffali.length === 0) return;
    const scena = new ScenaBiblioteca(canvas, scaffali, desideri.length, {
      onPickLibro: (l) => onPickRef.current(l),
      onArrivo: setScaffale,
      onRuota: () => onRouletteRef.current(),
      onDesideri: () => onDesideriRef.current(),
    });
    scenaRef.current = scena;
    return () => {
      scenaRef.current = null;
      scena.dispose();
    };
  }, [scaffali, desideri.length]);

  const attuale = scaffali.find((s) => s.id === scaffale);

  return (
    <div className="scena3d">
      <canvas ref={canvasRef} className="scena3d-canvas" />

      <div className="hud hud-alto">
        <button className="btn-uscita" onClick={onEsci}>← Esci</button>
        {attuale ? (
          <span className="hud-scaffale" style={{ ["--luce" as string]: temaDi(attuale.id).luce }}>
            {temaDi(attuale.id).icona} {attuale.nome}
          </span>
        ) : (
          <span className="hud-aiuto">
            {TOCCO
              ? "Tocca un libro per aprirlo · un'insegna per avvicinarti · trascina per guardarti attorno"
              : "Clicca un libro o un'insegna · WASD per camminare · trascina il mouse per guardare"}
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
          >▲</button>
          <button
            aria-label="Cammina indietro"
            onPointerDown={() => scenaRef.current?.impostaPasso(-1)}
            onPointerUp={() => scenaRef.current?.impostaPasso(0)}
            onPointerLeave={() => scenaRef.current?.impostaPasso(0)}
            onPointerCancel={() => scenaRef.current?.impostaPasso(0)}
          >▼</button>
        </div>
      )}

      <div className="hud hud-basso">
        <button
          className="hud-insegna oro"
          onClick={onRoulette}
        >🔮 Ruota del Destino</button>
        <button
          className="hud-insegna"
          style={{ ["--luce" as string]: temaDi("desideri").luce }}
          onClick={onDesideri}
        >⭐ Desideri</button>
        {scaffali.map((s) => {
          const tema = temaDi(s.id);
          return (
            <button
              key={s.id}
              className={`hud-insegna ${scaffale === s.id ? "attiva" : ""}`}
              style={{ ["--luce" as string]: tema.luce }}
              onClick={() => scenaRef.current?.vaiAScaffale(s.id)}
            >{tema.icona} {s.nome}</button>
          );
        })}
      </div>
    </div>
  );
}
