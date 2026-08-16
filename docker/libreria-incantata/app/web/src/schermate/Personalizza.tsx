import {
  ATMOSFERE,
  ESSENZE,
  LUCI,
  type Preferenze,
} from "../personalizza";

interface Props {
  pref: Preferenze;
  onCambia: (p: Preferenze) => void;
  onChiudi: () => void;
}

/** Pannello per arredare la biblioteca: legno, luci, atmosfera, decori. */
export function Personalizza({ pref, onCambia, onChiudi }: Props) {
  return (
    <div className="personalizza">
      <button className="scheda-chiudi" onClick={onChiudi} aria-label="Chiudi">✕</button>
      <h1 className="personalizza-titolo">🪄 Arreda la biblioteca</h1>
      <p className="personalizza-sotto">
        Le scelte restano su questo dispositivo: puoi averla diversa dal telefono e dal PC.
      </p>

      <section className="personalizza-gruppo">
        <h2>Essenza del legno</h2>
        <div className="personalizza-scelte">
          {ESSENZE.map((e) => (
            <button
              key={e.id}
              className={`scelta ${pref.essenza === e.id ? "attiva" : ""}`}
              onClick={() => onCambia({ ...pref, essenza: e.id })}
            >
              <span className="scelta-campione" style={{ background: e.campione }} />
              {e.nome}
            </button>
          ))}
        </div>
      </section>

      <section className="personalizza-gruppo">
        <h2>Luce dei ripiani</h2>
        <div className="personalizza-scelte">
          {LUCI.map((l) => (
            <button
              key={l.id}
              className={`scelta ${pref.luce === l.id ? "attiva" : ""}`}
              onClick={() => onCambia({ ...pref, luce: l.id })}
            >
              <span
                className="scelta-campione"
                style={{
                  background:
                    l.colore ??
                    "linear-gradient(90deg,#ff8a3c,#57e3c2,#ff6f9d)",
                }}
              />
              {l.nome}
            </button>
          ))}
        </div>
      </section>

      <section className="personalizza-gruppo">
        <h2>Atmosfera della sala</h2>
        <div className="personalizza-scelte">
          {ATMOSFERE.map((a) => (
            <button
              key={a.id}
              className={`scelta ${pref.atmosfera === a.id ? "attiva" : ""}`}
              onClick={() => onCambia({ ...pref, atmosfera: a.id })}
            >
              <span className="scelta-campione" style={{ background: a.campione }} />
              {a.nome}
            </button>
          ))}
        </div>
      </section>

      <section className="personalizza-gruppo">
        <h2>Dettagli fantasy</h2>
        <div className="personalizza-scelte">
          <button
            className={`scelta ${pref.decori ? "attiva" : ""}`}
            onClick={() => onCambia({ ...pref, decori: true })}
          >
            <span className="scelta-campione">🕯️</span> Lanterne, rune e ampolle
          </button>
          <button
            className={`scelta ${!pref.decori ? "attiva" : ""}`}
            onClick={() => onCambia({ ...pref, decori: false })}
          >
            <span className="scelta-campione">·</span> Sala essenziale
          </button>
        </div>
      </section>

      <button className="btn-oro personalizza-chiudi" onClick={onChiudi}>
        ✨ Torna alla biblioteca
      </button>
    </div>
  );
}
