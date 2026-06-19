import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { matches, players, ratingHistory, pairStats, type RatingHistory, type PairStat } from '@/lib/db/schema';

// Todo el historial de Elo de los partidos del grupo (vía JOIN), por recordedAt asc.
export async function listRatingHistoryInGroup(groupId: string): Promise<RatingHistory[]> {
  return db.select({
    id: ratingHistory.id, playerId: ratingHistory.playerId, matchId: ratingHistory.matchId,
    eloBefore: ratingHistory.eloBefore, eloAfter: ratingHistory.eloAfter,
    eloChange: ratingHistory.eloChange, recordedAt: ratingHistory.recordedAt,
  })
    .from(ratingHistory)
    .innerJoin(matches, eq(matches.id, ratingHistory.matchId))
    .where(eq(matches.groupId, groupId))
    .orderBy(ratingHistory.recordedAt);
}

// Historial de Elo reciente del grupo (desc, limit) para el feed de la home.
export async function listRecentRatingHistoryInGroup(groupId: string, limit: number): Promise<RatingHistory[]> {
  return db.select({
    id: ratingHistory.id, playerId: ratingHistory.playerId, matchId: ratingHistory.matchId,
    eloBefore: ratingHistory.eloBefore, eloAfter: ratingHistory.eloAfter,
    eloChange: ratingHistory.eloChange, recordedAt: ratingHistory.recordedAt,
  })
    .from(ratingHistory)
    .innerJoin(matches, eq(matches.id, ratingHistory.matchId))
    .where(eq(matches.groupId, groupId))
    .orderBy(desc(ratingHistory.recordedAt))
    .limit(limit);
}

// Stats de pareja del grupo (vía JOIN al jugador 1; ambos son del mismo grupo),
// con mínimo de partidos, por Elo de pareja desc.
export async function listPairStatsInGroup(groupId: string, minMatches: number): Promise<PairStat[]> {
  return db.select({
    id: pairStats.id, player1Id: pairStats.player1Id, player2Id: pairStats.player2Id,
    matchesPlayed: pairStats.matchesPlayed, wins: pairStats.wins, losses: pairStats.losses,
    pairElo: pairStats.pairElo, synergyScore: pairStats.synergyScore, lastPlayed: pairStats.lastPlayed,
  })
    .from(pairStats)
    .innerJoin(players, eq(players.id, pairStats.player1Id))
    .where(and(eq(players.groupId, groupId), sql`${pairStats.matchesPlayed} >= ${minMatches}`))
    .orderBy(desc(pairStats.pairElo));
}
