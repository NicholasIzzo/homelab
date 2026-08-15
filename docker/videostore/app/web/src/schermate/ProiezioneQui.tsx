import { useState } from "react";
import type { StoreItem } from "../tipi";

interface Props {
  item: StoreItem;
  onChiudi: () => void;
}

/** Proiezione privata: il film parte qui, nel browser, dentro la videoteca. */
export function ProiezioneQui({ item, onChiudi }: Props) {
  const [errore, setErrore] = useState(false);

  return (
    <div className="proiezione">
      <div className="proiezione-testata">
        <h2>🎬 {item.title}</h2>
        <button className="btn-rimetti" onClick={onChiudi}>
          ✕ Fine proiezione
        </button>
      </div>

      {errore ? (
        <div className="proiezione-errore">
          <p>
            😖 Questo formato non si riproduce nel browser. Riportalo alla cassa e scegli uno
            schermo remoto (la TV col suo client lo digerisce di sicuro).
          </p>
          <button className="btn-noleggia" onClick={onChiudi}>
            ← Torna al negozio
          </button>
        </div>
      ) : (
        <video
          className="proiezione-video"
          src={`/api/stream/${item.id}`}
          autoPlay
          controls
          onError={() => setErrore(true)}
        />
      )}
    </div>
  );
}
