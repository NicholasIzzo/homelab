import { useEffect, useMemo, useState } from "react";
import { fetchBiblioteca } from "./api";
import type { BibliotecaPayload, Libro } from "./tipi";
import { Ingresso } from "./schermate/Ingresso";
import { Biblioteca3DView } from "./biblioteca3d/Biblioteca3DView";
import { Dettaglio } from "./schermate/Dettaglio";
import { Roulette } from "./schermate/Roulette";
import { Desideri } from "./schermate/Desideri";

type Overlay =
  | { tipo: "nessuno" }
  | { tipo: "roulette" }
  | { tipo: "desideri" }
  | { tipo: "dettaglio"; libro: Libro };

export function App() {
  const [dentro, setDentro] = useState(false);
  const [overlay, setOverlay] = useState<Overlay>({ tipo: "nessuno" });
  const [dati, setDati] = useState<BibliotecaPayload | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    fetchBiblioteca()
      .then(setDati)
      .catch((e: unknown) => setErrore(String(e)));
  }, []);

  // Tutti i libri "da leggere", senza i doppioni dello scaffale "Appena Sussurrati".
  const tuttiILibri = useMemo(() => {
    const visti = new Set<string>();
    const lista: Libro[] = [];
    for (const s of dati?.scaffali ?? []) {
      if (s.id === "recenti") continue;
      for (const libro of s.libri) {
        if (!visti.has(libro.id)) {
          visti.add(libro.id);
          lista.push(libro);
        }
      }
    }
    return lista;
  }, [dati]);

  if (errore) {
    return (
      <div className="errore-schermo">
        <p>🕯️ La biblioteca è al buio: {errore}</p>
        <button className="btn-oro" onClick={() => location.reload()}>Riprova</button>
      </div>
    );
  }

  if (!dentro) {
    return (
      <Ingresso
        lettrice={dati?.lettrice ?? ""}
        pronta={dati !== null}
        onEntra={() => setDentro(true)}
      />
    );
  }

  return (
    <>
      <Biblioteca3DView
        scaffali={dati?.scaffali ?? []}
        desideri={dati?.desideri ?? []}
        mock={dati?.mock ?? false}
        onPick={(libro) => setOverlay({ tipo: "dettaglio", libro })}
        onRoulette={() => setOverlay({ tipo: "roulette" })}
        onDesideri={() => setOverlay({ tipo: "desideri" })}
        onEsci={() => setDentro(false)}
      />

      {overlay.tipo === "roulette" && (
        <div className="overlay">
          <Roulette
            libri={tuttiILibri}
            onScegli={(libro) => setOverlay({ tipo: "dettaglio", libro })}
            onChiudi={() => setOverlay({ tipo: "nessuno" })}
          />
        </div>
      )}

      {overlay.tipo === "desideri" && (
        <div className="overlay">
          <Desideri
            desideri={dati?.desideri ?? []}
            onApri={(libro) => setOverlay({ tipo: "dettaglio", libro })}
            onChiudi={() => setOverlay({ tipo: "nessuno" })}
          />
        </div>
      )}

      {overlay.tipo === "dettaglio" && (
        <div className="overlay" onClick={() => setOverlay({ tipo: "nessuno" })}>
          <div onClick={(e) => e.stopPropagation()}>
            <Dettaglio libro={overlay.libro} onChiudi={() => setOverlay({ tipo: "nessuno" })} />
          </div>
        </div>
      )}
    </>
  );
}
