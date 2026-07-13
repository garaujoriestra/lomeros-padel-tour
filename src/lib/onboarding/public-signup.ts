// Alta self-serve abierta por defecto. PUBLIC_SIGNUP_ENABLED=false vuelve a
// "solo invitación firmada" en runtime (kill-switch, sin redeploy ni rediseño).
export function isPublicSignupEnabled(): boolean {
  return process.env.PUBLIC_SIGNUP_ENABLED !== 'false';
}

// Guard anti-abuso del alta abierta: nº máximo de grupos que una misma cuenta
// puede crear. No es gambling ni negocio crítico; es un tope anti-runaway apoyado
// en que crear exige cuenta Google real. El camino de invitación firmada lo ignora.
export const MAX_GROUPS_PER_ADMIN = 5;
