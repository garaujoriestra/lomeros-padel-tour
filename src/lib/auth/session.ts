import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users, players, type Player } from '@/lib/db/schema';
import { signSession, verifySession, type Role } from './jwt';

const COOKIE = 'session';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 días

export interface Session {
  userId: string;
  role: Role;
  email: string;
  player: Player | null;
}

export async function createSession(userId: string, role: Role): Promise<void> {
  const token = await signSession({ userId, role });
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

// Autorización SEGURA: lee la cookie y carga user/player frescos de la DB.
export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const payload = await verifySession(cookieStore.get(COOKIE)?.value);
  if (!payload) return null;

  const [user] = await db.select().from(users).where(eq(users.id, payload.userId));
  if (!user) return null;

  let player: Player | null = null;
  if (user.playerId) {
    const [p] = await db.select().from(players).where(eq(players.id, user.playerId));
    player = p ?? null;
  }

  return { userId: user.id, role: user.role as Role, email: user.email, player };
}
