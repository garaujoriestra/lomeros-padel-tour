import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { getDefaultGroupId, getGroupContext } from '@/lib/auth/group-context';
import { updatePlayerInGroup } from '@/lib/players/queries';

export async function PATCH(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (!session.player) return NextResponse.json({ error: 'Sin jugador vinculado' }, { status: 403 });

  const body = await request.json();
  const { nickname, avatarUrl, isLeftHanded } = body;

  const groupId = (await getGroupContext())?.groupId ?? (await getDefaultGroupId());
  const updated = await updatePlayerInGroup(groupId, session.player.id, {
    nickname: nickname?.trim() || null,
    avatarUrl: avatarUrl?.trim() || null,
    isLeftHanded: !!isLeftHanded,
  });

  return NextResponse.json(updated);
}
