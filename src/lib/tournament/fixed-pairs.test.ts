import { describe, it, expect } from 'vitest';
import { roundRobinSchedule, groupStandings } from './fixed-pairs';
import type { PairMatchResult } from './fixed-pairs';

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
