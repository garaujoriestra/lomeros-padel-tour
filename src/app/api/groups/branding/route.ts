import { NextRequest, NextResponse } from 'next/server';
import { requireGroupAdmin } from '@/lib/auth/guard';
import { groupIdFromValue } from '@/lib/groups/request-group';
import { isValidAccentColor } from '@/lib/groups/branding';
import { updateGroupBranding } from '@/lib/groups/queries';

// PUT /api/groups/branding — guarda logo/color del grupo (admin DEL grupo; body.g).
// null = limpiar (volver al defecto). El pase (paid_until) NO se toca aquí: solo webhook.
export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });

  const auth = await requireGroupAdmin(await groupIdFromValue(body.g));
  if ('response' in auth) return auth.response;

  const { logoUrl, accentColor } = body;
  if (accentColor !== null && !isValidAccentColor(accentColor)) {
    return NextResponse.json({ error: 'Color inválido (usa #rrggbb)' }, { status: 400 });
  }
  if (logoUrl !== null && (typeof logoUrl !== 'string' || !logoUrl.startsWith('https://'))) {
    return NextResponse.json({ error: 'Logo inválido' }, { status: 400 });
  }

  await updateGroupBranding(auth.ctx.groupId, { logoUrl, accentColor });
  return NextResponse.json({ success: true });
}
