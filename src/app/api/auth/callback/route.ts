import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForIdToken, verifyGoogleIdToken } from '@/lib/auth/google';
import { getUserByEmail } from '@/lib/auth/users';
import { signSession } from '@/lib/auth/jwt';
import type { Role } from '@/lib/auth/jwt';

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

    const user = await getUserByEmail(identity.email);
    if (!user) {
      return NextResponse.redirect(new URL('/unauthorized', base));
    }

    const token = await signSession({ userId: user.id, role: user.role as Role });
    const dest = from && from.startsWith('/') ? from : '/me';
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
    return res;
  } catch (error) {
    console.error('OAuth callback error', error);
    return NextResponse.redirect(new URL('/login?error=oauth', base));
  }
}
