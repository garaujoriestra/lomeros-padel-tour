// src/lib/betting/match-odds.ts
// Cuotas vigentes de un partido, a partir del Elo individual de los 4 jugadores.
import { db } from '@/lib/db';
import { players, type Match } from '@/lib/db/schema';
import { inArray } from 'drizzle-orm';
import { matchOddsFromRatings, type MatchOdds, type TeamRatingInput } from './odds';

export async function currentMatchOdds(
  match: Pick<Match, 'team1Player1Id' | 'team1Player2Id' | 'team2Player1Id' | 'team2Player2Id'>,
): Promise<MatchOdds> {
  const ids = [match.team1Player1Id, match.team1Player2Id, match.team2Player1Id, match.team2Player2Id];
  const rows = await db.select().from(players).where(inArray(players.id, ids));
  const eloOf = (id: string) => rows.find((p) => p.id === id)?.eloRating ?? 1500;

  const team1: TeamRatingInput = {
    player1Elo: eloOf(match.team1Player1Id),
    player2Elo: eloOf(match.team1Player2Id),
  };
  const team2: TeamRatingInput = {
    player1Elo: eloOf(match.team2Player1Id),
    player2Elo: eloOf(match.team2Player2Id),
  };
  return matchOddsFromRatings(team1, team2);
}
