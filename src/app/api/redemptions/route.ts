import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { redemptions, rewards, players } from '@/lib/db/schema';
import { desc, eq } from 'drizzle-orm';
import { requireSession, requireAdmin } from '@/lib/auth/guard';
import { applyTokenMovement } from '@/lib/betting/bank';
import { hasPendingPenalty, detectBankruptcies } from '@/lib/betting/settle';

// GET /api/redemptions?all=1 (admin) | sin params → los míos
export async function GET(request: NextRequest) {
  try {
    const all = request.nextUrl.searchParams.get('all');
    if (all) {
      const auth = await requireAdmin();
      if ('response' in auth) return auth.response;
      const rows = await db
        .select({
          id: redemptions.id, playerId: redemptions.playerId, cost: redemptions.cost,
          status: redemptions.status, requestedAt: redemptions.requestedAt,
          rewardTitle: rewards.title, playerName: players.name, playerNickname: players.nickname,
        })
        .from(redemptions)
        .innerJoin(rewards, eq(rewards.id, redemptions.rewardId))
        .innerJoin(players, eq(players.id, redemptions.playerId))
        .orderBy(desc(redemptions.requestedAt));
      return NextResponse.json(rows);
    }

    const auth = await requireSession();
    if ('response' in auth) return auth.response;
    if (!auth.session.player) return NextResponse.json([]);
    const rows = await db
      .select({
        id: redemptions.id, cost: redemptions.cost, status: redemptions.status,
        requestedAt: redemptions.requestedAt, rewardTitle: rewards.title,
      })
      .from(redemptions)
      .innerJoin(rewards, eq(rewards.id, redemptions.rewardId))
      .where(eq(redemptions.playerId, auth.session.player.id))
      .orderBy(desc(redemptions.requestedAt));
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
    const { rewardId } = await request.json();
    const [reward] = await db.select().from(rewards).where(eq(rewards.id, rewardId));
    if (!reward || !reward.active) {
      return NextResponse.json({ error: 'Premio no disponible' }, { status: 404 });
    }
    if (await hasPendingPenalty(player.id)) {
      return NextResponse.json({ error: 'Estás en bancarrota: cumple tu penalización antes' }, { status: 403 });
    }

    const [redemption] = await db.insert(redemptions).values({
      playerId: player.id,
      rewardId: reward.id,
      cost: reward.cost,
    }).returning();

    try {
      await applyTokenMovement(player.id, -reward.cost, 'redemption', redemption.id);
    } catch {
      await db.delete(redemptions).where(eq(redemptions.id, redemption.id));
      return NextResponse.json({ error: 'No tienes saldo suficiente' }, { status: 400 });
    }

    await detectBankruptcies([player.id]);
    return NextResponse.json(redemption, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Error al canjear' }, { status: 500 });
  }
}
