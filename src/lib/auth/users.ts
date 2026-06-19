import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users, memberships, type User } from '@/lib/db/schema';

export async function getUserByEmail(email: string): Promise<User | null> {
  const normalized = email.trim().toLowerCase();
  const [user] = await db.select().from(users).where(eq(users.email, normalized));
  return user ?? null;
}

export async function getUserById(id: string): Promise<User | null> {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user ?? null;
}

/**
 * Email del usuario vinculado a un jugador EN ESTE GRUPO (vía su membership).
 * '' si la ficha no tiene cuenta vinculada en el grupo.
 */
export async function getLinkedUserEmail(groupId: string, playerId: string): Promise<string> {
  const [row] = await db
    .select({ email: users.email })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.groupId, groupId), eq(memberships.playerId, playerId)));
  return row?.email ?? '';
}

/**
 * Sincroniza la autorización de un jugador EN UN GRUPO desde el formulario de admin.
 * El rol y el enlace user↔ficha viven en `memberships` (1C), no en `users`.
 * - email vacío  → desautoriza: borra la membership 'player' de ese jugador (o, si es
 *   admin u otro rol, solo desvincula la ficha).
 * - email puesto → garantiza una cuenta global `users` con ese email y una
 *   `membership(user, grupo, role, playerId)` apuntando a la ficha.
 *
 * Devuelve { ok:false, error } si el email ya está vinculado a OTRO jugador del grupo.
 */
export async function upsertPlayerUser(
  groupId: string,
  playerId: string,
  rawEmail: string | null | undefined,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const email = (rawEmail ?? '').trim().toLowerCase();

  // Membership de ESTE grupo que vincula a este jugador (si existe).
  const [mbByPlayer] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.groupId, groupId), eq(memberships.playerId, playerId)));

  // Sin email → desautorizar en este grupo.
  if (!email) {
    if (mbByPlayer?.role === 'player') {
      await db.delete(memberships).where(eq(memberships.id, mbByPlayer.id));
    } else if (mbByPlayer) {
      await db.update(memberships).set({ playerId: null }).where(eq(memberships.id, mbByPlayer.id));
    }
    return { ok: true };
  }

  // Con email → ¿ya existe una cuenta global con ese email?
  const [userByEmail] = await db.select().from(users).where(eq(users.email, email));

  if (userByEmail) {
    const [mbByUser] = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.groupId, groupId), eq(memberships.userId, userByEmail.id)));

    if (mbByUser?.playerId && mbByUser.playerId !== playerId) {
      return { ok: false, error: 'Ese email ya está asignado a otro jugador' };
    }
    // El jugador estaba vinculado a OTRA membership (otra cuenta): soltarla.
    if (mbByPlayer && mbByPlayer.id !== mbByUser?.id) {
      if (mbByPlayer.role === 'player') {
        await db.delete(memberships).where(eq(memberships.id, mbByPlayer.id));
      } else {
        await db.update(memberships).set({ playerId: null }).where(eq(memberships.id, mbByPlayer.id));
      }
    }
    if (mbByUser) {
      // Conserva el rol existente (útil si es la cuenta del admin).
      await db.update(memberships).set({ playerId }).where(eq(memberships.id, mbByUser.id));
    } else {
      await db.insert(memberships).values({ userId: userByEmail.id, groupId, role: 'player', playerId });
    }
    return { ok: true };
  }

  // Email nuevo: si el jugador ya tenía cuenta vinculada, se renombra; si no, se crea.
  if (mbByPlayer) {
    await db.update(users).set({ email }).where(eq(users.id, mbByPlayer.userId));
  } else {
    const [created] = await db.insert(users).values({ email }).returning();
    await db.insert(memberships).values({ userId: created.id, groupId, role: 'player', playerId });
  }
  return { ok: true };
}
