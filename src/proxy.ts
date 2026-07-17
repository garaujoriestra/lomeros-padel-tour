import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySession } from '@/lib/auth/jwt';
import { decideAccess } from '@/lib/auth/authorize';
import { getGroupBySlug } from '@/lib/groups/resolve-slug';
import { defaultGroupSlug } from '@/lib/groups/constants';
import { isMarketingHost } from '@/lib/marketing/host';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Dominio de marketing (MARKETING_HOST, p. ej. bandejazo.app): su raíz sirve la
  // landing de plataforma en lugar del tour insignia. Solo se reescribe '/';
  // el resto de rutas (crear-grupo, /g/<slug>, legal…) se comporta igual en
  // cualquier host. Sin la env el bloque es inerte y '/' pasa de largo.
  if (pathname === '/') {
    if (isMarketingHost(request.headers.get('host'))) {
      return NextResponse.rewrite(new URL('/bandejazo', request.url));
    }
    return NextResponse.next();
  }

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
    if (group.slug === defaultGroupSlug()) {
      // En el host de marketing la raíz es la landing, así que el tour insignia
      // no puede canonicalizar a '/': se sirve aquí mismo (rewrite al contenido
      // de la raíz, la URL se queda en /g/<slug>). Es el destino del CTA
      // «Ver un tour en marcha». En el resto de hosts, canónico único en '/'.
      if (isMarketingHost(request.headers.get('host'))) {
        return NextResponse.rewrite(new URL('/', request.url));
      }
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
  matcher: ['/', '/admin/:path*', '/me/:path*', '/planificador/:path*', '/g/:slug', '/g/:slug/me/:path*', '/g/:slug/admin/:path*', '/g/:slug/planificador/:path*'],
};
