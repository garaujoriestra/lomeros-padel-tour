import { describe, it, expect } from 'vitest';
import { seedPozoCourts, courtPairing } from './pozo';

describe('seedPozoCourts', () => {
  it('reparte en pistas de 4 en orden, sin sobrantes', () => {
    const r = seedPozoCourts(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], 2);
    expect(r.courts).toEqual([
      ['a', 'b', 'c', 'd'],
      ['e', 'f', 'g', 'h'],
    ]);
    expect(r.resting).toEqual([]);
  });

  it('deja los sobrantes en resting', () => {
    const r = seedPozoCourts(['a', 'b', 'c', 'd', 'e', 'f'], 2);
    expect(r.courts).toEqual([['a', 'b', 'c', 'd']]);
    expect(r.resting).toEqual(['e', 'f']);
  });

  it('no crea más pistas de las que hay jugadores para llenar', () => {
    const r = seedPozoCourts(['a', 'b', 'c', 'd', 'e'], 3);
    expect(r.courts).toEqual([['a', 'b', 'c', 'd']]);
    expect(r.resting).toEqual(['e']);
  });
});

describe('courtPairing', () => {
  const court = ['p0', 'p1', 'p2', 'p3'];

  it('ronda 0: (0,1) vs (2,3)', () => {
    expect(courtPairing(court, 0)).toEqual({ teamA: ['p0', 'p1'], teamB: ['p2', 'p3'] });
  });
  it('ronda 1: (0,2) vs (1,3)', () => {
    expect(courtPairing(court, 1)).toEqual({ teamA: ['p0', 'p2'], teamB: ['p1', 'p3'] });
  });
  it('ronda 2: (0,3) vs (1,2)', () => {
    expect(courtPairing(court, 2)).toEqual({ teamA: ['p0', 'p3'], teamB: ['p1', 'p2'] });
  });
  it('ronda 3 vuelve al patrón de la ronda 0 (módulo 3)', () => {
    expect(courtPairing(court, 3)).toEqual({ teamA: ['p0', 'p1'], teamB: ['p2', 'p3'] });
  });
});
