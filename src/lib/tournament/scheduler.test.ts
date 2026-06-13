import { describe, it, expect } from 'vitest';
import { estimatedMatchMinutes } from './scheduler';
import type { MatchFormat } from './types';

describe('estimatedMatchMinutes', () => {
  it('usa los minutos exactos en formato cronometrado', () => {
    const f: MatchFormat = { kind: 'timed', minutes: 25, tieRule: 'golden_point' };
    expect(estimatedMatchMinutes(f)).toBe(25);
  });

  it('estima ~20 min para "hasta un set"', () => {
    expect(estimatedMatchMinutes({ kind: 'first_to_set' })).toBe(20);
  });

  it('estima por nº de juegos objetivo (~3.5 min/juego, mínimo 15)', () => {
    expect(estimatedMatchMinutes({ kind: 'games', target: 6 })).toBe(21);
    expect(estimatedMatchMinutes({ kind: 'games', target: 3 })).toBe(15);
  });

  it('estima ~40 min al mejor de 3', () => {
    expect(estimatedMatchMinutes({ kind: 'best_of_3' })).toBe(40);
  });
});
