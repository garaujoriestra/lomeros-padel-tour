import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { trackFunnel } from '@/lib/analytics/events';
import { getSession } from '@/lib/auth/session';
import { verifyInviteToken } from '@/lib/onboarding/invite-token';
import { isPublicSignupEnabled, MAX_GROUPS_PER_ADMIN } from '@/lib/onboarding/public-signup';
import { isValidGroupSlug } from '@/lib/groups/resolve-slug';
import { createGroupWithAdmin, countGroupsAdminedBy } from '@/lib/groups/queries';

// POST /api/onboarding/create-group — { name, slug, t? }. Crea grupo + membership admin
// para el usuario con sesión. Con el alta ABIERTA (PUBLIC_SIGNUP_ENABLED) el token deja
// de ser obligatorio; si viene y es válido, también vale (respaldo de la beta cerrada).
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });

  const tokenOk = await verifyInviteToken(body.t);
  if (!tokenOk && !isPublicSignupEnabled()) {
    return NextResponse.json(
      { error: 'La invitación no es válida o ha caducado: pide un enlace nuevo' },
      { status: 403 },
    );
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const slug = typeof body.slug === 'string' ? body.slug.trim() : '';
  if (!name) return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 });
  if (name.length > 80) {
    return NextResponse.json({ error: 'El nombre es demasiado largo (máx. 80)' }, { status: 400 });
  }
  if (!isValidGroupSlug(slug)) {
    return NextResponse.json({ error: 'Nombre corto inválido (minúsculas, números y guiones)' }, { status: 400 });
  }
  if (slug.length > 40) {
    return NextResponse.json({ error: 'Nombre corto demasiado largo (máx. 40)' }, { status: 400 });
  }

  // Cap anti-abuso: solo cuando el alta se apoya en el modo abierto (sin token de
  // admin). El camino de invitación firmada es de confianza y no cuenta contra el tope.
  if (!tokenOk) {
    const owned = await countGroupsAdminedBy(session.userId);
    if (owned >= MAX_GROUPS_PER_ADMIN) {
      return NextResponse.json(
        { error: 'Has alcanzado el máximo de grupos por cuenta' },
        { status: 429 },
      );
    }
  }

  const result = await createGroupWithAdmin({ slug, name, userId: session.userId });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  // Funnel de captación: la conversión de la landing. `via` separa el alta
  // abierta de las invitaciones firmadas (mide qué canal trae grupos).
  after(() => trackFunnel('grupo_creado', { via: tokenOk ? 'invitacion' : 'alta_abierta' }));
  return NextResponse.json({ ok: true, slug });
}
