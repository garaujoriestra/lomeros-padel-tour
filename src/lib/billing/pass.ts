// Nuevo fin del Pase tras un pago: +1 año desde el fin vigente (renovar antes de
// caducar no penaliza) o desde hoy si no había pase o estaba caducado.
export function extendedPaidUntil(current: string | null, now: Date = new Date()): string {
  const base = current && current > now.toISOString() ? new Date(current) : now;
  const next = new Date(base);
  next.setFullYear(next.getFullYear() + 1);
  return next.toISOString();
}
