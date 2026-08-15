import { useEffect, useMemo, useState } from "react";
import { fetchStore } from "./api";
import type { StoreItem, StorePayload } from "./tipi";
import { Facciata } from "./schermate/Facciata";
import { Negozio3DView } from "./negozio3d/Negozio3DView";
import { Dettaglio } from "./schermate/Dettaglio";
import { Cassa } from "./schermate/Cassa";
import { BuonaVisione } from "./schermate/BuonaVisione";
import { Roulette } from "./schermate/Roulette";
import { ProiezioneQui } from "./schermate/ProiezioneQui";
import { Chiosco } from "./schermate/Chiosco";

type Overlay =
  | { tipo: "nessuno" }
  | { tipo: "roulette" }
  | { tipo: "chiosco" }
  | { tipo: "dettaglio"; shelfId: string; item: StoreItem }
  | { tipo: "cassa"; shelfId: string; item: StoreItem }
  | { tipo: "proiezione"; item: StoreItem }
  | { tipo: "buonavisione"; item: StoreItem; deviceName: string };

export function App() {
  const [dentro, setDentro] = useState(false);
  const [overlay, setOverlay] = useState<Overlay>({ tipo: "nessuno" });
  const [store, setStore] = useState<StorePayload | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [snacks, setSnacks] = useState<string[]>([]);

  useEffect(() => {
    fetchStore()
      .then(setStore)
      .catch((e: unknown) => setErrore(String(e)));
  }, []);

  // Tutti i titoli senza doppioni (le Novità ricompaiono negli scaffali di genere)
  const tuttiITitoli = useMemo(() => {
    const visti = new Set<string>();
    const lista: StoreItem[] = [];
    for (const shelf of store?.shelves ?? []) {
      for (const item of shelf.items) {
        if (!visti.has(item.id)) {
          visti.add(item.id);
          lista.push(item);
        }
      }
    }
    return lista;
  }, [store]);

  const scaffaleDi = (item: StoreItem): string =>
    store?.shelves.find((s) => s.id !== "novita" && s.items.some((i) => i.id === item.id))?.id ??
    "varie";

  if (errore) {
    return (
      <div className="errore-schermo">
        <p>⚠️ La videoteca è chiusa: {errore}</p>
        <button onClick={() => location.reload()}>Riprova</button>
      </div>
    );
  }

  if (!dentro) {
    return <Facciata pronta={store !== null} onEntra={() => setDentro(true)} />;
  }

  return (
    <>
      <Negozio3DView
        shelves={store?.shelves ?? []}
        mock={store?.mock ?? false}
        snacks={snacks}
        onPick={(item, shelfId) => setOverlay({ tipo: "dettaglio", shelfId, item })}
        onRoulette={() => setOverlay({ tipo: "roulette" })}
        onSnack={() => setOverlay({ tipo: "chiosco" })}
        onEsci={() => setDentro(false)}
      />

      {overlay.tipo === "chiosco" && (
        <div className="overlay">
          <Chiosco
            onPreso={(snack) => {
              setSnacks((s) => [...s, snack].slice(-6));
              setOverlay({ tipo: "nessuno" });
            }}
            onChiudi={() => setOverlay({ tipo: "nessuno" })}
          />
        </div>
      )}

      {overlay.tipo === "roulette" && (
        <div className="overlay">
          <Roulette
            items={tuttiITitoli}
            onNoleggia={(item) =>
              setOverlay({ tipo: "dettaglio", shelfId: scaffaleDi(item), item })
            }
            onChiudi={() => setOverlay({ tipo: "nessuno" })}
          />
        </div>
      )}

      {overlay.tipo === "dettaglio" && (
        <div className="overlay">
          <Dettaglio
            shelfId={overlay.shelfId}
            item={overlay.item}
            onNoleggia={() =>
              setOverlay({ tipo: "cassa", shelfId: overlay.shelfId, item: overlay.item })
            }
            onRimetti={() => setOverlay({ tipo: "nessuno" })}
          />
        </div>
      )}

      {overlay.tipo === "cassa" && (
        <div className="overlay">
          <Cassa
            item={overlay.item}
            onFatto={(deviceName) =>
              setOverlay({ tipo: "buonavisione", item: overlay.item, deviceName })
            }
            onQui={() => setOverlay({ tipo: "proiezione", item: overlay.item })}
            onAnnulla={() =>
              setOverlay({ tipo: "dettaglio", shelfId: overlay.shelfId, item: overlay.item })
            }
          />
        </div>
      )}

      {overlay.tipo === "proiezione" && (
        <div className="overlay">
          <ProiezioneQui item={overlay.item} onChiudi={() => setOverlay({ tipo: "nessuno" })} />
        </div>
      )}

      {overlay.tipo === "buonavisione" && (
        <div className="overlay">
          <BuonaVisione
            item={overlay.item}
            deviceName={overlay.deviceName}
            onTornaAlNegozio={() => setOverlay({ tipo: "nessuno" })}
          />
        </div>
      )}
    </>
  );
}
