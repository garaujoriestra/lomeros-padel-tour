// src/lib/betting/match-odds.ts
// Estado de los pools de un partido + cuotas provisionales + guía de favorito.
import { db } from '@/lib/db';
import { bets, players, type Match } from '@/lib/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { provisionalMultiplier, eloFavorite } from './provisional-odds';

export interface MarketView {
  total: number;                              // pool total del mercado
  selections: Record<string, { pool: number; multiplier: number | null }>;
}

export interface MatchPools {
  winner: MarketView;       // selecciones: 'team:1', 'team:2'
  exact: MarketView;        // selecciones: 'exact:1:2-0', 'exact:1:2-1', 'exact:2:2-0', 'exact:2:2-1'
  eloFavoriteTeam: 0 | 1 | 2;
}

function emptyMarket(keys: string[]): MarketView {
  const selections: MarketView['selections'] = {};
  for (const k of keys) selections[k] = { pool: 0, multiplier: null };
  return { total: 0, selections };
}

export async function currentMatchPools(
  match: Pick<Match, 'id' | 'team1Player1Id' | 'team1Player2Id' | 'team2Player1Id' | 'team2Player2Id'>,
): Promise<MatchPools> {
  const open = await db.select().from(bets)
    .where(and(eq(bets.matchId, match.id), eq(bets.status, 'open')));

  const winner = emptyMarket(['team:1', 'team:2']);
  const exact = emptyMarket(['exact:1:2-0', 'exact:1:2-1', 'exact:2:2-0', 'exact:2:2-1']);

  for (const b of open) {
    if (b.market === 'winner') {
      const key = `team:${b.predictedTeam}`;
      if (winner.selections[key]) { winner.selections[key].pool += b.amount; winner.total += b.amount; }
    } else {
      const key = `exact:${b.predictedTeam}:${b.predictedScore}`;
      if (exact.selections[key]) { exact.selections[key].pool += b.amount; exact.total += b.amount; }
    }
  }
  for (const k of Object.keys(winner.selections)) {
    winner.selections[k].multiplier = provisionalMultiplier(winner.total, winner.selections[k].pool);
  }
  for (const k of Object.keys(exact.selections)) {
    exact.selections[k].multiplier = provisionalMultiplier(exact.total, exact.selections[k].pool);
  }

  const ids = [match.team1Player1Id, match.team1Player2Id, match.team2Player1Id, match.team2Player2Id];
  const rows = await db.select().from(players).where(inArray(players.id, ids));
  const eloOf = (id: string) => rows.find((p) => p.id === id)?.eloRating ?? 1500;
  const t1 = (eloOf(match.team1Player1Id) + eloOf(match.team1Player2Id)) / 2;
  const t2 = (eloOf(match.team2Player1Id) + eloOf(match.team2Player2Id)) / 2;

  return { winner, exact, eloFavoriteTeam: eloFavorite(t1, t2) };
}
