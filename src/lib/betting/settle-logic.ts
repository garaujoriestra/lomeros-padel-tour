// src/lib/betting/settle-logic.ts
// Utilidades puras de liquidación compartidas (sin DB).
import { BETTING, type SetsScore } from './config';

// Marcador en sets a partir de los juegos: '2-0' si el perdedor no ganó set, '2-1' si ganó uno.
export function matchSetsScore(
  sets: { team1Games: number; team2Games: number }[],
  winnerTeam: 1 | 2,
): SetsScore {
  const loserSetsWon = sets.filter((s) =>
    winnerTeam === 1 ? s.team2Games > s.team1Games : s.team1Games > s.team2Games,
  ).length;
  return loserSetsWon === 0 ? '2-0' : '2-1';
}

// Bancarrota: por debajo de la apuesta mínima y sin apuestas abiertas pendientes de cobro.
export function isBankrupt(balance: number, openBetsCount: number): boolean {
  return balance < BETTING.minBet && openBetsCount === 0;
}
