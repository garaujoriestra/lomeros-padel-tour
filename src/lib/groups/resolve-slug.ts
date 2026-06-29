import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { groups } from '@/lib/db/schema';
import type { GroupRow } from './queries';

// Segmentos de primer nivel que colisionarían con rutas reales de la app: un slug
// de grupo NUNCA puede ser uno de estos. Mantener en sync con src/app/ (y con
// src/app/(public)/). La validación al ELEGIR slug (onboarding) es de Tarea 2; aquí
// solo se usa para rechazar en el resolutor.
export const RESERVED_SLUGS = new Set<string>([
  'g', 'api', '_next', 'me', 'admin', 'login', 'logout', 'dev-login',
  'offline', 'unauthorized', 'matches', 'players', 'pozos', 'torneos',
  'rankings', 'eventos', 'icon', 'apple-icon', 'manifest.webmanifest',
]);

// Forma válida de slug: minúsculas, dígitos y guiones internos (sin guiones en los
// extremos, sin dobles guiones, no vacío).
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Pura (no toca DB): ¿el slug tiene forma válida y no está reservado?
export function isValidGroupSlug(slug: string): boolean {
  return SLUG_RE.test(slug) && !RESERVED_SLUGS.has(slug);
}

// Resuelve un slug de la URL a su grupo, o null si: tiene forma inválida, está
// reservado, o no existe ningún grupo con ese slug. Las páginas /g/[slug] hacen
// notFound() cuando devuelve null.
export async function getGroupBySlug(slug: string): Promise<GroupRow | null> {
  if (!isValidGroupSlug(slug)) return null;
  const [g] = await db
    .select({ id: groups.id, slug: groups.slug, name: groups.name })
    .from(groups)
    .where(eq(groups.slug, slug));
  return g ?? null;
}
