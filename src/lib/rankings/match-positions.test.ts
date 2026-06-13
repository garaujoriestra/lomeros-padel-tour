import { describe, it, expect } from 'vitest';
import { computeResultPositions } from './match-positions';

describe('computeResultPositions', () => {
  it('calcula posición antes y después con el ELO ya actualizado', () => {
    // Estado AFTER (ya procesado): A escaló por encima de B.
    // A: jugó este partido (+30), B: jugó este partido (-30).
    // C no jugó (sin cambios). Ranking after: A(1620) > C(1600) > B(1570).
    const after = [
      { id: 'A', eloRating: 1620, matchesPlayed: 5 },
      { id: 'B', eloRating: 1570, matchesPlayed: 5 },
      { id: 'C', eloRating: 1600, matchesPlayed: 9 },
    ];
    const changes = [
      { playerId: 'A', eloAfter: 1620, eloChange: 30 }, // before 1590
      { playerId: 'B', eloAfter: 1570, eloChange: -30 }, // before 1600
    ];
    const pos = computeResultPositions(after, changes);
    // Before: B(1600) y C(1600) empatan arriba, A(1590) abajo.
    //   El empate se rompe por orden del array → B antes que C.
    //   before ranks: B=1, C=2, A=3.
    // After: A=1, C=2, B=3.
    expect(pos.get('A')).toEqual({ before: 3, after: 1 });
    expect(pos.get('B')).toEqual({ before: 1, after: 3 });
  });

  it('marca before=null cuando es el primer partido del jugador', () => {
    const after = [
      { id: 'A', eloRating: 1480, matchesPlayed: 1 }, // debutó en este partido
      { id: 'B', eloRating: 1520, matchesPlayed: 10 },
    ];
    const changes = [
      { playerId: 'A', eloAfter: 1480, eloChange: -20 }, // before 1500, pero matchesPlayed-1 = 0
    ];
    const pos = computeResultPositions(after, changes);
    expect(pos.get('A')).toEqual({ before: null, after: 2 });
  });

  it('excluye del ranking a los jugadores sin partidos', () => {
    const after = [
      { id: 'A', eloRating: 1600, matchesPlayed: 3 },
      { id: 'B', eloRating: 1700, matchesPlayed: 0 }, // sin partidos: no rankeado
    ];
    const changes = [{ playerId: 'A', eloAfter: 1600, eloChange: 10 }];
    const pos = computeResultPositions(after, changes);
    expect(pos.get('A')?.after).toBe(1);
  });
});
