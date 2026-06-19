import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { getDefaultGroupId, getGroupContext } from '@/lib/auth/group-context';
import { getPlayerInGroup } from '@/lib/players/queries';
import { getPendingPenalty, fulfillPenalty } from '@/lib/betting/queries';
import { applyTokenMovement } from '@/lib/betting/bank';
import { BETTING } from '@/lib/betting/config';

const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

// POST /api/timba/entry — admin registra que un jugador pagó la entrada (5 €).
// Body: { playerId }. Si tiene penalización pendiente → recompra (rebuy) y la
// marca cumplida; si no → entrada (buyin). En ambos casos +500 fichas.
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  try {
    const groupId = (await getGroupContext())?.groupId ?? (await getDefaultGroupId());
    const { playerId } = await request.json();
    const player = await getPlayerInGroup(groupId, playerId);
    if (!player) return NextResponse.json({ error: 'Jugador no encontrado' }, { status: 404 });

    const pending = await getPendingPenalty(playerId);

    if (pending) {
      await applyTokenMovement(playerId, BETTING.buyInTokens, 'rebuy', pending.id);
      await fulfillPenalty(pending.id, now());
    } else {
      await applyTokenMovement(playerId, BETTING.buyInTokens, 'buyin');
    }

    const updated = await getPlayerInGroup(groupId, playerId);
    return NextResponse.json({ playerId, balance: updated?.tokenBalance ?? 0, kind: pending ? 'rebuy' : 'buyin' });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al registrar la entrada' }, { status: 500 });
  }
}
