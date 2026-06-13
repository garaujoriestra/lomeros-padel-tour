import { describe, it, expect } from 'vitest';
import { seedPozoCourts } from './pozo';

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
