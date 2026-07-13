import { NextRequest, NextResponse } from 'next/server';
import { verifyInviteToken } from '@/lib/onboarding/invite-token';
import { isPublicSignupEnabled } from '@/lib/onboarding/public-signup';
import { SIGNUP_INTENT_COOKIE, signSignupIntent } from '@/lib/onboarding/signup-intent';

// GET /api/onboarding/intent?t=<invite-token opcional> — deja la cookie signup_intent
// (autoriza crear cuenta para un email desconocido) y redirige a Google conservando el
// retorno a /crear-grupo. Con el alta ABIERTA el token es opcional; en beta cerrada,
// sin token válido, se vuelve a /crear-grupo (callejón sin salida controlado).
export async function GET(request: NextRequest) {
  const t = request.nextUrl.searchParams.get('t');
  const tokenOk = await verifyInviteToken(t);
  if (!tokenOk && !isPublicSignupEnabled()) {
    return NextResponse.redirect(new URL('/crear-grupo', request.url));
  }

  const from = encodeURIComponent(tokenOk && t ? `/crear-grupo?t=${t}` : '/crear-grupo');
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
