import { cookies } from 'next/headers';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users, memberships, players, type Player } from '@/lib/db/schema';
import { signSession, verifySession, type Role } from './jwt';
import { getDefaultGroupId } from './group-context';

const COOKIE = 'session';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 días

export interface Session {
  userId: string;
  role: Role;
  email: string;
  player: Player | null;
}

export async function createSession(userId: string): Promise<void> {
  const token = await signSession({ userId });
  const cookieStore = await cookies();
  cookieStore.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: MAX_AGE,
    path: '/',
  });
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE);
}

// Autorización SEGURA: lee la cookie y carga user + (rol/ficha del grupo por defecto)
// frescos de la DB. En 1C el rol y el enlace user↔ficha viven en `memberships`, no en
// `users`. Tolerante a fallos: si la consulta falla devuelve null en vez de lanzar.
// NOTA: import circular benigno con group-context (getDefaultGroupId): ambos se usan
// dentro de funciones, no en carga de módulo → ESM lo resuelve sin problema.
export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const payload = await verifySession(cookieStore.get(COOKIE)?.value);
  if (!payload) return null;

  try {
    const [user] = await db.select().from(users).where(eq(users.id, payload.userId));
    if (!user) return null;

    // Rol + ficha del grupo por defecto (Fase 1: grupo implícito = Lomeros).
    const groupId = await getDefaultGroupId();
    const [mb] = await db
      .select({ role: memberships.role, playerId: memberships.playerId })
      .from(memberships)
      .where(and(eq(memberships.userId, user.id), eq(memberships.groupId, groupId)));

    const role = (mb?.role ?? 'player') as Role;

    let player: Player | null = null;
    if (mb?.playerId) {
      const [p] = await db.select().from(players).where(eq(players.id, mb.playerId));
      player = p ?? null;
    }

    return { userId: user.id, role, email: user.email, player };
  } catch (error) {
    console.error('getSession DB error', error);
    return null;
  }
}
