import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { players } from '@/lib/db/schema';
import { getSession } from '@/lib/auth/session';

export async function PATCH(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (!session.player) return NextResponse.json({ error: 'Sin jugador vinculado' }, { status: 403 });

  const body = await request.json();
  const { nickname, avatarUrl, isLeftHanded } = body;

  const [updated] = await db
    .update(players)
    .set({
      nickname: nickname?.trim() || null,
      avatarUrl: avatarUrl?.trim() || null,
      isLeftHanded: !!isLeftHanded,
    })
    .where(eq(players.id, session.player.id))
    .returning();

  return NextResponse.json(updated);
}
