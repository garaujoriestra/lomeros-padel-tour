import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { groups, memberships } from '@/lib/db/schema';
import { getDefaultGroupId } from './group-context';

export interface HomeMembership {
  groupId: string;
  slug: string;
  createdAt: string;
}

// Pura: decide el destino post-login ("grupo-hogar") según las memberships del usuario.
// - Sin memberships → /me (bienvenida/onboarding).
// - Miembro del grupo por defecto → /me (la raíz es su casa).
// - Exactamente una (no-default) → /g/<slug>/me.
// - Varias no-default → la más reciente (el chooser multi-grupo se difiere a la Tarea 3).
export function resolveHomePath(rows: HomeMembership[], defaultGroupId: string): string {
  if (rows.length === 0) return '/me';
  if (rows.some((m) => m.groupId === defaultGroupId)) return '/me';
  const [latest] = [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return `/g/${latest.slug}/me`;
}

// Destino post-login del usuario (callback OAuth y dev-login).
export async function homePathForUser(userId: string): Promise<string> {
  const rows = await db
    .select({ groupId: memberships.groupId, slug: groups.slug, createdAt: memberships.createdAt })
    .from(memberships)
    .innerJoin(groups, eq(groups.id, memberships.groupId))
    .where(eq(memberships.userId, userId));
  return resolveHomePath(rows, await getDefaultGroupId());
}
