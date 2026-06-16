import { describe, it, expect } from 'vitest';
import { seedPozoPairsCourts, nextPozoPairsRound, type PairsRound, type PairCourtResult } from './pozo-pairs';

describe('seedPozoPairsCourts', () => {
  it('coloca 2 parejas por pista en orden; sobrantes descansan', () => {
    const r = seedPozoPairsCourts(['A', 'B', 'C', 'D', 'E'], 2);
    expect(r.courts).toEqual([['A', 'B'], ['C', 'D']]);
    expect(r.resting).toEqual(['E']);
  });
  it('no crea pistas a medias: con 3 parejas y 2 pistas, 1 pista + 1 descansa', () => {
    const r = seedPozoPairsCourts(['A', 'B', 'C'], 2);
    expect(r.courts).toEqual([['A', 'B']]);
    expect(r.resting).toEqual(['C']);
  });
});

describe('nextPozoPairsRound', () => {
  it('sube ganadores y baja perdedores; top y fondo retienen', () => {
    // 3 pistas: [A,B] [C,D] [E,F]. Ganan: A (top), D (media), E (fondo).
    const current: PairsRound = { courts: [['A', 'B'], ['C', 'D'], ['E', 'F']], resting: [] };
    const results: PairCourtResult[] = [
      { winner: 'A', loser: 'B' },
      { winner: 'D', loser: 'C' },
      { winner: 'E', loser: 'F' },
    ];
    const next = nextPozoPairsRound(current, results);
    // Top: gana A (retiene) + sube D desde la media → [A, D]
    // Media: baja B desde top + sube E desde fondo → [B, E]
    // Fondo: baja C desde media + pierde F (retiene) → [C, F]
    expect(next.courts).toEqual([['A', 'D'], ['B', 'E'], ['C', 'F']]);
  });

  it('rota descansos: el que descansaba entra por el fondo', () => {
    const current: PairsRound = { courts: [['A', 'B'], ['C', 'D']], resting: ['E'] };
    const results: PairCourtResult[] = [
      { winner: 'A', loser: 'B' },
      { winner: 'C', loser: 'D' },
    ];
    const next = nextPozoPairsRound(current, results);
    // Top: A retiene + sube C → [A, C]
    // Fondo: baja B + (D sería retención del fondo) ... con descanso: la última posición del fondo sale a descansar y entra E.
    // Fondo base (sin descanso) = [B, D]; sale D a descansar, entra E → [B, E]; descansa D.
    expect(next.courts[0]).toEqual(['A', 'C']);
    expect(next.courts[1]).toEqual(['B', 'E']);
    expect(next.resting).toEqual(['D']);
  });

  it('una sola pista: el ganador y el perdedor se retienen (no-op de movimiento)', () => {
    const current: PairsRound = { courts: [['A', 'B']], resting: [] };
    const next = nextPozoPairsRound(current, [{ winner: 'A', loser: 'B' }]);
    expect(next.courts).toEqual([['A', 'B']]);
    expect(next.resting).toEqual([]);
  });

  it('falla ruidosamente si descansan más parejas que el tamaño de pista', () => {
    // 6 parejas, 2 pistas → 4 juegan, 2 descansan: restCount(2) == fondo(2), OK.
    // Forzamos el caso inválido: 3 descansando con fondo de 2.
    const current: PairsRound = { courts: [['A', 'B'], ['C', 'D']], resting: ['E', 'F', 'G'] };
    const results: PairCourtResult[] = [
      { winner: 'A', loser: 'B' },
      { winner: 'C', loser: 'D' },
    ];
    expect(() => nextPozoPairsRound(current, results)).toThrow(/descansan/);
  });
});
