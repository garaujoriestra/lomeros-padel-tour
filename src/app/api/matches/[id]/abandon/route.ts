import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { matches } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { requireAdmin } from '@/lib/auth/guard';
import { refundOpenBets } from '@/lib/betting/settle';
import { notifyBetSettlements } from '@/lib/push/bet-events';

// POST /api/matches/[id]/abandon
// Marks a scheduled match as not finished due to injury. The match keeps its
// players and date but counts for nothing — no ELO, no V/D, no achievements.
// Body: { injuredPlayerId: string } — must be one of the four match players.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  try {
    const { id } = await params;
    const body = await req.json();
    const { injuredPlayerId } = body as { injuredPlayerId?: string };

    if (!injuredPlayerId) {
      return NextResponse.json({ error: 'Falta injuredPlayerId' }, { status: 400 });
    }

    const [match] = await db.select().from(matches).where(eq(matches.id, id));
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

    const [updated] = await db
      .update(matches)
      .set({ status: 'injury_aborted', injuredPlayerId, winnerTeam: null })
      .where(eq(matches.id, id))
      .returning();

    // «La Timba»: partido anulado → devolución íntegra
    const refunded = await refundOpenBets(id);
    await notifyBetSettlements(id, refunded);

    return NextResponse.json(updated);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al marcar lesión' }, { status: 500 });
  }
}
