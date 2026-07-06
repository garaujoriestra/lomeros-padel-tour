// src/lib/betting/settle-logic.ts
// Utilidades puras de liquidación compartidas (sin DB).
import { BETTING, type SetsScore } from './config';
import { settlePool, type PoolBet } from './parimutuel';

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

// ─── Re-liquidación del mercado exact_score al corregir un resultado ─────────
// Al editar los juegos de un partido completado el ganador no puede cambiar,
// pero el marcador en sets (2-0 ↔ 2-1) sí. Se recalcula el reparto del pool
// exact_score y se devuelve el delta neto por apuesta respecto a lo ya pagado.
// No se puede revertir+reliquidar con los asientos normales: el ledger tiene
// unicidad (reason, refId) y una segunda liquidación no volvería a pagar.

export interface ResettleBet {
  id: string;
  playerId: string;
  status: 'won' | 'lost' | 'refunded';
  amount: number;
  payout: number;
  predictedTeam: number;
  predictedScore: string | null;
}

export interface ResettleOutcome {
  betId: string;
  playerId: string;
  newStatus: 'won' | 'lost' | 'refunded';
  newPayout: number; // lo que la apuesta debe tener pagado tras la corrección
  delta: number;     // fichas a mover ahora: newPayout − ya recibido
  changed: boolean;  // el estado de la apuesta cambió (para avisar por push)
}

export function resettleExactPool(
  bets: ResettleBet[],
  winnerTeam: 1 | 2,
  newScore: SetsScore,
): ResettleOutcome[] {
  const poolBets: PoolBet[] = bets.map((b) => ({
    id: b.id,
    playerId: b.playerId,
    selection: `exact:${b.predictedTeam}:${b.predictedScore}`,
    amount: b.amount,
  }));
  const payouts = settlePool(poolBets, `exact:${winnerTeam}:${newScore}`);

  return payouts.map((p) => {
    const bet = bets.find((b) => b.id === p.betId)!;
    // Lo realmente recibido: los reembolsos devuelven el amount aunque la fila
    // guarde payout 0 (refundOpenBets no escribe payout).
    const alreadyPaid = bet.status === 'won' ? bet.payout : bet.status === 'refunded' ? bet.amount : 0;
    return {
      betId: p.betId,
      playerId: p.playerId,
      newStatus: p.status,
      newPayout: p.payout,
      delta: p.payout - alreadyPaid,
      changed: p.status !== bet.status,
    };
  });
}
