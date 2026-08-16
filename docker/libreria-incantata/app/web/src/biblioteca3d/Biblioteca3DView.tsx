import { useEffect, useMemo, useRef, useState } from "react";
import type { Preferenze } from "../personalizza";
import { temaDi } from "../temi";
import type { Libro, Scaffale } from "../tipi";
import { ScenaBiblioteca, type SezioneScena } from "./scena";

interface Props {
  scaffali: Scaffale[];
  desideri: Libro[];
  mock: boolean;
  onPick: (libro: Libro) => void;
  onRoulette: () => void;
  onRouletteDesideri: () => void;
  onDesideri: () => void;
  onAngolo: () => void;
  onPersonalizza: () => void;
  onEsci: () => void;
  pref: Preferenze;
  /** Falso mentre è aperto l'angolo di lettura: la scena si mette in pausa. */
  attiva: boolean;
}

const TOCCO = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;

/** La biblioteca 3D: canvas Three.js + HUD (uscita, insegne rapide, passi). */
export function Biblioteca3DView({
  scaffali,
  desideri,
  mock,
  onPick,
  onRoulette,
  onRouletteDesideri,
  onDesideri,
  onAngolo,
  onPersonalizza,
  onEsci,
  attiva,
  pref,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pisteRef = useRef<HTMLDivElement>(null);
  const scenaRef = useRef<ScenaBiblioteca | null>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const onRouletteRef = useRef(onRoulette);
  onRouletteRef.current = onRoulette;
  const onDesideriRef = useRef(onDesideri);
  onDesideriRef.current = onDesideri;
  const onRouletteDesideriRef = useRef(onRouletteDesideri);
  onRouletteDesideriRef.current = onRouletteDesideri;
  const [sezioneVicina, setSezioneVicina] = useState<string | null>(null);

  /**
   * Le sezioni fisiche della stanza: solo i libri che lei ha davvero da
   * leggere.
   *
   * I desideri (wishlist Amazon) restano fuori dagli scaffali — sono libri non
   * ancora suoi, e messi accanto agli altri creerebbero confusione su cosa
   * possiede. Vivono nella Ruota dei Desideri e nella lista.
   *
   * "Appena Sussurrati" è una vista che ripete titoli presenti altrove: in 3D
   * comparirebbero due volte, quindi non diventa un mobile.
   */
  const sezioni: SezioneScena[] = useMemo(
    () =>
      scaffali
        .filter((s) => s.id !== "recenti" && s.libri.length > 0)
        .map((s) => ({ id: s.id, nome: s.nome, libri: s.libri })),
    [scaffali],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || sezioni.length === 0) return;
    const scena = new ScenaBiblioteca(
      canvas,
      sezioni,
      {
        onPickLibro: (l) => onPickRef.current(l),
        onArrivo: setSezioneVicina,
        onRuota: () => onRouletteRef.current(),
        onRuotaDesideri: () => onRouletteDesideriRef.current(),
        onDesideri: () => onDesideriRef.current(),
      },
      pref,
      desideri.length > 0,
    );
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
  }, [
    sezioni,
    desideri.length,
    // I tagli decorati sono esclusi apposta: cambiarli aggiorna i materiali
    // (effetto qui sotto) invece di ricostruire tutta la sala.
    pref.essenza,
    pref.luce,
    pref.atmosfera,
    pref.decori,
  ]);

  useEffect(() => {
    scenaRef.current?.aggiornaBordi(pref.bordi);
  }, [pref.bordi]);

  useEffect(() => {
    if (attiva) scenaRef.current?.riprendi();
    else scenaRef.current?.pausa();
  }, [attiva]);

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
        <button
          className="hud-freccia"
          aria-label="Scorri indietro"
          onClick={() => pisteRef.current?.scrollBy({ left: -260 })}
        >‹</button>

        <div className="hud-piste" ref={pisteRef}>
          <button className="hud-insegna oro" onClick={onRoulette}>🔮 Ruota del Destino</button>
          <button
            className="hud-insegna"
            style={{ ["--luce" as string]: temaDi("desideri").luce }}
            onClick={onRouletteDesideri}
          >⭐ Ruota dei Desideri</button>
          <button
            className="hud-insegna"
            style={{ ["--luce" as string]: "#ffb070" }}
            onClick={onAngolo}
          >🔥 Angolo di Lettura</button>
          <button
            className="hud-insegna"
            style={{ ["--luce" as string]: temaDi("desideri").luce }}
            onClick={onDesideri}
          >🛒 Lista desideri</button>
          <button
            className="hud-insegna"
            style={{ ["--luce" as string]: "#e0c8ff" }}
            onClick={onPersonalizza}
          >🪄 Arreda</button>
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
              >{tema.icona} {s.nome} <small>({s.libri.length})</small></button>
            );
          })}
        </div>

        <button
          className="hud-freccia"
          aria-label="Scorri avanti"
          onClick={() => pisteRef.current?.scrollBy({ left: 260 })}
        >›</button>
      </div>
    </div>
  );
}
