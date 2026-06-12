// src/lib/betting/settle-logic.ts
// Decisiones de liquidación (lógica pura, sin DB).
import { BETTING, type BetMarket, type SetsScore } from './config';

export interface BetForSettlement {
  id: string;
  playerId: string;
  market: BetMarket;
  predictedTeam: number;            // 1 | 2
  predictedScore: SetsScore | null; // solo exact_score
  amount: number;
  odds: number;
}

export interface BetOutcome {
  betId: string;
  playerId: string;
  status: 'won' | 'lost';
  amount: number;
  payout: number; // 0 si lost
}

export function matchSetsScore(
  sets: { team1Games: number; team2Games: number }[],
  winnerTeam: 1 | 2,
): SetsScore {
  const loserSetsWon = sets.filter((s) =>
    winnerTeam === 1 ? s.team2Games > s.team1Games : s.team1Games > s.team2Games,
  ).length;
  return loserSetsWon === 0 ? '2-0' : '2-1';
}

export function settleBet(bet: BetForSettlement, winnerTeam: 1 | 2, score: SetsScore): BetOutcome {
  const teamOk = bet.predictedTeam === winnerTeam;
  const won = bet.market === 'winner' ? teamOk : teamOk && bet.predictedScore === score;
  return {
    betId: bet.id,
    playerId: bet.playerId,
    status: won ? 'won' : 'lost',
    amount: bet.amount,
    payout: won ? Math.round(bet.amount * bet.odds) : 0,
  };
}

export function isBankrupt(balance: number, openBetsCount: number): boolean {
  return balance < BETTING.minBet && openBetsCount === 0;
}
