// src/lib/betting/settle-logic.test.ts
import { describe, it, expect } from 'vitest';
import { matchSetsScore, isBankrupt, resettleExactPool, type ResettleBet } from './settle-logic';

describe('matchSetsScore', () => {
  it('2-0 si el perdedor no ganó ningún set', () => {
    expect(matchSetsScore([{ team1Games: 6, team2Games: 3 }, { team1Games: 6, team2Games: 4 }], 1)).toBe('2-0');
  });
  it('2-1 si el perdedor ganó un set', () => {
    expect(matchSetsScore([
      { team1Games: 6, team2Games: 3 }, { team1Games: 4, team2Games: 6 }, { team1Games: 7, team2Games: 5 },
    ], 1)).toBe('2-1');
  });
  it('funciona cuando gana el equipo 2', () => {
    expect(matchSetsScore([
      { team1Games: 3, team2Games: 6 }, { team1Games: 6, team2Games: 4 }, { team1Games: 2, team2Games: 6 },
    ], 2)).toBe('2-1');
  });
});

describe('isBankrupt', () => {
  it('saldo bajo y sin apuestas abiertas: bancarrota', () => { expect(isBankrupt(9, 0)).toBe(true); });
  it('saldo bajo pero con apuestas abiertas: aún no', () => { expect(isBankrupt(0, 1)).toBe(false); });
  it('saldo igual a la apuesta mínima: no', () => { expect(isBankrupt(10, 0)).toBe(false); });
});

describe('resettleExactPool', () => {
  const bet = (over: Partial<ResettleBet> & Pick<ResettleBet, 'id' | 'playerId'>): ResettleBet => ({
    status: 'lost', amount: 10, payout: 0, predictedTeam: 1, predictedScore: '2-0', ...over,
  });

  it('mismo marcador: todos los deltas a 0 y sin cambios', () => {
    const bets = [
      bet({ id: 'b1', playerId: 'p1', status: 'won', payout: 20, predictedScore: '2-0' }),
      bet({ id: 'b2', playerId: 'p2', status: 'lost', predictedScore: '2-1' }),
    ];
    const out = resettleExactPool(bets, 1, '2-0');
    expect(out.every((o) => o.delta === 0 && !o.changed)).toBe(true);
  });

  it('el marcador corregido voltea ganador y perdedor del pool', () => {
    const bets = [
      bet({ id: 'b1', playerId: 'p1', status: 'won', payout: 20, predictedScore: '2-0' }),
      bet({ id: 'b2', playerId: 'p2', status: 'lost', predictedScore: '2-1' }),
    ];
    const out = resettleExactPool(bets, 1, '2-1');
    const b1 = out.find((o) => o.betId === 'b1')!;
    const b2 = out.find((o) => o.betId === 'b2')!;
    // b1 había cobrado 20 y ahora pierde: devuelve 20. b2 gana el pool entero (20).
    expect(b1).toMatchObject({ newStatus: 'lost', newPayout: 0, delta: -20, changed: true });
    expect(b2).toMatchObject({ newStatus: 'won', newPayout: 20, delta: 20, changed: true });
  });

  it('pool antes reembolsado (nadie acertó): el nuevo acertante cobra y el resto pasa a lost', () => {
    // Originalmente el marcador era 2-0 y nadie lo predijo → todos refunded (+amount).
    const bets = [
      bet({ id: 'b1', playerId: 'p1', status: 'refunded', predictedScore: '2-1', predictedTeam: 1 }),
      bet({ id: 'b2', playerId: 'p2', status: 'refunded', predictedScore: '2-1', predictedTeam: 2 }),
    ];
    const out = resettleExactPool(bets, 1, '2-1');
    const b1 = out.find((o) => o.betId === 'b1')!;
    const b2 = out.find((o) => o.betId === 'b2')!;
    // b1 acierta ahora: pool 20, ya tenía 10 devueltos → delta +10.
    expect(b1).toMatchObject({ newStatus: 'won', newPayout: 20, delta: 10, changed: true });
    // b2 pasa de reembolsado a perdedor: devuelve sus 10.
    expect(b2).toMatchObject({ newStatus: 'lost', newPayout: 0, delta: -10, changed: true });
  });

  it('con el nuevo marcador nadie acierta: todo el pool se reembolsa', () => {
    const bets = [
      bet({ id: 'b1', playerId: 'p1', status: 'won', payout: 30, predictedScore: '2-0' }),
      bet({ id: 'b2', playerId: 'p2', status: 'lost', predictedScore: '2-0', predictedTeam: 2 }),
      bet({ id: 'b3', playerId: 'p3', status: 'lost', predictedScore: '2-0', predictedTeam: 2 }),
    ];
    const out = resettleExactPool(bets, 1, '2-1');
    expect(out.find((o) => o.betId === 'b1')).toMatchObject({ newStatus: 'refunded', newPayout: 10, delta: -20 });
    expect(out.find((o) => o.betId === 'b2')).toMatchObject({ newStatus: 'refunded', newPayout: 10, delta: 10 });
    expect(out.find((o) => o.betId === 'b3')).toMatchObject({ newStatus: 'refunded', newPayout: 10, delta: 10 });
  });

  it('conserva las fichas: Σ(nuevos pagos) == pool', () => {
    const bets = [
      bet({ id: 'b1', playerId: 'p1', status: 'won', payout: 17, amount: 7, predictedScore: '2-0' }),
      bet({ id: 'b2', playerId: 'p2', status: 'lost', amount: 5, predictedScore: '2-1' }),
      bet({ id: 'b3', playerId: 'p3', status: 'lost', amount: 5, predictedScore: '2-1', predictedTeam: 2 }),
    ];
    const out = resettleExactPool(bets, 1, '2-1');
    const totalPaid = out.reduce((s, o) => s + o.newPayout, 0);
    expect(totalPaid).toBe(17); // 7 + 5 + 5
  });
});
