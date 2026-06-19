import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { groups } from '@/lib/db/schema';

export interface GroupRow {
  id: string;
  slug: string;
  name: string;
}

// Todos los grupos. Lo usa el cron (itera por grupo) y la futura vista cross-grupo.
export async function listGroups(): Promise<GroupRow[]> {
  return db.select({ id: groups.id, slug: groups.slug, name: groups.name }).from(groups);
}

// Un grupo por id (o null). Fuente del nombre de marca (OG y, en Fase 3, branding).
export async function getGroupById(id: string): Promise<GroupRow | null> {
  const [g] = await db
    .select({ id: groups.id, slug: groups.slug, name: groups.name })
    .from(groups)
    .where(eq(groups.id, id));
  return g ?? null;
}
