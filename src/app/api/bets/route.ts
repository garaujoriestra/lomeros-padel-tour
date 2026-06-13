// src/app/api/bets/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { bets, matches, players } from '@/lib/db/schema';
import { and, eq, desc } from 'drizzle-orm';
import { requireSession } from '@/lib/auth/guard';
import { BETTING } from '@/lib/betting/config';
import { isBettingOpen } from '@/lib/betting/close-time';
import { applyTokenMovement } from '@/lib/betting/bank';
import { hasPendingPenalty } from '@/lib/betting/settle';

// GET /api/bets?matchId=… → apuestas (públicas) de un partido, con nombre del apostante
// GET /api/bets?mine=1   → mis apuestas (requiere sesión)
export async function GET(request: NextRequest) {
  try {
    const matchId = request.nextUrl.searchParams.get('matchId');
    const mine = request.nextUrl.searchParams.get('mine');

    if (matchId) {
      const rows = await db
        .select({
          id: bets.id, matchId: bets.matchId, playerId: bets.playerId,
          market: bets.market, predictedTeam: bets.predictedTeam,
          predictedScore: bets.predictedScore, amount: bets.amount,
          odds: bets.odds, status: bets.status, payout: bets.payout,
          createdAt: bets.createdAt,
          playerName: players.name, playerNickname: players.nickname,
          playerAvatarUrl: players.avatarUrl,
        })
        .from(bets)
        .innerJoin(players, eq(players.id, bets.playerId))
        .where(eq(bets.matchId, matchId))
        .orderBy(desc(bets.createdAt));
      return NextResponse.json(rows);
    }

    if (mine) {
      const auth = await requireSession();
      if ('response' in auth) return auth.response;
      if (!auth.session.player) return NextResponse.json([]);
      const rows = await db.select().from(bets)
        .where(eq(bets.playerId, auth.session.player.id))
        .orderBy(desc(bets.createdAt));
      return NextResponse.json(rows);
    }

    return NextResponse.json({ error: 'Falta matchId o mine' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Error al obtener apuestas' }, { status: 500 });
  }
}

// POST /api/bets
// Body: { matchId, market: 'winner'|'exact_score', predictedTeam: 1|2,
//         predictedScore?: '2-0'|'2-1', amount }
// Pari-mutuel: solo se registra la selección + cantidad (sin cuota congelada).
export async function POST(request: NextRequest) {
  const auth = await requireSession();
  if ('response' in auth) return auth.response;
  const player = auth.session.player;
  if (!player) {
    return NextResponse.json({ error: 'Tu cuenta no está vinculada a un jugador' }, { status: 403 });
  }
  let chargedAmount: number | null = null;
  try {
    const body = await request.json();
    const { matchId, market, predictedTeam, predictedScore, amount } = body;

    if (market !== 'winner' && market !== 'exact_score') {
      return NextResponse.json({ error: 'Mercado inválido' }, { status: 400 });
    }
    if (predictedTeam !== 1 && predictedTeam !== 2) {
      return NextResponse.json({ error: 'Equipo inválido' }, { status: 400 });
    }
    if (market === 'exact_score' && predictedScore !== '2-0' && predictedScore !== '2-1') {
      return NextResponse.json({ error: 'Marcador inválido' }, { status: 400 });
    }
    if (!Number.isInteger(amount) || amount < BETTING.minBet || amount > BETTING.maxBet) {
      return NextResponse.json(
        { error: `La apuesta debe estar entre ${BETTING.minBet} y ${BETTING.maxBet} tokens` },
        { status: 400 },
      );
    }

    const [match] = await db.select().from(matches).where(eq(matches.id, matchId));
    if (!match) return NextResponse.json({ error: 'Partido no encontrado' }, { status: 404 });
    if (!isBettingOpen(match)) {
      return NextResponse.json({ error: 'Las apuestas de este partido están cerradas' }, { status: 400 });
    }

    // Auto-apuesta: si el jugador juega el partido, solo «ganador» a su pareja.
    const inTeam1 = [match.team1Player1Id, match.team1Player2Id].includes(player.id);
    const inTeam2 = [match.team2Player1Id, match.team2Player2Id].includes(player.id);
    if (inTeam1 || inTeam2) {
      const ownTeam = inTeam1 ? 1 : 2;
      if (market !== 'winner' || predictedTeam !== ownTeam) {
        return NextResponse.json(
          { error: 'Si juegas el partido solo puedes apostar a tu propia victoria (mercado ganador)' },
          { status: 403 },
        );
      }
    }

    if (await hasPendingPenalty(player.id)) {
      return NextResponse.json(
        { error: 'Estás en bancarrota: cumple tu penalización para volver a apostar' },
        { status: 403 },
      );
    }

    // Sustituir apuesta previa abierta en este mercado, si la hay.
    const [previous] = await db.select().from(bets).where(and(
      eq(bets.matchId, matchId), eq(bets.playerId, player.id), eq(bets.market, market),
    ));
    if (previous) {
      if (previous.status !== 'open') {
        return NextResponse.json({ error: 'Esa apuesta ya está liquidada' }, { status: 400 });
      }
      await applyTokenMovement(player.id, previous.amount, 'bet_cancelled', previous.id);
      await db.delete(bets).where(eq(bets.id, previous.id));
    }

    let newBalance: number;
    try {
      newBalance = await applyTokenMovement(player.id, -amount, 'bet_placed');
    } catch {
      return NextResponse.json({ error: 'No tienes saldo suficiente' }, { status: 400 });
    }
    chargedAmount = amount;

    const [bet] = await db.insert(bets).values({
      matchId,
      playerId: player.id,
      market,
      predictedTeam,
      predictedScore: market === 'exact_score' ? predictedScore : null,
      amount,
    }).returning();

    return NextResponse.json({ bet, balance: newBalance }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (chargedAmount !== null && msg.includes('UNIQUE')) {
      await applyTokenMovement(player.id, chargedAmount, 'bet_cancelled');
      return NextResponse.json({ error: 'Apuesta duplicada; inténtalo de nuevo' }, { status: 409 });
    }
    console.error(error);
    return NextResponse.json({ error: 'Error al apostar' }, { status: 500 });
  }
}

// DELETE /api/bets?matchId=…&market=… — cancela mi apuesta abierta
export async function DELETE(request: NextRequest) {
  const auth = await requireSession();
  if ('response' in auth) return auth.response;
  const player = auth.session.player;
  if (!player) return NextResponse.json({ error: 'Sin jugador vinculado' }, { status: 403 });
  try {
    const matchId = request.nextUrl.searchParams.get('matchId');
    const market = request.nextUrl.searchParams.get('market');
    if (!matchId || (market !== 'winner' && market !== 'exact_score')) {
      return NextResponse.json({ error: 'Falta matchId o market válido' }, { status: 400 });
    }

    const [match] = await db.select().from(matches).where(eq(matches.id, matchId));
    if (!match) return NextResponse.json({ error: 'Partido no encontrado' }, { status: 404 });
    if (!isBettingOpen(match)) {
      return NextResponse.json({ error: 'Las apuestas ya están cerradas' }, { status: 400 });
    }

    const [bet] = await db.select().from(bets).where(and(
      eq(bets.matchId, matchId), eq(bets.playerId, player.id), eq(bets.market, market),
    ));
    if (!bet || bet.status !== 'open') {
      return NextResponse.json({ error: 'No tienes apuesta abierta en ese mercado' }, { status: 404 });
    }

    await applyTokenMovement(player.id, bet.amount, 'bet_cancelled', bet.id);
    await db.delete(bets).where(eq(bets.id, bet.id));
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Error al cancelar la apuesta' }, { status: 500 });
  }
}
