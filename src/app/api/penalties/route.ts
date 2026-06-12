import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { penalties, players } from '@/lib/db/schema';
import { desc, eq } from 'drizzle-orm';
import { requireAdmin } from '@/lib/auth/guard';

// GET /api/penalties — todas, con nombre del jugador (admin)
export async function GET() {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  try {
    const rows = await db
      .select({
        id: penalties.id, playerId: penalties.playerId, description: penalties.description,
        status: penalties.status, rechargeAmount: penalties.rechargeAmount,
        createdAt: penalties.createdAt, fulfilledAt: penalties.fulfilledAt,
        playerName: players.name, playerNickname: players.nickname,
      })
      .from(penalties)
      .innerJoin(players, eq(players.id, penalties.playerId))
      .orderBy(desc(penalties.createdAt));
    return NextResponse.json(rows);
  } catch {
    return NextResponse.json({ error: 'Error al obtener penalizaciones' }, { status: 500 });
  }
}
