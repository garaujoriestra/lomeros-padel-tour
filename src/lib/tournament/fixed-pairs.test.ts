import { describe, it, expect } from 'vitest';
import { roundRobinSchedule, groupStandings, seedOrder, generateBracket, resolveBracket } from './fixed-pairs';
import type { PairMatchResult, BracketMatch, ResolvedBracketMatch } from './fixed-pairs';

describe('roundRobinSchedule', () => {
  it('4 parejas: 3 rondas, 6 partidos, todos contra todos', () => {
    const matches = roundRobinSchedule(['p1', 'p2', 'p3', 'p4']);
    expect(matches).toEqual([
      { round: 0, pairA: 'p1', pairB: 'p4' },
      { round: 0, pairA: 'p2', pairB: 'p3' },
      { round: 1, pairA: 'p1', pairB: 'p3' },
      { round: 1, pairA: 'p4', pairB: 'p2' },
      { round: 2, pairA: 'p1', pairB: 'p2' },
      { round: 2, pairA: 'p3', pairB: 'p4' },
    ]);
  });

  it('3 parejas (impar): 3 partidos, cada una juega 2, una descansa por ronda', () => {
    const matches = roundRobinSchedule(['p1', 'p2', 'p3']);
    expect(matches).toEqual([
      { round: 0, pairA: 'p2', pairB: 'p3' },
      { round: 1, pairA: 'p1', pairB: 'p3' },
      { round: 2, pairA: 'p1', pairB: 'p2' },
    ]);
  });

  it('menos de 2 parejas: sin partidos', () => {
    expect(roundRobinSchedule(['p1'])).toEqual([]);
    expect(roundRobinSchedule([])).toEqual([]);
  });
});

describe('groupStandings', () => {
  it('ordena por puntos, luego diferencia de juegos, luego juegos a favor', () => {
    const results: PairMatchResult[] = [
      { pairA: 'p1', pairB: 'p2', gamesA: 6, gamesB: 2, winner: 'A' }, // p1 gana
      { pairA: 'p1', pairB: 'p3', gamesA: 6, gamesB: 4, winner: 'A' }, // p1 gana
      { pairA: 'p2', pairB: 'p3', gamesA: 6, gamesB: 3, winner: 'A' }, // p2 gana
    ];
    const table = groupStandings(['p1', 'p2', 'p3'], results);
    // p1: 2W 6pts, dif=(12-6)=+6 ; p2: 1W1L 3pts, dif=(8-9)=-1 ; p3: 2L 0pts, dif=(7-12)=-5
    expect(table.map((r) => r.pairId)).toEqual(['p1', 'p2', 'p3']);
    expect(table[0]).toMatchObject({ pairId: 'p1', played: 2, wins: 2, draws: 0, losses: 0, gamesFor: 12, gamesAgainst: 6, gameDiff: 6, points: 6, rank: 1 });
    expect(table[1]).toMatchObject({ pairId: 'p2', wins: 1, losses: 1, points: 3, gameDiff: -1, rank: 2 });
    expect(table[2]).toMatchObject({ pairId: 'p3', wins: 0, losses: 2, points: 0, rank: 3 });
  });

  it('cuenta empates con 1 punto', () => {
    const results: PairMatchResult[] = [
      { pairA: 'a', pairB: 'b', gamesA: 5, gamesB: 5, winner: 'draw' },
    ];
    const table = groupStandings(['a', 'b'], results);
    expect(table[0]).toMatchObject({ played: 1, wins: 0, draws: 1, losses: 0, points: 1 });
    expect(table[1]).toMatchObject({ played: 1, draws: 1, points: 1 });
  });
});

describe('seedOrder', () => {
  it('tamaño 2: [0,1]', () => {
    expect(seedOrder(2)).toEqual([0, 1]);
  });
  it('tamaño 4: [0,3,1,2]', () => {
    expect(seedOrder(4)).toEqual([0, 3, 1, 2]);
  });
  it('tamaño 8: orden estándar de 8', () => {
    expect(seedOrder(8)).toEqual([0, 7, 3, 4, 1, 6, 2, 5]);
  });
});

describe('generateBracket', () => {
  it('4 parejas, sin byes: 2 partidos de ronda 0 + final', () => {
    const bracket = generateBracket(['A', 'B', 'C', 'D']);
    expect(bracket).toEqual<BracketMatch[]>([
      { matchId: 'r0m0', round: 0, slotA: { type: 'pair', pairId: 'A' }, slotB: { type: 'pair', pairId: 'D' } },
      { matchId: 'r0m1', round: 0, slotA: { type: 'pair', pairId: 'B' }, slotB: { type: 'pair', pairId: 'C' } },
      { matchId: 'r1m0', round: 1, slotA: { type: 'matchWinner', matchId: 'r0m0' }, slotB: { type: 'matchWinner', matchId: 'r0m1' } },
    ]);
  });

  it('3 parejas: el mejor sembrado recibe bye en ronda 0', () => {
    const bracket = generateBracket(['A', 'B', 'C']);
    // tamaño 4, orden [0,3,1,2]: m0 = seed0(A) vs seed3(bye), m1 = seed1(B) vs seed2(C)
    expect(bracket).toEqual<BracketMatch[]>([
      { matchId: 'r0m0', round: 0, slotA: { type: 'pair', pairId: 'A' }, slotB: { type: 'bye' } },
      { matchId: 'r0m1', round: 0, slotA: { type: 'pair', pairId: 'B' }, slotB: { type: 'pair', pairId: 'C' } },
      { matchId: 'r1m0', round: 1, slotA: { type: 'matchWinner', matchId: 'r0m0' }, slotB: { type: 'matchWinner', matchId: 'r0m1' } },
    ]);
  });

  it('menos de 2 parejas: cuadro vacío', () => {
    expect(generateBracket(['A'])).toEqual([]);
    expect(generateBracket([])).toEqual([]);
  });
});

describe('resolveBracket', () => {
  it('un bye avanza solo; un ganador propaga a la siguiente ronda', () => {
    const bracket = generateBracket(['A', 'B', 'C']); // A tiene bye en r0m0
    // B gana a C en r0m1 (B es slotA -> 'A')
    const results = new Map<string, 'A' | 'B'>([['r0m1', 'A']]);
    const resolved = resolveBracket(bracket, results);
    const byId = new Map(resolved.map((m) => [m.matchId, m]));

    // r0m0: A vs bye -> A gana automáticamente
    expect(byId.get('r0m0')!.winnerPairId).toBe('A');
    // r0m1: B gana a C
    expect(byId.get('r0m1')!.winnerPairId).toBe('B');
    // final r1m0: huecos resueltos a A y B, sin ganador aún
    expect(byId.get('r1m0')!.slotA).toEqual({ type: 'pair', pairId: 'A' });
    expect(byId.get('r1m0')!.slotB).toEqual({ type: 'pair', pairId: 'B' });
    expect(byId.get('r1m0')!.winnerPairId).toBeUndefined();
  });

  it('al cerrar la final, devuelve el campeón', () => {
    const bracket = generateBracket(['A', 'B', 'C']);
    const results = new Map<string, 'A' | 'B'>([
      ['r0m1', 'A'], // B gana a C
      ['r1m0', 'B'], // en la final, slotB (B) gana a slotA (A)
    ]);
    const resolved = resolveBracket(bracket, results);
    const final = resolved.find((m) => m.matchId === 'r1m0')!;
    expect(final.winnerPairId).toBe('B');
  });

  it('hueco no resuelto se queda como matchWinner', () => {
    const bracket = generateBracket(['A', 'B', 'C', 'D']);
    const resolved = resolveBracket(bracket, new Map());
    const final = resolved.find((m) => m.matchId === 'r1m0')!;
    expect(final.slotA).toEqual({ type: 'matchWinner', matchId: 'r0m0' });
    expect(final.winnerPairId).toBeUndefined();
  });
});
