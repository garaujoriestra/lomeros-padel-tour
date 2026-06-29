import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySession } from '@/lib/auth/jwt';
import { decideAccess } from '@/lib/auth/authorize';
import { getGroupBySlug } from '@/lib/groups/resolve-slug';

// Slug del grupo canónico en la raíz (env configurable, por defecto 'lomeros').
// /g/<defaultSlug> → 308 a '/' para que la raíz sea el único canónico.
const DEFAULT_GROUP_SLUG = (process.env.DEFAULT_GROUP_SLUG ?? 'lomeros').trim();

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Rutas /g/[slug]: validar slug y redirigir ANTES del streaming para obtener
  // status HTTP correcto (notFound/permanentRedirect mid-stream devuelven 200).
  const slugMatch = pathname.match(/^\/g\/([^/]+)$/);
  if (slugMatch) {
    const slug = slugMatch[1];
    const group = await getGroupBySlug(slug);
    if (!group) {
      return new Response(null, { status: 404 });
    }
    // TODO(Paso C): unificar con getDefaultGroupId() cuando el proxy tenga contexto de grupo (hoy compara por slug de env; la página compara por id de DB).
    if (group.slug === DEFAULT_GROUP_SLUG) {
      return NextResponse.redirect(new URL('/', request.url), 308);
    }
    return NextResponse.next();
  }

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
  matcher: ['/admin/:path*', '/me/:path*', '/g/:slug'],
};
