// src/lib/betting/settle-logic.test.ts
import { describe, it, expect } from 'vitest';
import { matchSetsScore, settleBet, isBankrupt, type BetForSettlement } from './settle-logic';

const base: Omit<BetForSettlement, 'market' | 'predictedScore'> = {
  id: 'b1', playerId: 'p1', predictedTeam: 1, amount: 50, odds: 2.0,
};

describe('matchSetsScore', () => {
  it('2-0 si el perdedor no ganó ningún set', () => {
    const sets = [{ team1Games: 6, team2Games: 3 }, { team1Games: 6, team2Games: 4 }];
    expect(matchSetsScore(sets, 1)).toBe('2-0');
  });
  it('2-1 si el perdedor ganó un set', () => {
    const sets = [
      { team1Games: 6, team2Games: 3 },
      { team1Games: 4, team2Games: 6 },
      { team1Games: 7, team2Games: 5 },
    ];
    expect(matchSetsScore(sets, 1)).toBe('2-1');
  });
  it('funciona cuando gana el equipo 2', () => {
    const sets = [{ team1Games: 3, team2Games: 6 }, { team1Games: 6, team2Games: 4 }, { team1Games: 2, team2Games: 6 }];
    expect(matchSetsScore(sets, 2)).toBe('2-1');
  });
});

describe('settleBet — mercado ganador', () => {
  const bet: BetForSettlement = { ...base, market: 'winner', predictedScore: null };
  it('acierto: paga amount × odds redondeado', () => {
    const o = settleBet({ ...bet, odds: 2.3 }, 1, '2-0');
    expect(o.status).toBe('won');
    expect(o.payout).toBe(115); // 50 × 2.3
  });
  it('fallo: lost con payout 0', () => {
    const o = settleBet(bet, 2, '2-0');
    expect(o.status).toBe('lost');
    expect(o.payout).toBe(0);
  });
});

describe('settleBet — marcador exacto', () => {
  const bet: BetForSettlement = { ...base, market: 'exact_score', predictedScore: '2-1', odds: 4.0 };
  it('equipo y marcador correctos: won', () => {
    expect(settleBet(bet, 1, '2-1')).toMatchObject({ status: 'won', payout: 200 });
  });
  it('equipo correcto pero marcador incorrecto: lost', () => {
    expect(settleBet(bet, 1, '2-0').status).toBe('lost');
  });
  it('equipo incorrecto: lost aunque el marcador coincida', () => {
    expect(settleBet(bet, 2, '2-1').status).toBe('lost');
  });
});

describe('isBankrupt', () => {
  it('saldo bajo y sin apuestas abiertas: bancarrota', () => {
    expect(isBankrupt(9, 0)).toBe(true);
  });
  it('saldo bajo pero con apuestas abiertas: aún no', () => {
    expect(isBankrupt(0, 1)).toBe(false);
  });
  it('saldo igual a la apuesta mínima: no', () => {
    expect(isBankrupt(10, 0)).toBe(false);
  });
});
