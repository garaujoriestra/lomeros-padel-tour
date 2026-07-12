// ¿Tiene el grupo un Pase de Temporada COMPRADO y vigente? Gobierna la ⭐ Tour
// Oficial: un badge ganado, no regalado — por eso ignora BILLING_ENABLED.
export function hasSeasonPass(
  group: { paidUntil: string | null },
  now: Date = new Date(),
): boolean {
  return !!group.paidUntil && group.paidUntil > now.toISOString();
}

// ¿Se aplica la identidad de pago (logo, color, sin atribución)? Con el billing
// APAGADO (beta) todos los grupos cuentan como de pago; encendido, manda el pase.
export function isPaidGroup(
  group: { paidUntil: string | null },
  now: Date = new Date(),
): boolean {
  if (process.env.BILLING_ENABLED !== 'true') return true;
  return hasSeasonPass(group, now);
}
