import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { players, penalties } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { requireAdmin } from '@/lib/auth/guard';
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
    const { playerId } = await request.json();
    const [player] = await db.select().from(players).where(eq(players.id, playerId));
    if (!player) return NextResponse.json({ error: 'Jugador no encontrado' }, { status: 404 });

    const [pending] = await db.select().from(penalties)
      .where(and(eq(penalties.playerId, playerId), eq(penalties.status, 'pending')));

    if (pending) {
      await applyTokenMovement(playerId, BETTING.buyInTokens, 'rebuy', pending.id);
      await db.update(penalties).set({ status: 'fulfilled', fulfilledAt: now() }).where(eq(penalties.id, pending.id));
    } else {
      await applyTokenMovement(playerId, BETTING.buyInTokens, 'buyin');
    }

    const [updated] = await db.select().from(players).where(eq(players.id, playerId));
    return NextResponse.json({ playerId, balance: updated.tokenBalance, kind: pending ? 'rebuy' : 'buyin' });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al registrar la entrada' }, { status: 500 });
  }
}
