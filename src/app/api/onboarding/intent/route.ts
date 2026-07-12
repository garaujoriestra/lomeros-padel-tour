import { NextRequest, NextResponse } from 'next/server';
import { verifyInviteToken } from '@/lib/onboarding/invite-token';
import { SIGNUP_INTENT_COOKIE, signSignupIntent } from '@/lib/onboarding/signup-intent';

// GET /api/onboarding/intent?t=<invite-token> — Route Handler (no Server Component:
// `cookies().set()` no está soportado durante el render de un Server Component en esta
// versión de Next; solo en Server Functions o Route Handlers). Deja la cookie
// signup_intent y redirige a Google conservando el token en `from` para volver a
// /crear-grupo tras el login.
export async function GET(request: NextRequest) {
  const t = request.nextUrl.searchParams.get('t');
  if (!(await verifyInviteToken(t))) {
    return NextResponse.redirect(new URL('/crear-grupo', request.url));
  }

  const from = encodeURIComponent(`/crear-grupo?t=${t}`);
  const res = NextResponse.redirect(new URL(`/api/auth/login?from=${from}`, request.url));
  res.cookies.set(SIGNUP_INTENT_COOKIE, await signSignupIntent(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 60,
    path: '/',
  });
  return res;
}
