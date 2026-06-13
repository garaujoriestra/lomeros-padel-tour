import { describe, it, expect } from 'vitest';
import { seedPozoCourts, courtPairing, nextPozoRound } from './pozo';
import type { CourtResult } from './pozo';

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

describe('nextPozoRound (movimiento)', () => {
  it('con 3 pistas: ganadores suben, perdedores bajan, top/fondo se quedan', () => {
    const current = {
      courts: [
        ['a', 'b', 'c', 'd'], // pista 1 (top)
        ['e', 'f', 'g', 'h'], // pista 2
        ['i', 'j', 'k', 'l'], // pista 3 (fondo)
      ],
      resting: [] as string[],
    };
    const results: CourtResult[] = [
      { winners: ['a', 'b'], losers: ['c', 'd'] }, // top: a,b se quedan; c,d bajan a pista 2
      { winners: ['e', 'f'], losers: ['g', 'h'] }, // e,f suben a pista 1; g,h bajan a pista 3
      { winners: ['i', 'j'], losers: ['k', 'l'] }, // fondo: i,j suben a pista 2; k,l se quedan
    ];
    const next = nextPozoRound(current, results);
    // Pista 1: stayers top (a,b) + ganadores de pista 2 (e,f)
    expect(next.courts[0]).toEqual(['a', 'b', 'e', 'f']);
    // Pista 2: perdedores de pista 1 (c,d) + ganadores de pista 3 (i,j)
    expect(next.courts[1]).toEqual(['c', 'd', 'i', 'j']);
    // Pista 3 (fondo): perdedores de pista 2 (g,h) + stayers fondo (k,l)
    expect(next.courts[2]).toEqual(['g', 'h', 'k', 'l']);
    expect(next.resting).toEqual([]);
  });

  it('con 1 pista: ganadores y perdedores se quedan (sin movimiento)', () => {
    const current = { courts: [['a', 'b', 'c', 'd']], resting: [] as string[] };
    const results: CourtResult[] = [{ winners: ['a', 'b'], losers: ['c', 'd'] }];
    const next = nextPozoRound(current, results);
    expect(next.courts[0]).toEqual(['a', 'b', 'c', 'd']);
  });
});
