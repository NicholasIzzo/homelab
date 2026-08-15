import { useEffect, useRef, useState } from "react";
import { ScenaAngolo } from "../angolo3d/scenaAngolo";
import { temaDi } from "../temi";
import type { Libro } from "../tipi";

interface Props {
  libro: Libro;
  onCambiaLibro: () => void;
  onChiudi: () => void;
}

/** L'angolo col camino: ci si siede e si sfoglia il libro scelto. */
export function AngoloLettura({ libro, onCambiaLibro, onChiudi }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scenaRef = useRef<ScenaAngolo | null>(null);
  const [pagine, setPagine] = useState({ totale: 1, corrente: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scena = new ScenaAngolo(canvas, libro, {
      onPagine: (totale, corrente) => setPagine({ totale, corrente }),
    });
    scenaRef.current = scena;
    if (new URLSearchParams(location.search).get("diag") === "1") {
      (window as unknown as { __angolo?: unknown }).__angolo = scena;
    }
    return () => {
      scenaRef.current = null;
      delete (window as unknown as { __angolo?: unknown }).__angolo;
      scena.dispose();
    };
  }, [libro]);

  // frecce della tastiera per sfogliare
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") scenaRef.current?.giraPagina(1);
      if (e.key === "ArrowLeft") scenaRef.current?.giraPagina(-1);
      if (e.key === "Escape") onChiudi();
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onChiudi]);

  const tema = temaDi(libro.scaffale);
  const ultima = pagine.corrente >= pagine.totale - 1;

  return (
    <div className="angolo" style={{ ["--luce" as string]: tema.luce }}>
      <canvas ref={canvasRef} className="angolo-canvas" />

      <div className="angolo-alto">
        <button className="btn-uscita" onClick={onChiudi}>← Torna alla biblioteca</button>
        <span className="angolo-titolo">
          {tema.icona} {libro.titoloBreve}
          {libro.autore && <small> · {libro.autore}</small>}
        </span>
      </div>

      <div className="angolo-basso">
        <button
          className="btn-fantasma"
          disabled={pagine.corrente === 0}
          onClick={() => scenaRef.current?.giraPagina(-1)}
          aria-label="Pagina precedente"
        >‹</button>
        <span className="angolo-pagina">
          {pagine.totale > 1 ? `pagina ${pagine.corrente + 1} di ${pagine.totale}` : "una pagina sola"}
        </span>
        <button
          className="btn-fantasma"
          disabled={ultima}
          onClick={() => scenaRef.current?.giraPagina(1)}
          aria-label="Pagina successiva"
        >›</button>
        <button className="btn-oro angolo-altro" onClick={onCambiaLibro}>
          🔮 Un altro libro
        </button>
      </div>
    </div>
  );
}
