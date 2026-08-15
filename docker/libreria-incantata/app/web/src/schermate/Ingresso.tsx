interface Props {
  lettrice: string;
  pronta: boolean;
  onEntra: () => void;
}

/** La grande porta: sipario d'ingresso prima di varcare la biblioteca. */
export function Ingresso({ lettrice, pronta, onEntra }: Props) {
  return (
    <div className="ingresso">
      <div className="ingresso-stelle" aria-hidden />
      <div className="ingresso-cuore">
        <p className="ingresso-occhiello">✦ ✦ ✦</p>
        <h1 className="ingresso-titolo">La Biblioteca Incantata</h1>
        <p className="ingresso-lettrice">
          i grimori di <strong>{lettrice || "…"}</strong>
        </p>
        <p className="ingresso-sotto">
          Ogni copertina è un libro che aspetta il suo momento. Indecisa?
          Lascia scegliere alla <em>Ruota del Destino</em>.
        </p>
        <button className="btn-oro grande" disabled={!pronta} onClick={onEntra}>
          {pronta ? "🗝️ Varca la soglia" : "Accendo le candele…"}
        </button>
      </div>
      <div className="ingresso-fumo" aria-hidden />
    </div>
  );
}
