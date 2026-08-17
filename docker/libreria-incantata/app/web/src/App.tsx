import { useEffect, useMemo, useState } from "react";
import { caricaBiblioteca, libriLocali, type NomeSorgente } from "./sorgenti";
import type { BibliotecaPayload, Libro } from "./tipi";
import { temaDi } from "./temi";
import { Ingresso } from "./schermate/Ingresso";
import { Biblioteca3DView } from "./biblioteca3d/Biblioteca3DView";
import { Dettaglio } from "./schermate/Dettaglio";
import { Roulette } from "./schermate/Roulette";
import { Desideri } from "./schermate/Desideri";
import { AngoloLettura } from "./schermate/AngoloLettura";
import { Personalizza } from "./schermate/Personalizza";
import { ImportaEpub } from "./schermate/ImportaEpub";
import { leggiPreferenze, salvaPreferenze, type Preferenze } from "./personalizza";

type Overlay =
  | { tipo: "nessuno" }
  /** Quale ruota: quella dei libri da leggere o quella dei desideri. */
  | { tipo: "roulette"; fonte: "lettura" | "desideri" }
  | { tipo: "desideri" }
  | { tipo: "dettaglio"; libro: Libro }
  | { tipo: "angolo"; libro: Libro }
  | { tipo: "personalizza" }
  | { tipo: "importa" };

function aCaso<T>(lista: T[]): T | null {
  if (lista.length === 0) return null;
  return lista[Math.floor(Math.random() * lista.length)] ?? null;
}

export function App() {
  const [dentro, setDentro] = useState(false);
  const [overlay, setOverlay] = useState<Overlay>({ tipo: "nessuno" });
  const [dati, setDati] = useState<BibliotecaPayload | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [pref, setPref] = useState<Preferenze>(() => leggiPreferenze());
  const [sorgente, setSorgente] = useState<NomeSorgente>("server");
  const [nLocali, setNLocali] = useState(0);

  const cambiaPref = (p: Preferenze) => {
    setPref(p);
    salvaPreferenze(p);
  };

  const ricarica = (s: NomeSorgente) => {
    setDati(null);
    caricaBiblioteca(s)
      .then(setDati)
      .catch((e: unknown) => setErrore(String(e)));
  };

  useEffect(() => {
    void libriLocali().then(setNLocali);
    ricarica(sorgente);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorgente]);

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

  const desideri = dati?.desideri ?? [];

  const apriAngolo = (libro: Libro | null) => {
    if (libro) setOverlay({ tipo: "angolo", libro });
  };

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
        sorgente={sorgente}
        nLocali={nLocali}
        onEntra={() => setDentro(true)}
        onImporta={() => {
          setSorgente("epub");
          setOverlay({ tipo: "importa" });
          setDentro(true);
        }}
        onSorgente={setSorgente}
      />
    );
  }

  return (
    <>
      <Biblioteca3DView
        scaffali={dati?.scaffali ?? []}
        desideri={desideri}
        mock={dati?.mock ?? false}
        onPick={(libro) => setOverlay({ tipo: "dettaglio", libro })}
        onRoulette={() => setOverlay({ tipo: "roulette", fonte: "lettura" })}
        onRouletteDesideri={() => setOverlay({ tipo: "roulette", fonte: "desideri" })}
        onDesideri={() => setOverlay({ tipo: "desideri" })}
        onAngolo={() => apriAngolo(aCaso(tuttiILibri))}
        onPersonalizza={() => setOverlay({ tipo: "personalizza" })}
        onImporta={() => setOverlay({ tipo: "importa" })}
        onEsci={() => setDentro(false)}
        attiva={overlay.tipo !== "angolo"}
        pref={pref}
      />

      {overlay.tipo === "importa" && (
        <div className="overlay">
          <ImportaEpub
            onFatto={async () => {
              setNLocali(await libriLocali());
              ricarica("epub");
              setOverlay({ tipo: "nessuno" });
            }}
            onChiudi={() => setOverlay({ tipo: "nessuno" })}
          />
        </div>
      )}

      {overlay.tipo === "personalizza" && (
        <div className="overlay">
          <Personalizza
            pref={pref}
            libri={tuttiILibri}
            onCambia={cambiaPref}
            onChiudi={() => setOverlay({ tipo: "nessuno" })}
          />
        </div>
      )}

      {overlay.tipo === "roulette" && overlay.fonte === "lettura" && (
        <div className="overlay">
          <Roulette
            libri={tuttiILibri}
            titolo="🔮 La Ruota del Destino"
            sottotitolo="Le pagine girano nel vuoto…"
            etichetta="📖 Leggo questo!"
            luce={temaDi("recenti").luce}
            onScegli={(libro) => setOverlay({ tipo: "dettaglio", libro })}
            onChiudi={() => setOverlay({ tipo: "nessuno" })}
          />
        </div>
      )}

      {overlay.tipo === "roulette" && overlay.fonte === "desideri" && (
        <div className="overlay">
          <Roulette
            libri={desideri}
            titolo="⭐ La Ruota dei Desideri"
            sottotitolo="Il prossimo da mettere nel carrello…"
            etichetta="🛒 Voglio questo!"
            luce={temaDi("desideri").luce}
            onScegli={(libro) => setOverlay({ tipo: "dettaglio", libro })}
            onChiudi={() => setOverlay({ tipo: "nessuno" })}
          />
        </div>
      )}

      {overlay.tipo === "desideri" && (
        <div className="overlay">
          <Desideri
            desideri={desideri}
            onApri={(libro) => setOverlay({ tipo: "dettaglio", libro })}
            onChiudi={() => setOverlay({ tipo: "nessuno" })}
          />
        </div>
      )}

      {overlay.tipo === "dettaglio" && (
        <div className="overlay" onClick={() => setOverlay({ tipo: "nessuno" })}>
          <div onClick={(e) => e.stopPropagation()}>
            <Dettaglio
              libro={overlay.libro}
              onLeggi={() => apriAngolo(overlay.libro)}
              onChiudi={() => setOverlay({ tipo: "nessuno" })}
            />
          </div>
        </div>
      )}

      {overlay.tipo === "angolo" && (
        <AngoloLettura
          libro={overlay.libro}
          onCambiaLibro={() =>
            apriAngolo(
              aCaso(
                (overlay.libro.fonte === "amazon" ? desideri : tuttiILibri).filter(
                  (l) => l.id !== overlay.libro.id,
                ),
              ),
            )
          }
          onChiudi={() => setOverlay({ tipo: "nessuno" })}
        />
      )}
    </>
  );
}
