import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { signSession, verifySession } from './jwt';

const COOKIE = 'session';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 días

// Paso C: la sesión es solo IDENTIDAD (quién eres), sin rol ni ficha horneados al grupo
// por defecto. Rol/ficha se resuelven SIEMPRE por grupo: páginas → resolvePageContext(slug?),
// rutas /api → requireGroupAdmin/requireGroupSession.
export interface Session {
  userId: string;
  email: string;
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

// Autenticación SEGURA: lee la cookie y verifica que el user existe, fresco de la DB.
// Tolerante a fallos: si la consulta falla devuelve null en vez de lanzar.
export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const payload = await verifySession(cookieStore.get(COOKIE)?.value);
  if (!payload) return null;

  try {
    const [user] = await db.select().from(users).where(eq(users.id, payload.userId));
    if (!user) return null;
    return { userId: user.id, email: user.email };
  } catch (error) {
    console.error('getSession DB error', error);
    return null;
  }
}
