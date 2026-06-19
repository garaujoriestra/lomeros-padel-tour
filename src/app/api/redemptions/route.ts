import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireAdmin } from '@/lib/auth/guard';
import { getDefaultGroupId, getGroupContext } from '@/lib/auth/group-context';
import {
  listRedemptionsAllInGroup, getMyRedemptions, getRewardInGroup,
  insertRedemption, deleteRedemption,
} from '@/lib/rewards/queries';
import { applyTokenMovement } from '@/lib/betting/bank';
import { hasPendingPenalty, detectBankruptcies } from '@/lib/betting/settle';

// GET /api/redemptions?all=1 (admin) | sin params → los míos
export async function GET(request: NextRequest) {
  try {
    const all = request.nextUrl.searchParams.get('all');
    if (all) {
      const auth = await requireAdmin();
      if ('response' in auth) return auth.response;
      const groupId = (await getGroupContext())?.groupId ?? (await getDefaultGroupId());
      const rows = await listRedemptionsAllInGroup(groupId);
      return NextResponse.json(rows);
    }

    const auth = await requireSession();
    if ('response' in auth) return auth.response;
    if (!auth.session.player) return NextResponse.json([]);
    const rows = await getMyRedemptions(auth.session.player.id);
    return NextResponse.json(rows);
  } catch {
    return NextResponse.json({ error: 'Error al obtener canjes' }, { status: 500 });
  }
}

// POST /api/redemptions — canjear. Body: { rewardId }
export async function POST(request: NextRequest) {
  const auth = await requireSession();
  if ('response' in auth) return auth.response;
  const player = auth.session.player;
  if (!player) return NextResponse.json({ error: 'Sin jugador vinculado' }, { status: 403 });
  try {
    const groupId = (await getGroupContext())?.groupId ?? (await getDefaultGroupId());
    const { rewardId } = await request.json();
    const reward = await getRewardInGroup(groupId, rewardId);
    if (!reward || !reward.active) {
      return NextResponse.json({ error: 'Premio no disponible' }, { status: 404 });
    }
    if (await hasPendingPenalty(player.id)) {
      return NextResponse.json({ error: 'Estás en bancarrota: cumple tu penalización antes' }, { status: 403 });
    }

    const redemption = await insertRedemption(player.id, reward.id, reward.cost);

    try {
      await applyTokenMovement(player.id, -reward.cost, 'redemption', redemption.id);
    } catch {
      await deleteRedemption(redemption.id);
      return NextResponse.json({ error: 'No tienes saldo suficiente' }, { status: 400 });
    }

    await detectBankruptcies([player.id]);
    return NextResponse.json(redemption, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Error al canjear' }, { status: 500 });
  }
}
