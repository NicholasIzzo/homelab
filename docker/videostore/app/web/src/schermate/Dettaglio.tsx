import { coverUrl } from "../api";
import { temaDi } from "../temi";
import type { StoreItem } from "../tipi";

interface Props {
  shelfId: string;
  item: StoreItem;
  onNoleggia: () => void;
  onRimetti: () => void;
}

function durata(item: StoreItem): string {
  if (item.type === "series") return "Serie TV";
  if (!item.runtimeMinutes) return "";
  const h = Math.floor(item.runtimeMinutes / 60);
  const m = item.runtimeMinutes % 60;
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

/** La scatola in mano: copertina davanti, retro con la trama, tasto NOLEGGIA. */
export function Dettaglio({ shelfId, item, onNoleggia, onRimetti }: Props) {
  const tema = temaDi(shelfId);
  return (
    <div className="dettaglio" style={{ ["--neon" as string]: tema.neon }}>
      <div className="scatola">
        <div className="scatola-fronte">
          <img src={coverUrl(item.id, 700)} alt={item.title} />
        </div>

        <div className="scatola-retro">
          <h2>{item.title}</h2>
          <p className="scatola-meta">
            {[
              item.year,
              durata(item),
              item.officialRating,
              item.communityRating ? `★ ${item.communityRating.toFixed(1)}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className="scatola-generi">{item.genres.join(" / ")}</p>
          <p className="scatola-trama">{item.overview || "Nessuna trama sul retro della scatola."}</p>

          <div className="scatola-azioni">
            <button className="btn-noleggia" onClick={onNoleggia}>
              🎬 NOLEGGIA
            </button>
            <button className="btn-rimetti" onClick={onRimetti}>
              Rimetti sullo scaffale
            </button>
          </div>

          <p className="scatola-avviso">Siate gentili, riavvolgete il nastro ⏪</p>
        </div>
      </div>
    </div>
  );
}
