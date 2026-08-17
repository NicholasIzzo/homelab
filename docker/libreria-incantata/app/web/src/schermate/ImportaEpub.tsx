import { useEffect, useRef, useState } from "react";
import {
  LIMITE_FILE,
  elencoVoci,
  idLibro,
  salvaVoce,
  spazio,
  svuotaArchivio,
  type VoceArchivio,
} from "../epub/archivio";
import { regole, scaffaleDi } from "../epub/generi";
import { leggiEpub } from "../epub/leggiEpub";

interface Props {
  onFatto: () => void;
  onChiudi: () => void;
}

interface Esito {
  nome: string;
  stato: "ok" | "salta" | "errore";
  dettaglio?: string;
}

const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`;

/** Import degli EPUB dal dispositivo: i file non lasciano il browser. */
export function ImportaEpub({ onFatto, onChiudi }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [inCorso, setInCorso] = useState(false);
  const [fatti, setFatti] = useState(0);
  const [totale, setTotale] = useState(0);
  const [corrente, setCorrente] = useState("");
  const [esiti, setEsiti] = useState<Esito[]>([]);
  const [presenti, setPresenti] = useState(0);
  const [occupato, setOccupato] = useState(0);

  const aggiorna = async () => {
    const voci = await elencoVoci();
    setPresenti(voci.length);
    setOccupato((await spazio()).usati);
  };

  useEffect(() => {
    void aggiorna();
    // Gancio di prova (?diag=1): permette di verificare l'import senza passare
    // dal selettore di file, che per sicurezza non è pilotabile da script.
    if (new URLSearchParams(location.search).get("diag") === "1") {
      (window as unknown as { __importaEpub?: unknown }).__importaEpub = (f: File[]) =>
        importa(f as unknown as FileList);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function importa(files: FileList) {
    const epub = Array.from(files).filter((f) => /\.epub$/i.test(f.name));
    if (epub.length === 0) {
      setEsiti([{ nome: "—", stato: "errore", dettaglio: "nessun file .epub selezionato" }]);
      return;
    }
    setInCorso(true);
    setTotale(epub.length);
    setFatti(0);
    setEsiti([]);

    const r = await regole();
    const giaPresenti = new Set((await elencoVoci()).map((v) => v.id));
    const nuoviEsiti: Esito[] = [];

    for (let i = 0; i < epub.length; i++) {
      const file = epub[i]!;
      setCorrente(file.name);
      try {
        const dati = await leggiEpub(file);
        const id = idLibro(dati.titolo, dati.autore);
        if (giaPresenti.has(id)) {
          nuoviEsiti.push({ nome: dati.titolo, stato: "salta", dettaglio: "già in libreria" });
        } else {
          const voce: VoceArchivio = {
            id,
            titolo: dati.titolo,
            autore: dati.autore,
            soggetti: dati.soggetti,
            lingua: dati.lingua,
            anno: dati.anno,
            descrizione: dati.descrizione,
            scaffale: scaffaleDi(
              { titolo: dati.titolo, autore: dati.autore, soggetti: dati.soggetti },
              r,
            ),
            copertina: dati.copertina,
            capitoli: dati.capitoli,
            // Sopra la soglia si tiene solo la scheda: un archivio di file
            // enormi riempirebbe lo spazio concesso al browser.
            file: file.size <= LIMITE_FILE ? file : null,
            nomeFile: file.name,
            byte: file.size <= LIMITE_FILE ? file.size : (dati.copertina?.size ?? 0),
            aggiunto: new Date().toISOString(),
          };
          await salvaVoce(voce);
          giaPresenti.add(id);
          nuoviEsiti.push({
            nome: dati.titolo,
            stato: "ok",
            dettaglio: voce.file ? undefined : "troppo grande: salvata solo la scheda",
          });
        }
      } catch (e) {
        nuoviEsiti.push({ nome: file.name, stato: "errore", dettaglio: String(e).slice(0, 90) });
      }
      setFatti(i + 1);
      setEsiti([...nuoviEsiti]);
      // un respiro al browser, così la barra si muove davvero
      await new Promise((r2) => setTimeout(r2, 0));
    }

    setCorrente("");
    setInCorso(false);
    await aggiorna();
  }

  const ok = esiti.filter((e) => e.stato === "ok").length;
  const saltati = esiti.filter((e) => e.stato === "salta").length;
  const errori = esiti.filter((e) => e.stato === "errore");

  return (
    <div className="importa">
      <button className="scheda-chiudi" onClick={onChiudi} aria-label="Chiudi">✕</button>
      <h1 className="importa-titolo">📚 Porta i tuoi libri</h1>
      <p className="importa-sotto">
        Scegli i tuoi file <strong>EPUB</strong>: titolo, autore, copertina e genere vengono
        letti qui nel browser e i libri finiscono sugli scaffali.
        <br />
        <strong>I file non vengono caricati da nessuna parte</strong>: restano su questo
        dispositivo, e per questo non serve alcun account.
      </p>

      <input
        ref={inputRef}
        type="file"
        accept=".epub,application/epub+zip"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) void importa(e.target.files);
        }}
      />

      <div className="importa-azioni">
        <button className="btn-oro" disabled={inCorso} onClick={() => inputRef.current?.click()}>
          {inCorso ? "Sto leggendo…" : "📂 Scegli i file EPUB"}
        </button>
        {presenti > 0 && !inCorso && (
          <button className="btn-fantasma" onClick={onFatto}>
            ✨ Entra nella tua biblioteca ({presenti})
          </button>
        )}
      </div>

      {presenti > 0 && (
        <p className="importa-spazio">
          {presenti} libri sul dispositivo · {mb(occupato)} occupati
          {!inCorso && (
            <button
              className="importa-svuota"
              onClick={async () => {
                if (!confirm("Svuotare la biblioteca di questo dispositivo?")) return;
                await svuotaArchivio();
                setEsiti([]);
                await aggiorna();
              }}
            >
              svuota
            </button>
          )}
        </p>
      )}

      {inCorso && (
        <div className="importa-barra">
          <div className="importa-barra-piena" style={{ width: `${(fatti / totale) * 100}%` }} />
          <span>
            {fatti} / {totale} — {corrente}
          </span>
        </div>
      )}

      {esiti.length > 0 && !inCorso && (
        <div className="importa-esito">
          <p>
            <strong>{ok}</strong> importati
            {saltati > 0 && <> · {saltati} già presenti</>}
            {errori.length > 0 && <> · {errori.length} non letti</>}
          </p>
          {errori.length > 0 && (
            <ul className="importa-errori">
              {errori.slice(0, 6).map((e, i) => (
                <li key={i}>
                  {e.nome}: {e.dettaglio}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
