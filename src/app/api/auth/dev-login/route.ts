import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { getUserByEmail } from '@/lib/auth/users';
import { signSession } from '@/lib/auth/jwt';
import { isDevToolingEnabled } from '@/lib/auth/dev-login';

// POST /api/auth/dev-login  { email }
// Forja una sesión sin pasar por Google. SOLO fuera de producción (guard por VERCEL_ENV).
// Si el email no existe, crea un usuario "pelado" (sin membership) = estado de onboarding.
export async function POST(request: NextRequest) {
  if (!isDevToolingEnabled()) {
    return NextResponse.json({ error: 'No disponible en producción' }, { status: 403 });
  }

  let body: { email?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email) {
    return NextResponse.json({ error: 'Falta email' }, { status: 400 });
  }

  let user = await getUserByEmail(email);
  if (!user) {
    [user] = await db.insert(users).values({ email }).returning();
  }

  const token = await signSession({ userId: user.id });
  const res = NextResponse.json({ ok: true, userId: user.id });
  res.cookies.set('session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  });
  return res;
}
