import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { groups, memberships } from '@/lib/db/schema';

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

// Crea un grupo con su primera membership de admin (onboarding). El id = slug,
// como los grupos existentes ('lomeros', 'grupo-test'). Devuelve error legible si
// el slug ya existe (carrera entre el check del form y el INSERT).
export async function createGroupWithAdmin(input: {
  slug: string;
  name: string;
  userId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const [existing] = await db.select({ id: groups.id }).from(groups).where(eq(groups.slug, input.slug));
  if (existing) return { ok: false, error: 'Ese nombre corto ya está cogido' };
  await db.insert(groups).values({ id: input.slug, slug: input.slug, name: input.name });
  await db.insert(memberships).values({
    userId: input.userId,
    groupId: input.slug,
    role: 'admin',
    playerId: null,
  });
  return { ok: true };
}
