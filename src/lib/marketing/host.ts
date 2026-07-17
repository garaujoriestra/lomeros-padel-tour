// ¿Es esta petición del dominio de marketing (p. ej. bandejazo.app)? Inerte hasta
// que exista MARKETING_HOST en el entorno: sin ella siempre es false y el proxy
// no reescribe nada. El host llega con puerto en dev (localhost:3100) — se
// compara el valor completo, tal cual se configure.
export function isMarketingHost(
  host: string | null,
  marketingHost: string | undefined = process.env.MARKETING_HOST,
): boolean {
  const expected = marketingHost?.trim().toLowerCase();
  if (!expected || !host) return false;
  return host.trim().toLowerCase() === expected;
}
