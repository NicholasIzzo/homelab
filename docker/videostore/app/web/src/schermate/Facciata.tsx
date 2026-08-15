interface Props {
  pronta: boolean;
  onEntra: () => void;
}

/** La vetrina notturna: insegna al neon, porta a vetri, cartello APERTO. */
export function Facciata({ pronta, onEntra }: Props) {
  return (
    <div className="facciata">
      <div className="facciata-cielo">
        <span className="stella" style={{ left: "12%", top: "18%" }} />
        <span className="stella" style={{ left: "31%", top: "9%" }} />
        <span className="stella" style={{ left: "58%", top: "14%" }} />
        <span className="stella" style={{ left: "76%", top: "7%" }} />
        <span className="stella" style={{ left: "89%", top: "21%" }} />
        <span className="luna" />
      </div>

      <div className="facciata-edificio">
        <div className="insegna-neon">
          <span className="insegna-video">VIDEO</span>
          <span className="insegna-teca">TECA</span>
        </div>
        <p className="insegna-sotto">— noleggio film · vhs · dvd · serie tv —</p>

        <div className="vetrina-fila">
          <div className="vetrina">
            <div className="poster-vetrina p1">NOVITÀ<br />OGNI<br />SETTIMANA</div>
            <div className="poster-vetrina p2">2 FILM<br />1 PIZZA<br />= SERATA</div>
          </div>

          <button
            className="porta"
            onClick={onEntra}
            disabled={!pronta}
            aria-label="Entra nella videoteca"
          >
            <span className={`cartello-aperto ${pronta ? "" : "spento"}`}>
              {pronta ? "APERTO" : "ATTENDI…"}
            </span>
            <span className="porta-vetro" />
            <span className="porta-maniglia" />
            <span className="porta-invito">{pronta ? "Spingi per entrare" : "Accendendo le luci…"}</span>
          </button>

          <div className="vetrina">
            <div className="poster-vetrina p3">SEZIONE<br />HORROR<br />🩸</div>
            <div className="poster-vetrina p4">SIATE<br />GENTILI<br />RIAVVOLGETE</div>
          </div>
        </div>

        <div className="marciapiede" />
      </div>
    </div>
  );
}
