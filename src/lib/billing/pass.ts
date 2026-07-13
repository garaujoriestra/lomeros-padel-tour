// Nuevo fin del Pase tras un pago: +1 año desde el fin vigente (renovar antes de
// caducar no penaliza) o desde hoy si no había pase o estaba caducado.
// OJO: en producción NO se llama a este helper — el webhook escribe paid_until con el
// `strftime(..., '+1 year')` atómico de `grantSeasonPass` (src/lib/groups/queries.ts).
// Este helper es el ORÁCULO del test de equivalencia que fija ese SQL byte a byte
// (src/lib/groups/queries.test.ts); mantener ambos en sincronía si se cambia la regla.
export function extendedPaidUntil(current: string | null, now: Date = new Date()): string {
  const base = current && current > now.toISOString() ? new Date(current) : now;
  const next = new Date(base);
  next.setFullYear(next.getFullYear() + 1);
  return next.toISOString();
}
