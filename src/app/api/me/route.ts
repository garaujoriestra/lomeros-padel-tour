import { NextRequest, NextResponse } from 'next/server';
import { requireGroupSession } from '@/lib/auth/guard';
import { groupIdFromValue } from '@/lib/groups/request-group';
import { updatePlayerInGroup } from '@/lib/players/queries';

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });

  const auth = await requireGroupSession(await groupIdFromValue(body.g));
  if ('response' in auth) return auth.response;
  const playerId = auth.ctx.playerId;
  if (!playerId) return NextResponse.json({ error: 'Sin jugador vinculado' }, { status: 403 });

  const { nickname, avatarUrl, isLeftHanded } = body;
  const updated = await updatePlayerInGroup(auth.ctx.groupId, playerId, {
    nickname: nickname?.trim() || null,
    avatarUrl: avatarUrl?.trim() || null,
    isLeftHanded: !!isLeftHanded,
  });
  return NextResponse.json(updated);
}
