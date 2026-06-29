// src/app/api/bets/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { bets } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { requireGroupSession } from '@/lib/auth/guard';
import { getDefaultGroupId } from '@/lib/auth/group-context';
import { groupIdFromQuery, groupIdFromValue } from '@/lib/groups/request-group';
import { getMatchInGroup } from '@/lib/matches/queries';
import { getBetsWithBettorForMatch, getMyBets, getBetInMarket, deleteBet } from '@/lib/betting/queries';
import { BETTING } from '@/lib/betting/config';
import { isBettingOpen } from '@/lib/betting/close-time';
import { applyTokenMovement, applyTokenMovementTx } from '@/lib/betting/bank';
import { hasPendingPenalty } from '@/lib/betting/settle';

// GET /api/bets?matchId=… → apuestas (públicas) de un partido del grupo por defecto
// GET /api/bets?mine=1   → mis apuestas (requiere sesión)
export async function GET(request: NextRequest) {
  try {
    const matchId = request.nextUrl.searchParams.get('matchId');
    const mine = request.nextUrl.searchParams.get('mine');

    if (matchId) {
      // El partido debe ser del grupo indicado (o por defecto); si no, no se exponen sus apuestas.
      const groupId = (await groupIdFromQuery(request)) ?? (await getDefaultGroupId());
      const match = await getMatchInGroup(groupId, matchId);
      if (!match) return NextResponse.json({ error: 'Partido no encontrado' }, { status: 404 });
      const rows = await getBetsWithBettorForMatch(matchId);
      return NextResponse.json(rows);
    }

    if (mine) {
      const auth = await requireGroupSession(await groupIdFromQuery(request));
      if ('response' in auth) return auth.response;
      if (!auth.ctx.playerId) return NextResponse.json([]);
      const rows = await getMyBets(auth.ctx.playerId);
      return NextResponse.json(rows);
    }

    return NextResponse.json({ error: 'Falta matchId o mine' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Error al obtener apuestas' }, { status: 500 });
  }
}

// POST /api/bets
// Body: { g?, matchId, market: 'winner'|'exact_score', predictedTeam: 1|2,
//         predictedScore?: '2-0'|'2-1', amount }
// Pari-mutuel: solo se registra la selección + cantidad (sin cuota congelada).
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  const auth = await requireGroupSession(await groupIdFromValue(body.g));
  if ('response' in auth) return auth.response;
  const playerId = auth.ctx.playerId;
  if (!playerId) {
    return NextResponse.json({ error: 'Tu cuenta no está vinculada a un jugador' }, { status: 403 });
  }
  try {
    const groupId = auth.ctx.groupId;
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

    // El partido debe ser del grupo del apostante (no se apuesta a partidos de otro grupo).
    const match = await getMatchInGroup(groupId, matchId);
    if (!match) return NextResponse.json({ error: 'Partido no encontrado' }, { status: 404 });
    if (!isBettingOpen(match)) {
      return NextResponse.json({ error: 'Las apuestas de este partido están cerradas' }, { status: 400 });
    }

    // Auto-apuesta: si el jugador juega el partido, solo «ganador» a su pareja.
    const inTeam1 = [match.team1Player1Id, match.team1Player2Id].includes(playerId);
    const inTeam2 = [match.team2Player1Id, match.team2Player2Id].includes(playerId);
    if (inTeam1 || inTeam2) {
      const ownTeam = inTeam1 ? 1 : 2;
      if (market !== 'winner' || predictedTeam !== ownTeam) {
        return NextResponse.json(
          { error: 'Si juegas el partido solo puedes apostar a tu propia victoria (mercado ganador)' },
          { status: 403 },
        );
      }
    }

    if (await hasPendingPenalty(playerId)) {
      return NextResponse.json(
        { error: 'Estás en bancarrota: cumple tu penalización para volver a apostar' },
        { status: 403 },
      );
    }

    // Apuesta previa abierta en este mercado (si la hay): se sustituye.
    const previous = await getBetInMarket(matchId, playerId, market);
    if (previous && previous.status !== 'open') {
      return NextResponse.json({ error: 'Esa apuesta ya está liquidada' }, { status: 400 });
    }

    // Sustituir-previa + cobro + alta de la apuesta van en UNA sola transacción.
    // Si el insert falla por lo que sea, el rollback deshace el cobro: nunca se
    // descuentan fichas sin que quede registrada la apuesta.
    const { bet, balance } = await db.transaction(async (tx) => {
      if (previous) {
        await applyTokenMovementTx(tx, playerId, previous.amount, 'bet_cancelled', previous.id);
        await tx.delete(bets).where(eq(bets.id, previous.id));
      }
      const balance = await applyTokenMovementTx(tx, playerId, -amount, 'bet_placed');
      const [bet] = await tx.insert(bets).values({
        matchId,
        playerId,
        market,
        predictedTeam,
        predictedScore: market === 'exact_score' ? predictedScore : null,
        amount,
      }).returning();
      return { bet, balance };
    });

    return NextResponse.json({ bet, balance }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    // El cobro y el alta van en la misma transacción, así que cualquier fallo
    // deja el saldo intacto (rollback). Solo hay que mapear el error a respuesta.
    if (msg.includes('SALDO_INSUFICIENTE')) {
      return NextResponse.json({ error: 'No tienes saldo suficiente' }, { status: 400 });
    }
    if (msg.includes('UNIQUE')) {
      return NextResponse.json({ error: 'Apuesta duplicada; inténtalo de nuevo' }, { status: 409 });
    }
    console.error(error);
    return NextResponse.json({ error: 'Error al apostar' }, { status: 500 });
  }
}

// DELETE /api/bets?matchId=…&market=… — cancela mi apuesta abierta
export async function DELETE(request: NextRequest) {
  const auth = await requireGroupSession(await groupIdFromQuery(request));
  if ('response' in auth) return auth.response;
  const playerId = auth.ctx.playerId;
  if (!playerId) return NextResponse.json({ error: 'Sin jugador vinculado' }, { status: 403 });
  try {
    const groupId = auth.ctx.groupId;
    const matchId = request.nextUrl.searchParams.get('matchId');
    const market = request.nextUrl.searchParams.get('market');
    if (!matchId || (market !== 'winner' && market !== 'exact_score')) {
      return NextResponse.json({ error: 'Falta matchId o market válido' }, { status: 400 });
    }

    const match = await getMatchInGroup(groupId, matchId);
    if (!match) return NextResponse.json({ error: 'Partido no encontrado' }, { status: 404 });
    if (!isBettingOpen(match)) {
      return NextResponse.json({ error: 'Las apuestas ya están cerradas' }, { status: 400 });
    }

    const bet = await getBetInMarket(matchId, playerId, market);
    if (!bet || bet.status !== 'open') {
      return NextResponse.json({ error: 'No tienes apuesta abierta en ese mercado' }, { status: 404 });
    }

    await applyTokenMovement(playerId, bet.amount, 'bet_cancelled', bet.id);
    await deleteBet(bet.id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Error al cancelar la apuesta' }, { status: 500 });
  }
}
