import { describe, it, expect } from 'vitest';
import { ladderStandings } from './ladder';

describe('ladderStandings', () => {
  it('clasifica por pista (0 = mejor); dentro de la pista, por juegos acumulados', () => {
    // Ronda final: pista0 = [X, Y], pista1 = [Z, W]. Juegos: Y>X, Z>W.
    const finalCourts = [['X', 'Y'], ['Z', 'W']];
    const games = new Map([['X', 10], ['Y', 14], ['Z', 9], ['W', 3]]);
    const table = ladderStandings(finalCourts, games, []);
    expect(table.map((r) => r.entityId)).toEqual(['Y', 'X', 'Z', 'W']);
    expect(table.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
    expect(table[0].court).toBe(0);
    expect(table[2].court).toBe(1);
  });

  it('los que descansan en la ronda final van al final', () => {
    const finalCourts = [['A', 'B']];
    const games = new Map([['A', 5], ['B', 8], ['R', 99]]);
    const table = ladderStandings(finalCourts, games, ['R']);
    expect(table.map((r) => r.entityId)).toEqual(['B', 'A', 'R']);
    expect(table[2].entityId).toBe('R');
    expect(table[2].court).toBeNull();
  });

  it('sin juegos registrados, mantiene el orden dentro de la pista de forma estable', () => {
    const finalCourts = [['A', 'B']];
    const table = ladderStandings(finalCourts, new Map(), []);
    expect(table.map((r) => r.entityId)).toEqual(['A', 'B']);
  });
});
