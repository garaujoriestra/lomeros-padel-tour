import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { groups, memberships } from '@/lib/db/schema';
import { LOMEROS_GROUP_ID, LOMEROS_GROUP_SLUG } from '@/lib/groups/constants';
import { getSession } from './session';

export interface GroupContext {
  groupId: string;
  role: 'admin' | 'player' | 'super_admin';
  membershipId: string | null;
  playerId: string | null;
  isSuperAdmin: boolean;
}

export interface MembershipRow {
  id: string;
  groupId: string;
  role: 'admin' | 'player';
  playerId: string | null;
}

// Pura: decide el contexto a partir de las memberships del usuario, si es super-admin,
// y el grupo objetivo (null = usar la única membership; hasta que la Fase 2 lo meta en la URL).
export function resolveGroupContext(input: {
  memberships: MembershipRow[];
  isSuperAdmin: boolean;
  targetGroupId: string | null;
}): GroupContext | null {
  const { memberships: rows, isSuperAdmin, targetGroupId } = input;

  const membership = targetGroupId
    ? rows.find((m) => m.groupId === targetGroupId)
    : rows.length === 1
      ? rows[0]
      : undefined;

  if (membership) {
    return {
      groupId: membership.groupId,
      role: membership.role,
      membershipId: membership.id,
      playerId: membership.playerId,
      isSuperAdmin,
    };
  }

  if (isSuperAdmin && targetGroupId) {
    return {
      groupId: targetGroupId,
      role: 'super_admin',
      membershipId: null,
      playerId: null,
      isSuperAdmin: true,
    };
  }

  return null;
}

// Pura: ¿el email está en el allowlist de súper-admins (env SUPER_ADMIN_EMAILS)?
export function isSuperAdminEmail(email: string): boolean {
  const allow = (process.env.SUPER_ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return allow.includes(email.trim().toLowerCase());
}

// Id del grupo por defecto para páginas públicas/no-auth (env DEFAULT_GROUP_SLUG, hoy 'lomeros').
export async function getDefaultGroupId(): Promise<string> {
  const slug = (process.env.DEFAULT_GROUP_SLUG ?? LOMEROS_GROUP_SLUG).trim();
  const [g] = await db.select({ id: groups.id }).from(groups).where(eq(groups.slug, slug));
  return g?.id ?? LOMEROS_GROUP_ID;
}

// Contexto de grupo de un request autenticado (o null si no hay acceso). Aún no cableado en rutas (1B-1+).
export async function getGroupContext(
  opts: { targetGroupId?: string } = {},
): Promise<GroupContext | null> {
  const session = await getSession();
  if (!session) return null;

  const rows = await db
    .select({
      id: memberships.id,
      groupId: memberships.groupId,
      role: memberships.role,
      playerId: memberships.playerId,
    })
    .from(memberships)
    .where(eq(memberships.userId, session.userId));

  return resolveGroupContext({
    memberships: rows as MembershipRow[],
    isSuperAdmin: isSuperAdminEmail(session.email),
    targetGroupId: opts.targetGroupId ?? null,
  });
}
