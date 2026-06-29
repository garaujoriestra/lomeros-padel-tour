import { NextRequest, NextResponse } from 'next/server';
import { coerceSide } from '@/lib/rating/side-stats';
import { requireGroupAdmin } from '@/lib/auth/guard';
import { groupIdFromValue } from '@/lib/groups/request-group';
import { updateMatchInGroup } from '@/lib/matches/queries';

// PATCH /api/matches/[id]/sides — update only the side columns (admin del grupo objetivo; grupo en body.g)
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });

  const auth = await requireGroupAdmin(await groupIdFromValue(body.g));
  if ('response' in auth) return auth.response;
  const groupId = auth.ctx.groupId;

  try {
    const { id } = await params;
    const { team1Player1Side, team1Player2Side, team2Player1Side, team2Player2Side } = body;

    const updated = await updateMatchInGroup(groupId, id, {
      team1Player1Side: coerceSide(team1Player1Side),
      team1Player2Side: coerceSide(team1Player2Side),
      team2Player1Side: coerceSide(team2Player1Side),
      team2Player2Side: coerceSide(team2Player2Side),
    });

    if (!updated) return NextResponse.json({ error: 'Partido no encontrado' }, { status: 404 });
    return NextResponse.json(updated);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al actualizar lados' }, { status: 500 });
  }
}
