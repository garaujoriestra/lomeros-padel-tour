// Helpers PUROS de slug (sin tocar DB): importables desde client components sin
// arrastrar el cliente de libsql al bundle del navegador. La resolución slug→grupo
// (getGroupBySlug, que sí consulta la DB) vive en ./resolve-slug.

// Segmentos de primer nivel que colisionarían con rutas reales de la app: un slug
// de grupo NUNCA puede ser uno de estos. Solo se listan segmentos con forma de slug
// válida — los que llevan '_' o '.' (p. ej. _next, manifest.webmanifest) ya los
// rechaza SLUG_RE antes de consultar este set. Mantener en sync con src/app/ y
// src/app/(public)/.
export const RESERVED_SLUGS = new Set<string>([
  'g', 'api', 'admin', 'me', 'login', 'logout', 'dev-login',
  'offline', 'unauthorized', 'matches', 'players', 'pozos', 'torneos',
  'rankings', 'eventos', 'info', 'icon', 'apple-icon', 'planificador',
  'crear-grupo',
]);

// Forma válida de slug: minúsculas, dígitos y guiones internos (sin guiones en los
// extremos, sin dobles guiones, no vacío).
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Pura (no toca DB): ¿el slug tiene forma válida y no está reservado?
export function isValidGroupSlug(slug: string): boolean {
  return SLUG_RE.test(slug) && !RESERVED_SLUGS.has(slug);
}

// Deriva un slug editable a partir del nombre del grupo (onboarding): minúsculas,
// sin acentos (NFD), todo lo no [a-z0-9] a guiones, colapsados y sin extremos.
export function slugFromName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
