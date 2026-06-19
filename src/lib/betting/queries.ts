import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bets, penalties, players, type Bet, type Penalty } from '@/lib/db/schema';

// Apuestas de un partido + datos del apostante (lista pública). El partido ya fue
// verificado en-grupo por el caller; las apuestas heredan el grupo por su FK matchId.
export async function getBetsWithBettorForMatch(matchId: string) {
  return db
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
}

// Mis apuestas (el jugador es su propia ficha en su grupo).
export async function getMyBets(playerId: string): Promise<Bet[]> {
  return db.select().from(bets)
    .where(eq(bets.playerId, playerId))
    .orderBy(desc(bets.createdAt));
}

// La apuesta del jugador en un mercado de un partido (para sustituir/cancelar).
export async function getBetInMarket(
  matchId: string,
  playerId: string,
  market: string,
): Promise<Bet | undefined> {
  const [b] = await db.select().from(bets).where(and(
    eq(bets.matchId, matchId), eq(bets.playerId, playerId), eq(bets.market, market),
  ));
  return b;
}

// Borra una apuesta por id (cancelación; el cobro se devuelve aparte por el caller).
export async function deleteBet(id: string): Promise<void> {
  await db.delete(bets).where(eq(bets.id, id));
}

// Penalización pendiente del jugador (el jugador ya fue verificado en-grupo por el caller).
export async function getPendingPenalty(playerId: string): Promise<Penalty | undefined> {
  const [p] = await db.select().from(penalties)
    .where(and(eq(penalties.playerId, playerId), eq(penalties.status, 'pending')));
  return p;
}

// Marca una penalización como cumplida (al pagar la recompra).
export async function fulfillPenalty(penaltyId: string, at: string): Promise<void> {
  await db.update(penalties).set({ status: 'fulfilled', fulfilledAt: at }).where(eq(penalties.id, penaltyId));
}
