import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { groups, memberships } from '@/lib/db/schema';
import { listGroups } from '@/lib/groups/queries';
import { getDefaultGroupId, isSuperAdminEmail } from './group-context';
import { getSession } from './session';

export interface SwitcherGroup {
  slug: string;
  name: string;
  href: string;
  current: boolean;
}

// Pura: construye las entradas del conmutador de grupos del navbar. El grupo por
// defecto es canónico en la raíz (href '/'); el resto vive bajo /g/<slug>. Con menos
// de dos grupos no hay nada que conmutar → null (el navbar no renderiza nada).
export function buildSwitcherGroups(input: {
  groups: { id: string; slug: string; name: string }[];
  defaultGroupId: string;
  currentGroupId: string;
}): SwitcherGroup[] | null {
  const { defaultGroupId, currentGroupId } = input;
  const unique = [...new Map(input.groups.map((g) => [g.id, g])).values()];
  if (unique.length < 2) return null;

  unique.sort((a, b) => {
    if (a.id === defaultGroupId) return -1;
    if (b.id === defaultGroupId) return 1;
    return a.name.localeCompare(b.name);
  });

  return unique.map((g) => ({
    slug: g.slug,
    name: g.name,
    href: g.id === defaultGroupId ? '/' : `/g/${g.slug}`,
    current: g.id === currentGroupId,
  }));
}

// Grupos del conmutador para el usuario de la sesión: sus memberships, o TODOS los
// grupos si es súper-admin (visualización global solo-lectura). Sin sesión, o con
// menos de dos grupos alcanzables → null. En prod hoy (solo Lomeros) siempre es null.
export async function getSwitcherGroups(currentGroupId: string): Promise<SwitcherGroup[] | null> {
  const session = await getSession();
  if (!session) return null;

  const rows = isSuperAdminEmail(session.email)
    ? await listGroups()
    : await db
        .select({ id: groups.id, slug: groups.slug, name: groups.name })
        .from(memberships)
        .innerJoin(groups, eq(groups.id, memberships.groupId))
        .where(eq(memberships.userId, session.userId));

  return buildSwitcherGroups({
    groups: rows,
    defaultGroupId: await getDefaultGroupId(),
    currentGroupId,
  });
}
