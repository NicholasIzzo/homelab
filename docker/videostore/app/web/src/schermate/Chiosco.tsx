interface Props {
  onPreso: (snack: string) => void;
  onChiudi: () => void;
}

const MENU: [emoji: string, nome: string, prezzo: string][] = [
  ["🍿", "Popcorn grande", "£ 3.500"],
  ["🥤", "Bibita gigante", "£ 2.000"],
  ["🌭", "Hot dog", "£ 4.000"],
  ["🍫", "Cioccolato", "£ 1.500"],
  ["🍬", "Caramelle", "£ 1.000"],
  ["🧊", "Granita blu", "£ 2.500"],
];

/** Lo snack bar del cinema: si paga in lire, rigorosamente per finta. */
export function Chiosco({ onPreso, onChiudi }: Props) {
  return (
    <div className="chiosco">
      <div className="bancone">
        <div className="commesso" aria-hidden>
          <span className="commesso-faccia">😄</span>
          <span className="commesso-badge">PINA · SNACK BAR</span>
        </div>

        <div className="fumetto">
          <p>«Il film senza popcorn è un documentario! Cosa ti do?»</p>
          <div className="chiosco-menu">
            {MENU.map(([emoji, nome, prezzo]) => (
              <button key={nome} className="chiosco-voce" onClick={() => onPreso(emoji)}>
                <span className="chiosco-emoji">{emoji}</span>
                <span className="chiosco-nome">{nome}</span>
                <span className="chiosco-prezzo">{prezzo}</span>
              </button>
            ))}
          </div>
          <p className="chiosco-nota">Offre la casa: qui si paga solo in nostalgia.</p>
        </div>

        <button className="btn-rimetti" onClick={onChiudi}>
          ← Torna nel foyer
        </button>
      </div>
    </div>
  );
}
