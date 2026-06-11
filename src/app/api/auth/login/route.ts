import { NextRequest, NextResponse } from 'next/server';
import { buildGoogleAuthUrl } from '@/lib/auth/google';

export async function GET(request: NextRequest) {
  const state = crypto.randomUUID();
  const res = NextResponse.redirect(buildGoogleAuthUrl(state));
  // Guardamos el state para validarlo en el callback (anti-CSRF).
  res.cookies.set('oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 10, // 10 min
    path: '/',
  });
  // Guardamos el destino final (opcional).
  const from = request.nextUrl.searchParams.get('from');
  if (from) {
    res.cookies.set('oauth_from', from, { httpOnly: true, sameSite: 'lax', maxAge: 600, path: '/' });
  }
  return res;
}
