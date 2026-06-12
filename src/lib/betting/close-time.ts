// Instante de cierre de apuestas. Las fechas/horas del partido se interpretan
// en Europe/Madrid (el grupo juega allí); el servidor corre en UTC.
const TZ = 'Europe/Madrid';

// Offset (ms) de Madrid respecto a UTC en un instante dado.
function tzOffsetMs(at: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = Object.fromEntries(dtf.formatToParts(at).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour === '24' ? '0' : parts.hour), Number(parts.minute), Number(parts.second),
  );
  return asUtc - at.getTime();
}

export function bettingClosesAt(date: string, time: string | null | undefined): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = (time ?? '00:00').split(':').map(Number);
  const utcGuess = Date.UTC(y, m - 1, d, hh, mm);
  return new Date(utcGuess - tzOffsetMs(new Date(utcGuess)));
}

export function isBettingOpen(
  match: { date: string; time?: string | null; status: string },
  now: Date = new Date(),
): boolean {
  if (match.status !== 'scheduled') return false;
  return now.getTime() < bettingClosesAt(match.date, match.time ?? null).getTime();
}
