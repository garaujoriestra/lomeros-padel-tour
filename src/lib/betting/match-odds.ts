// src/lib/betting/match-odds.ts
// Cuotas vigentes de un partido, leyendo Elo individual y de pareja de la DB.
import { db } from '@/lib/db';
import { players, pairStats, type Match } from '@/lib/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { matchOddsFromRatings, type MatchOdds, type TeamRatingInput } from './odds';

async function pairEloOf(p1: string, p2: string): Promise<number | null> {
  const [a, b] = [p1, p2].sort();
  const [row] = await db
    .select()
    .from(pairStats)
    .where(and(eq(pairStats.player1Id, a), eq(pairStats.player2Id, b)))
    .limit(1);
  // Una pareja sin partidos jugados no aporta señal: usar media individual.
  return row && row.matchesPlayed > 0 ? row.pairElo : null;
}

export async function currentMatchOdds(
  match: Pick<Match, 'team1Player1Id' | 'team1Player2Id' | 'team2Player1Id' | 'team2Player2Id'>,
): Promise<MatchOdds> {
  const ids = [match.team1Player1Id, match.team1Player2Id, match.team2Player1Id, match.team2Player2Id];
  const rows = await db.select().from(players).where(inArray(players.id, ids));
  const eloOf = (id: string) => rows.find((p) => p.id === id)?.eloRating ?? 1500;

  const team1: TeamRatingInput = {
    player1Elo: eloOf(match.team1Player1Id),
    player2Elo: eloOf(match.team1Player2Id),
    pairElo: await pairEloOf(match.team1Player1Id, match.team1Player2Id),
  };
  const team2: TeamRatingInput = {
    player1Elo: eloOf(match.team2Player1Id),
    player2Elo: eloOf(match.team2Player2Id),
    pairElo: await pairEloOf(match.team2Player1Id, match.team2Player2Id),
  };
  return matchOddsFromRatings(team1, team2);
}
