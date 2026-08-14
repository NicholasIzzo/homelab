const TZ = 'Europe/Rome';

const dataOra = new Intl.DateTimeFormat('it-IT', {
  timeZone: TZ,
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

const soloData = new Intl.DateTimeFormat('it-IT', {
  timeZone: TZ,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const oraSola = new Intl.DateTimeFormat('it-IT', {
  timeZone: TZ,
  hour: '2-digit',
  minute: '2-digit',
});

export const euro = new Intl.NumberFormat('it-IT', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 2,
});

export function formattaCentesimi(cents: number): string {
  return euro.format(cents / 100);
}

export function formattaDataOra(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : dataOra.format(d);
}

export function formattaData(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(`${iso.length === 10 ? `${iso}T12:00:00` : iso}`);
  return Number.isNaN(d.getTime()) ? '—' : soloData.format(d);
}

/** "3 minuti fa", "oggi alle 03:14", "2 giorni fa". */
export function tempoRelativo(iso: string | null): string {
  if (!iso) return 'mai';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';

  const secondi = Math.round((Date.now() - d.getTime()) / 1000);
  if (secondi < 10) return 'adesso';
  if (secondi < 60) return `${secondi} secondi fa`;

  const minuti = Math.round(secondi / 60);
  if (minuti < 60) return `${minuti} ${minuti === 1 ? 'minuto' : 'minuti'} fa`;

  const ore = Math.round(minuti / 60);
  if (ore < 24) {
    const oggi = new Date().toDateString() === d.toDateString();
    return oggi ? `oggi alle ${oraSola.format(d)}` : `${ore} ore fa`;
  }

  const giorni = Math.round(ore / 24);
  if (giorni === 1) return 'ieri';
  if (giorni < 30) return `${giorni} giorni fa`;
  return formattaData(iso);
}

/** Giorni interi da oggi alla data indicata. Negativo se gia' passata. */
export function giorniA(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.round((d.getTime() - Date.now()) / 86_400_000);
}

export function formattaGiorni(g: number): string {
  if (g < 0) return `scaduto da ${Math.abs(g)} ${Math.abs(g) === 1 ? 'giorno' : 'giorni'}`;
  if (g === 0) return 'oggi';
  if (g === 1) return 'domani';
  if (g < 60) return `fra ${g} giorni`;
  const mesi = Math.round(g / 30.44);
  return `fra ~${mesi} mesi`;
}

const meseLungo = new Intl.DateTimeFormat('it-IT', {
  timeZone: TZ,
  month: 'long',
  year: 'numeric',
});

/** "2026-08" -> "agosto 2026". */
export function formattaMese(iso: string): string {
  const d = new Date(`${iso}-01T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : meseLungo.format(d);
}

export function formattaByte(b: number): string {
  if (!b) return '—';
  const tb = b / 1e12;
  if (tb >= 1) return `${Math.round(tb * 10) / 10} TB`;
  return `${Math.round(b / 1e9)} GB`;
}

export function formattaOre(h: number | null): string {
  if (h === null) return '—';
  const anni = h / 8760;
  return anni >= 1 ? `${h.toLocaleString('it-IT')} h (~${Math.round(anni * 10) / 10} anni)` : `${h} h`;
}
