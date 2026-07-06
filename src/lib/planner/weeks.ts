const TZ = 'Europe/Madrid';

// Fecha de "hoy" (YYYY-MM-DD) en Europe/Madrid; el servidor corre en UTC.
export function madridTodayIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now); // en-CA → YYYY-MM-DD
}

// Suma días a una fecha ISO. Aritmética en UTC puro: sin efectos de TZ ni DST.
export function addDaysIso(dateIso: string, days: number): string {
  const [y, m, d] = dateIso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// Lunes (YYYY-MM-DD) de la semana de la fecha dada. Las semanas van L→D.
export function mondayOf(dateIso: string): string {
  const [y, m, d] = dateIso.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=domingo … 6=sábado
  return addDaysIso(dateIso, dow === 0 ? -6 : 1 - dow);
}

// Semanas con escritura permitida: la actual y la siguiente. Los días ya pasados
// de la semana actual siguen siendo editables (v1: simplicidad).
export function editableWeeks(todayIso: string): [string, string] {
  const current = mondayOf(todayIso);
  return [current, addDaysIso(current, 7)];
}

export function isEditableWeek(weekStart: string, todayIso: string): boolean {
  return editableWeeks(todayIso).includes(weekStart);
}

// Las 7 fechas (L→D) de la semana.
export function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysIso(weekStart, i));
}
