import type { NomeSorgente } from "../sorgenti";

interface Props {
  lettrice: string;
  pronta: boolean;
  /** Quale biblioteca si sta guardando: quella del server o la propria. */
  sorgente: NomeSorgente;
  /** Quanti libri sono già stati importati su questo dispositivo. */
  nLocali: number;
  onEntra: () => void;
  onImporta: () => void;
  onSorgente: (s: NomeSorgente) => void;
}

/** La grande porta: sipario d'ingresso prima di varcare la biblioteca. */
export function Ingresso({
  lettrice,
  pronta,
  sorgente,
  nLocali,
  onEntra,
  onImporta,
  onSorgente,
}: Props) {
  const propria = sorgente === "epub";
  return (
    <div className="ingresso">
      <div className="ingresso-stelle" aria-hidden />
      <div className="ingresso-cuore">
        <p className="ingresso-occhiello">✦ ✦ ✦</p>
        <h1 className="ingresso-titolo">La Biblioteca Incantata</h1>
        <p className="ingresso-lettrice">
          {propria ? (
            <>
              la <strong>tua</strong> biblioteca
              {nLocali > 0 && <> · {nLocali} libri</>}
            </>
          ) : (
            <>
              i grimori di <strong>{lettrice || "…"}</strong>
            </>
          )}
        </p>
        <p className="ingresso-sotto">
          Ogni copertina è un libro che aspetta il suo momento. Indecisa?
          Lascia scegliere alla <em>Ruota del Destino</em>.
        </p>

        <div className="ingresso-azioni">
          <button className="btn-oro grande" disabled={!pronta} onClick={onEntra}>
            {pronta ? "🗝️ Varca la soglia" : "Accendo le candele…"}
          </button>
          <button className="btn-fantasma" onClick={onImporta}>
            📚 {nLocali > 0 ? "Gestisci i tuoi libri" : "Porta i tuoi libri (EPUB)"}
          </button>
        </div>

        {nLocali > 0 && (
          <div className="ingresso-sorgenti">
            <button
              className={`scelta ${!propria ? "attiva" : ""}`}
              onClick={() => onSorgente("server")}
            >
              Biblioteca di casa
            </button>
            <button
              className={`scelta ${propria ? "attiva" : ""}`}
              onClick={() => onSorgente("epub")}
            >
              La mia ({nLocali})
            </button>
          </div>
        )}

        <p className="ingresso-nota">
          I tuoi EPUB restano su questo dispositivo: non vengono caricati da nessuna parte,
          e per questo non serve nessun account.
        </p>
      </div>
      <div className="ingresso-fumo" aria-hidden />
    </div>
  );
}
