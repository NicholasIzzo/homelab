import { coverUrl } from "../api";
import type { StoreItem } from "../tipi";

interface Props {
  item: StoreItem;
  deviceName: string;
  onTornaAlNegozio: () => void;
}

/** Noleggio riuscito: il film sta partendo sulla TV. */
export function BuonaVisione({ item, deviceName, onTornaAlNegozio }: Props) {
  return (
    <div className="buonavisione">
      <div className="crt">
        <div className="crt-schermo">
          <img src={coverUrl(item.id, 400)} alt={item.title} />
          <div className="crt-scanline" />
        </div>
        <div className="crt-piedistallo" />
      </div>
      <h1 className="buonavisione-titolo">Buona visione! 🍿</h1>
      <p className="buonavisione-testo">
        <strong>{item.title}</strong> sta partendo su <strong>{deviceName}</strong>.
      </p>
      <p className="buonavisione-nota">Riconsegna entro 7 giorni… scherziamo, è tuo. 😄</p>
      <button className="btn-noleggia" onClick={onTornaAlNegozio}>
        ← Torna in videoteca
      </button>
    </div>
  );
}
