import { describe, it, expect } from 'vitest';
import { seedPozoCourts, courtPairing, nextPozoRound, nextPozoRoundWithRest, pozoStandings } from './pozo';
import type { CourtResult, PozoMatchResult } from './pozo';

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

describe('nextPozoRoundWithRest (rotación de descansos)', () => {
  it('mete a los que descansaban por el fondo y manda a descansar a los perdedores del fondo', () => {
    const current = {
      courts: [
        ['a', 'b', 'c', 'd'], // top
        ['e', 'f', 'g', 'h'], // fondo
      ],
      resting: ['x', 'y'],
    };
    const results: CourtResult[] = [
      { winners: ['a', 'b'], losers: ['c', 'd'] },
      { winners: ['e', 'f'], losers: ['g', 'h'] }, // g,h son perdedores del fondo
    ];
    const next = nextPozoRoundWithRest(current, results);
    // Tras el movimiento puro, el fondo sería [g,h, <stayers fondo>]; aquí los stayers del
    // fondo (perdedores) son g,h. Entran x,y y descansan g,h.
    expect(next.resting).toEqual(['g', 'h']);
    // El fondo ya no contiene a g,h; contiene a x,y en su lugar.
    expect(next.courts[next.courts.length - 1]).not.toContain('g');
    expect(next.courts[next.courts.length - 1]).not.toContain('h');
    expect(next.courts[next.courts.length - 1]).toContain('x');
    expect(next.courts[next.courts.length - 1]).toContain('y');
    // Cada pista mantiene 4.
    next.courts.forEach((c) => expect(c).toHaveLength(4));
  });

  it('sin descansos, se comporta como nextPozoRound', () => {
    const current = { courts: [['a', 'b', 'c', 'd']], resting: [] as string[] };
    const results: CourtResult[] = [{ winners: ['a', 'b'], losers: ['c', 'd'] }];
    expect(nextPozoRoundWithRest(current, results)).toEqual({ courts: [['a', 'b', 'c', 'd']], resting: [] });
  });
});

describe('pozoStandings', () => {
  it('ordena por juegos ganados, desempata por victorias', () => {
    const results: PozoMatchResult[] = [
      // ronda 1, pista 1: (a,b) 6 - 2 (c,d) → ganan a,b
      { teamA: ['a', 'b'], teamB: ['c', 'd'], gamesA: 6, gamesB: 2, winner: 'A' },
      // ronda 2, pista 1: (a,c) 4 - 6 (b,d) → ganan b,d
      { teamA: ['a', 'c'], teamB: ['b', 'd'], gamesA: 4, gamesB: 6, winner: 'B' },
    ];
    const table = pozoStandings(['a', 'b', 'c', 'd'], results);
    // juegos: a=6+4=10, b=6+6=12, c=2+4=6, d=2+6=8
    // victorias: a=1, b=2, c=0, d=1
    expect(table.map((r) => r.participantId)).toEqual(['b', 'a', 'd', 'c']);
    expect(table[0]).toMatchObject({ participantId: 'b', games: 12, wins: 2, rank: 1 });
    expect(table[3]).toMatchObject({ participantId: 'c', games: 6, wins: 0, rank: 4 });
  });
});
