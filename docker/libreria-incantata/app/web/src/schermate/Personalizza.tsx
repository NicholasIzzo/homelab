import { useMemo, useState } from "react";
import {
  ATMOSFERE,
  ESSENZE,
  LUCI,
  type Preferenze,
} from "../personalizza";
import { NOMI_BORDI, anteprimaBordo, type VarianteBordo } from "../biblioteca3d/bordi";
import { temaDi } from "../temi";
import type { Libro } from "../tipi";

interface Props {
  pref: Preferenze;
  /** I libri sugli scaffali: per ognuno si sceglie il taglio decorato. */
  libri: Libro[];
  onCambia: (p: Preferenze) => void;
  onChiudi: () => void;
}

/** Seme stabile per libro, così il disegno del taglio non cambia a ogni giro. */
function seme(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 9999;
}

/** Pannello per arredare la biblioteca: legno, luci, atmosfera, decori. */
export function Personalizza({ pref, libri, onCambia, onChiudi }: Props) {
  const [filtro, setFiltro] = useState("");

  const anteprime = useMemo(
    () =>
      libri.map((l) => {
        const colore = temaDi(l.scaffale).luce;
        const s = seme(l.id);
        return {
          libro: l,
          scelto: (pref.bordi[l.id] ?? 0) as VarianteBordo,
          immagini: [anteprimaBordo(colore, 0, s), anteprimaBordo(colore, 1, s)],
        };
      }),
    [libri, pref.bordi],
  );

  const visibili = anteprime.filter(({ libro }) =>
    `${libro.titoloBreve} ${libro.autore}`.toLowerCase().includes(filtro.toLowerCase()),
  );

  const scegliBordo = (id: string, v: VarianteBordo) =>
    onCambia({ ...pref, bordi: { ...pref.bordi, [id]: v } });

  const tuttiCosi = (v: VarianteBordo) => {
    const bordi: Record<string, 0 | 1> = { ...pref.bordi };
    for (const l of libri) bordi[l.id] = v;
    onCambia({ ...pref, bordi });
  };

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

      <section className="personalizza-gruppo">
        <h2>Tagli decorati ({libri.length} libri)</h2>
        <p className="bordi-nota">
          Nessun archivio pubblico associa a un libro il disegno reale del suo taglio:
          questi sono due motivi disegnati qui, intonati al colore del genere.
        </p>
        <div className="bordi-barra">
          <input
            className="bordi-cerca"
            type="search"
            placeholder="Cerca un titolo…"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
          />
          <button className="btn-fantasma" onClick={() => tuttiCosi(0)}>Tutti {NOMI_BORDI[0]}</button>
          <button className="btn-fantasma" onClick={() => tuttiCosi(1)}>Tutti {NOMI_BORDI[1]}</button>
        </div>
        <div className="bordi-elenco">
          {visibili.map(({ libro, scelto, immagini }) => (
            <div className="bordo-riga" key={libro.id}>
              <span className="bordo-titolo">
                {libro.titoloBreve}
                {libro.autore && <small> · {libro.autore}</small>}
              </span>
              <div className="bordo-scelte">
                {([0, 1] as VarianteBordo[]).map((v) => (
                  <button
                    key={v}
                    className={`bordo-opzione ${scelto === v ? "attiva" : ""}`}
                    title={NOMI_BORDI[v]}
                    onClick={() => scegliBordo(libro.id, v)}
                  >
                    <img src={immagini[v]} alt={NOMI_BORDI[v]} />
                    <span>{NOMI_BORDI[v]}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          {visibili.length === 0 && <p className="bordi-nota">Nessun titolo trovato.</p>}
        </div>
      </section>

      <button className="btn-oro personalizza-chiudi" onClick={onChiudi}>
        ✨ Torna alla biblioteca
      </button>
    </div>
  );
}
