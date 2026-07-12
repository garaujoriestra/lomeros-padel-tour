import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { groups } from '@/lib/db/schema';
import type { GroupRow } from './queries';
import { isValidGroupSlug } from './slug';

// Los helpers PUROS (RESERVED_SLUGS, isValidGroupSlug, slugFromName) viven en ./slug
// para que los client components puedan importarlos sin arrastrar el cliente de DB
// al bundle del navegador. Se re-exportan aquí por compatibilidad con los
// consumidores server-side existentes.
export { RESERVED_SLUGS, isValidGroupSlug, slugFromName } from './slug';

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
