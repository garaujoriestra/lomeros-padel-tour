import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForIdToken, verifyGoogleIdToken } from '@/lib/auth/google';
import { getUserByEmail } from '@/lib/auth/users';
import { homePathForUser } from '@/lib/auth/home-path';
import { signSession } from '@/lib/auth/jwt';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { SIGNUP_INTENT_COOKIE, verifySignupIntent, shouldCreateUser } from '@/lib/onboarding/signup-intent';

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const savedState = request.cookies.get('oauth_state')?.value;
  const from = request.cookies.get('oauth_from')?.value;

  const base = process.env.APP_URL || url.origin;

  // Validar state (anti-CSRF) y presencia de code.
  if (!code || !state || !savedState || state !== savedState) {
    return NextResponse.redirect(new URL('/login?error=state', base));
  }

  try {
    const idToken = await exchangeCodeForIdToken(code);
    const identity = await verifyGoogleIdToken(idToken);

    if (!identity.email || !identity.emailVerified) {
      return NextResponse.redirect(new URL('/unauthorized', base));
    }

    // Onboarding (beta cerrada): un email desconocido SOLO crea cuenta si trae la
    // cookie de intención que dejó /crear-grupo tras validar el enlace de invitación.
    let user = await getUserByEmail(identity.email);
    let consumedIntent = false;
    if (!user) {
      const intentValid = await verifySignupIntent(request.cookies.get(SIGNUP_INTENT_COOKIE)?.value);
      if (!shouldCreateUser({ userExists: false, intentValid })) {
        return NextResponse.redirect(new URL('/unauthorized', base));
      }
      [user] = await db.insert(users).values({ email: identity.email.toLowerCase() }).returning();
      consumedIntent = true;
    }

    const token = await signSession({ userId: user.id });
    // Solo rutas internas: evita open-redirect (incl. protocol-relative //evil.com y /\evil.com).
    const isInternal = !!from && from.startsWith('/') && !from.startsWith('//') && !from.startsWith('/\\');
    // Sin `from`: aterrizaje en el grupo-hogar (miembro del grupo por defecto → /me;
    // de otro grupo → /g/<slug>/me).
    const dest = isInternal ? from : await homePathForUser(user.id);
    const res = NextResponse.redirect(new URL(dest, base));
    res.cookies.set('session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
    });
    // Limpiar cookies temporales.
    res.cookies.delete('oauth_state');
    res.cookies.delete('oauth_from');
    if (consumedIntent) res.cookies.delete(SIGNUP_INTENT_COOKIE); // un solo uso
    return res;
  } catch (error) {
    console.error('OAuth callback error', error);
    return NextResponse.redirect(new URL('/login?error=oauth', base));
  }
}
