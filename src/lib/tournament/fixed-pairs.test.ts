import { describe, it, expect } from 'vitest';
import { roundRobinSchedule } from './fixed-pairs';

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
