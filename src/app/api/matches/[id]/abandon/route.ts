import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { getDefaultGroupId, getGroupContext } from '@/lib/auth/group-context';
import { getMatchInGroup, updateMatchInGroup } from '@/lib/matches/queries';
import { refundOpenBets } from '@/lib/betting/settle';
import { notifyBetSettlements } from '@/lib/push/bet-events';

// POST /api/matches/[id]/abandon (admin)
// Marca un partido programado como no disputado por lesión. Body: { injuredPlayerId }.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  try {
    const { id } = await params;
    const groupId = (await getGroupContext())?.groupId ?? (await getDefaultGroupId());
    const body = await req.json();
    const { injuredPlayerId } = body as { injuredPlayerId?: string };

    if (!injuredPlayerId) {
      return NextResponse.json({ error: 'Falta injuredPlayerId' }, { status: 400 });
    }

    const match = await getMatchInGroup(groupId, id);
    if (!match) return NextResponse.json({ error: 'Partido no encontrado' }, { status: 404 });
    if (match.status === 'completed') {
      return NextResponse.json({ error: 'El partido ya está completado' }, { status: 400 });
    }

    const matchPlayers = [
      match.team1Player1Id,
      match.team1Player2Id,
      match.team2Player1Id,
      match.team2Player2Id,
    ];
    if (!matchPlayers.includes(injuredPlayerId)) {
      return NextResponse.json(
        { error: 'El jugador lesionado debe ser uno de los 4 del partido' },
        { status: 400 },
      );
    }

    const updated = await updateMatchInGroup(groupId, id, {
      status: 'injury_aborted',
      injuredPlayerId,
      winnerTeam: null,
    });

    // «La Timba»: partido anulado → devolución íntegra
    const refunded = await refundOpenBets(id);
    await notifyBetSettlements(id, refunded);

    return NextResponse.json(updated);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al marcar lesión' }, { status: 500 });
  }
}
