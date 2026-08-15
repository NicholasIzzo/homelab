import { useEffect, useMemo, useRef, useState } from "react";
import { temaDi } from "../temi";
import type { Libro, Scaffale } from "../tipi";
import { ScenaBiblioteca, type SezioneScena } from "./scena";

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
export function Biblioteca3DView({
  scaffali,
  desideri,
  mock,
  onPick,
  onRoulette,
  onDesideri,
  onEsci,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scenaRef = useRef<ScenaBiblioteca | null>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const onRouletteRef = useRef(onRoulette);
  onRouletteRef.current = onRoulette;
  const onDesideriRef = useRef(onDesideri);
  onDesideriRef.current = onDesideri;
  const [sezioneVicina, setSezioneVicina] = useState<string | null>(null);

  /**
   * Le sezioni fisiche della stanza. "Appena Sussurrati" resta solo una vista
   * (ripete libri già presenti altrove): in 3D lo saltiamo, altrimenti gli
   * stessi titoli comparirebbero due volte su scaffali diversi. I desideri
   * Amazon diventano invece una sezione vera e propria.
   */
  const sezioni: SezioneScena[] = useMemo(() => {
    const base = scaffali
      .filter((s) => s.id !== "recenti" && s.libri.length > 0)
      .map((s) => ({ id: s.id, nome: s.nome, libri: s.libri }));
    if (desideri.length > 0) {
      base.push({ id: "desideri", nome: "Il Sentiero dei Desideri", libri: desideri });
    }
    return base;
  }, [scaffali, desideri]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || sezioni.length === 0) return;
    const scena = new ScenaBiblioteca(canvas, sezioni, {
      onPickLibro: (l) => onPickRef.current(l),
      onArrivo: setSezioneVicina,
      onRuota: () => onRouletteRef.current(),
      onDesideri: () => onDesideriRef.current(),
    });
    scenaRef.current = scena;

    // Diagnostica su richiesta (?diag=1): conteggi e controllo dei bounds.
    const diag = new URLSearchParams(location.search).get("diag") === "1";
    if (diag) {
      (window as unknown as { __biblioteca?: unknown }).__biblioteca = scena;
      console.info("[biblioteca] diagnostica", scena.diagnostica());
    }

    return () => {
      scenaRef.current = null;
      delete (window as unknown as { __biblioteca?: unknown }).__biblioteca;
      scena.dispose();
    };
  }, [sezioni]);

  const attuale = sezioni.find((s) => s.id === sezioneVicina);

  return (
    <div className="scena3d">
      <canvas ref={canvasRef} className="scena3d-canvas" />

      <div className="hud hud-alto">
        <button className="btn-uscita" onClick={onEsci}>← Esci</button>
        {attuale ? (
          <span className="hud-scaffale" style={{ ["--luce" as string]: temaDi(attuale.id).luce }}>
            {temaDi(attuale.id).icona} {attuale.nome}
            <small> · {attuale.libri.length} libri</small>
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
        <button className="hud-insegna oro" onClick={onRoulette}>🔮 Ruota del Destino</button>
        <button
          className="hud-insegna"
          style={{ ["--luce" as string]: temaDi("desideri").luce }}
          onClick={onDesideri}
        >⭐ Desideri</button>
        <button
          className="hud-insegna"
          style={{ ["--luce" as string]: "#9fe8c0" }}
          onClick={() => scenaRef.current?.vaiAllIngresso()}
        >🚪 Ingresso</button>
        {sezioni.map((s) => {
          const tema = temaDi(s.id);
          return (
            <button
              key={s.id}
              className={`hud-insegna ${sezioneVicina === s.id ? "attiva" : ""}`}
              style={{ ["--luce" as string]: tema.luce }}
              onClick={() => scenaRef.current?.vaiAScaffale(s.id)}
            >{tema.icona} {s.nome}</button>
          );
        })}
      </div>
    </div>
  );
}
