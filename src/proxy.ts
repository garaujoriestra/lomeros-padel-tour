import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySession } from '@/lib/auth/jwt';
import { decideAccess } from '@/lib/auth/authorize';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const payload = await verifySession(request.cookies.get('session')?.value);
  const decision = decideAccess(pathname, payload);

  if (decision === 'redirect-login') {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }
  if (decision === 'redirect-home') {
    return NextResponse.redirect(new URL('/me', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/me/:path*'],
};
