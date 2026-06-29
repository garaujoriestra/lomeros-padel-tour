import { NextRequest, NextResponse } from 'next/server';
import { requireGroupAdmin, requireGroupSession } from '@/lib/auth/guard';
import { groupIdFromQuery, groupIdFromValue } from '@/lib/groups/request-group';
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
      const auth = await requireGroupAdmin(await groupIdFromQuery(request));
      if ('response' in auth) return auth.response;
      const rows = await listRedemptionsAllInGroup(auth.ctx.groupId);
      return NextResponse.json(rows);
    }
    const auth = await requireGroupSession(await groupIdFromQuery(request));
    if ('response' in auth) return auth.response;
    if (!auth.ctx.playerId) return NextResponse.json([]);
    const rows = await getMyRedemptions(auth.ctx.playerId);
    return NextResponse.json(rows);
  } catch {
    return NextResponse.json({ error: 'Error al obtener canjes' }, { status: 500 });
  }
}

// POST /api/redemptions — canjear. Body: { g?, rewardId }
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  const auth = await requireGroupSession(await groupIdFromValue(body.g));
  if ('response' in auth) return auth.response;
  const playerId = auth.ctx.playerId;
  if (!playerId) return NextResponse.json({ error: 'Sin jugador vinculado' }, { status: 403 });
  try {
    const groupId = auth.ctx.groupId;
    const { rewardId } = body;
    const reward = await getRewardInGroup(groupId, rewardId);
    if (!reward || !reward.active) {
      return NextResponse.json({ error: 'Premio no disponible' }, { status: 404 });
    }
    if (await hasPendingPenalty(playerId)) {
      return NextResponse.json({ error: 'Estás en bancarrota: cumple tu penalización antes' }, { status: 403 });
    }
    const redemption = await insertRedemption(playerId, reward.id, reward.cost);
    try {
      await applyTokenMovement(playerId, -reward.cost, 'redemption', redemption.id);
    } catch {
      await deleteRedemption(redemption.id);
      return NextResponse.json({ error: 'No tienes saldo suficiente' }, { status: 400 });
    }
    await detectBankruptcies([playerId]);
    return NextResponse.json(redemption, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Error al canjear' }, { status: 500 });
  }
}
