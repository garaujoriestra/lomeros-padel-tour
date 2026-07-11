import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { verifyInviteToken } from '@/lib/onboarding/invite-token';
import { isValidGroupSlug } from '@/lib/groups/resolve-slug';
import { createGroupWithAdmin } from '@/lib/groups/queries';

// POST /api/onboarding/create-group — { name, slug, t }. Crea grupo + membership admin
// para el usuario con sesión. El token del enlace se RE-valida aquí (la cookie
// signup_intent solo autorizaba crear cuenta, no grupo).
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });

  if (!(await verifyInviteToken(body.t))) {
    return NextResponse.json(
      { error: 'La invitación no es válida o ha caducado: pide un enlace nuevo' },
      { status: 403 },
    );
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const slug = typeof body.slug === 'string' ? body.slug.trim() : '';
  if (!name) return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 });
  if (!isValidGroupSlug(slug)) {
    return NextResponse.json({ error: 'Nombre corto inválido (minúsculas, números y guiones)' }, { status: 400 });
  }

  const result = await createGroupWithAdmin({ slug, name, userId: session.userId });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, slug });
}
