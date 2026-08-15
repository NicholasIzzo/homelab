import { useEffect, useState } from "react";
import { coverUrl, fetchDevices, jellyfinWebUrl, play } from "../api";
import type { PlayDevice, StoreItem } from "../tipi";

interface Props {
  item: StoreItem;
  onFatto: (deviceName: string) => void;
  onQui: () => void;
  onAnnulla: () => void;
}

function vistoDaQuanto(iso: string | null): string {
  if (!iso) return "";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 3) return "🟢 attivo ora";
  if (min < 60) return `🟡 visto ${min} min fa`;
  return `🟡 visto ${Math.round(min / 60)}h fa — apri l'app sulla TV se non parte`;
}

type Stato =
  | { fase: "carico" }
  | { fase: "scelta"; devices: PlayDevice[] }
  | { fase: "invio"; device: PlayDevice }
  | { fase: "nonparte"; device: PlayDevice }
  | { fase: "errore"; messaggio: string };

/** La cassa: il commesso chiede su quale schermo far partire il film. */
export function Cassa({ item, onFatto, onQui, onAnnulla }: Props) {
  const [stato, setStato] = useState<Stato>({ fase: "carico" });
  const [urlJellyfin, setUrlJellyfin] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    jellyfinWebUrl(item.id)
      .then((u) => {
        if (vivo) setUrlJellyfin(u);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [item.id]);

  const apriSuJellyfin = () => {
    if (urlJellyfin) window.open(urlJellyfin, "_blank", "noopener");
  };

  useEffect(() => {
    let vivo = true;
    fetchDevices()
      .then(({ devices }) => {
        if (vivo) setStato({ fase: "scelta", devices });
      })
      .catch((e: unknown) => {
        if (vivo) setStato({ fase: "errore", messaggio: String(e) });
      });
    return () => {
      vivo = false;
    };
  }, []);

  const noleggia = async (device: PlayDevice) => {
    setStato({ fase: "invio", device });
    try {
      const { avviato } = await play(device.sessionId, item.id);
      if (avviato) {
        onFatto(device.deviceName);
      } else {
        setStato({ fase: "nonparte", device });
      }
    } catch (e) {
      setStato({ fase: "errore", messaggio: String(e) });
    }
  };

  return (
    <div className="cassa">
      <div className="bancone">
        <div className="commesso" aria-hidden>
          <span className="commesso-faccia">😎</span>
          <span className="commesso-badge">GINO · commesso</span>
        </div>

        <div className="cassa-dialogo">
          <div className="cassa-scatolina">
            <img src={coverUrl(item.id, 260)} alt={item.title} />
          </div>

          {stato.fase === "carico" && <p className="fumetto">«Ottima scelta! Controllo le TV…»</p>}

          {stato.fase === "scelta" && stato.devices.length === 0 && (
            <div className="fumetto">
              <p>«Non vedo schermi remoti accesi! Apri l'app sulla TV e riprova… oppure te lo proietto qui.»</p>
              {item.type === "movie" && (
                <button className="btn-noleggia" onClick={onQui}>
                  🖥️ Guardalo qui
                </button>
              )}
              {urlJellyfin && (
                <button className="btn-noleggia" onClick={apriSuJellyfin}>
                  🌐 Apri su Jellyfin
                </button>
              )}
              <button className="btn-rimetti" onClick={() => setStato({ fase: "carico" })}>
                Ricontrolla gli schermi
              </button>
            </div>
          )}

          {stato.fase === "scelta" && stato.devices.length > 0 && (
            <div className="fumetto">
              <p>«Dove te lo faccio partire?»</p>
              <div className="lista-dispositivi">
                {item.type === "movie" && (
                  <button className="dispositivo dispositivo-qui" onClick={onQui}>
                    <span className="dispositivo-nome">🖥️ Qui, su questo schermo</span>
                    <span className="dispositivo-info">parte subito nel browser, senza attese</span>
                  </button>
                )}
                {urlJellyfin && (
                  <button className="dispositivo dispositivo-qui" onClick={apriSuJellyfin}>
                    <span className="dispositivo-nome">🌐 Apri su Jellyfin</span>
                    <span className="dispositivo-info">
                      nuova scheda col player completo: tracce audio, sottotitoli, avanti/indietro
                    </span>
                  </button>
                )}
                {stato.devices.map((d) => (
                  <button key={d.sessionId} className="dispositivo" onClick={() => noleggia(d)}>
                    <span className="dispositivo-nome">📺 {d.deviceName}</span>
                    <span className="dispositivo-info">
                      {d.client}
                      {d.userName ? ` · ${d.userName}` : ""}
                      {d.nowPlaying ? ` · sta guardando: ${d.nowPlaying}` : ""}
                      {" · "}
                      {vistoDaQuanto(d.lastActivity)}
                      {d.client === "Wholphin" &&
                        " · ⚠️ Wholphin a volte ignora il comando: se non parte usa l'app Jellyfin"}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {stato.fase === "invio" && (
            <p className="fumetto">«Lo mando su {stato.device.deviceName}… controllo che parta 📼»</p>
          )}

          {stato.fase === "nonparte" && (
            <div className="fumetto">
              <p>
                «Ho mandato il film a <strong>{stato.device.deviceName}</strong>, ma lo schermo non
                risponde: probabilmente l'app è chiusa. Aprila (o riportala in primo piano) e
                riprova!»
              </p>
              <button className="btn-noleggia" onClick={() => noleggia(stato.device)}>
                Riprova su {stato.device.deviceName}
              </button>
              {urlJellyfin && (
                <button className="btn-noleggia" onClick={apriSuJellyfin}>
                  🌐 Aprilo su Jellyfin
                </button>
              )}
              <button className="btn-rimetti" onClick={() => setStato({ fase: "carico" })}>
                Scegli un altro schermo
              </button>
            </div>
          )}

          {stato.fase === "errore" && (
            <div className="fumetto">
              <p>«Ehm, il registratore fa i capricci: {stato.messaggio}»</p>
              <button className="btn-noleggia" onClick={() => setStato({ fase: "carico" })}>
                Riprova
              </button>
            </div>
          )}

          <button className="btn-rimetti" onClick={onAnnulla}>
            ← Torna alla scatola
          </button>
        </div>
      </div>
    </div>
  );
}
