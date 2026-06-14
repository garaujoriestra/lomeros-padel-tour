import { describe, it, expect } from 'vitest';
import { layoutPozo, qualifierSeeds, layoutGroups, layoutBracket } from './generate';
import type { GenPozoBlock, GenCourt, GenFixedPairsBlock } from './generate';

const courts: GenCourt[] = [
  { courtId: 'c1', order: 1, fromMin: 17 * 60, toMin: 20 * 60 },
  { courtId: 'c2', order: 2, fromMin: 17 * 60, toMin: 20 * 60 },
];

describe('layoutPozo', () => {
  it('ronda 0 concreta + rondas siguientes con huecos null, una franja por ronda y pista', () => {
    const block: GenPozoBlock = {
      blockId: 'b1', type: 'pozo', startMin: 17 * 60, durationMinutes: 45,
      matchFormat: { kind: 'timed', minutes: 15, tieRule: 'golden_point' }, bufferMinutes: 0,
      roundMinutes: 15, participantIds: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'],
    };
    const matches = layoutPozo(block, courts);
    // 8 jugadores -> 2 pistas; 45/15 = 3 rondas -> 2 pistas * 3 rondas = 6 partidos
    expect(matches).toHaveLength(6);

    // Ronda 0, pista 1 (order 1 -> c1): seedPozoCourts pone [p1,p2,p3,p4] en pista 0;
    // courtPairing ronda 0 -> (p1,p2) vs (p3,p4).
    const r0c1 = matches.find((m) => m.round === 0 && m.courtId === 'c1')!;
    expect(r0c1).toMatchObject({
      blockId: 'b1', phaseTag: 'pozo', round: 0, startMin: 17 * 60, endMin: 17 * 60 + 15,
      slotA1: { type: 'participant', participantId: 'p1' },
      slotA2: { type: 'participant', participantId: 'p2' },
      slotB1: { type: 'participant', participantId: 'p3' },
      slotB2: { type: 'participant', participantId: 'p4' },
    });

    // Ronda 1: huecos a null, hora corrida.
    const r1c1 = matches.find((m) => m.round === 1 && m.courtId === 'c1')!;
    expect(r1c1).toMatchObject({ startMin: 17 * 60 + 15, endMin: 17 * 60 + 30, slotA1: null, slotB1: null });
  });
});

describe('qualifierSeeds', () => {
  it('intercala posiciones por grupo: 1º de cada grupo, luego 2º de cada grupo', () => {
    const groups = [
      { groupId: 'g1', name: 'A', pairIds: ['a1', 'a2', 'a3'] },
      { groupId: 'g2', name: 'B', pairIds: ['b1', 'b2', 'b3'] },
    ];
    expect(qualifierSeeds(groups, 2)).toEqual([
      { type: 'placeholder', desc: '1º A' },
      { type: 'placeholder', desc: '1º B' },
      { type: 'placeholder', desc: '2º A' },
      { type: 'placeholder', desc: '2º B' },
    ]);
  });
});

describe('layoutGroups', () => {
  it('reparte la liguilla en pistas sin solapar parejas y reporta el fin de fase', () => {
    const block: GenFixedPairsBlock = {
      blockId: 'b2', type: 'fixed_pairs', startMin: 17 * 60, durationMinutes: 120,
      matchFormat: { kind: 'timed', minutes: 20, tieRule: 'golden_point' }, bufferMinutes: 0,
      groups: [{ groupId: 'g1', name: 'A', pairIds: ['pa', 'pb', 'pc', 'pd'] }],
      knockout: false, advancePerGroup: 2, knockoutSeeds: [],
    };
    const res = layoutGroups(block, courts);
    // Round-robin de 4 parejas = 6 partidos.
    expect(res.matches).toHaveLength(6);
    expect(res.matches.every((m) => m.phaseTag === 'group:A')).toBe(true);
    expect(res.warnings).toEqual([]);
    // Todos quedan planificados (con courtId y hora) en 120 min con 2 pistas y slots de 20.
    expect(res.matches.every((m) => m.courtId !== null && m.startMin !== null)).toBe(true);
    // endMin = mayor endMin de los partidos planificados.
    const maxEnd = Math.max(...res.matches.map((m) => m.endMin!));
    expect(res.endMin).toBe(maxEnd);
    // Cada partido enfrenta dos parejas concretas (slotA1/slotB1 son pares; A2/B2 null).
    const m0 = res.matches[0];
    expect(m0.slotA1).toMatchObject({ type: 'pair' });
    expect(m0.slotA2).toBeNull();
  });

  it('avisa de los partidos que no caben en la ventana', () => {
    const block: GenFixedPairsBlock = {
      blockId: 'b3', type: 'fixed_pairs', startMin: 17 * 60, durationMinutes: 20, // solo 1 slot por pista
      matchFormat: { kind: 'timed', minutes: 20, tieRule: 'golden_point' }, bufferMinutes: 0,
      groups: [{ groupId: 'g1', name: 'A', pairIds: ['pa', 'pb', 'pc', 'pd'] }],
      knockout: false, advancePerGroup: 2, knockoutSeeds: [],
    };
    const res = layoutGroups(block, courts);
    expect(res.warnings.length).toBeGreaterThan(0);
    expect(res.warnings[0]).toContain('no caben');
  });

  it('sin grupos: vacío y endMin = inicio del bloque', () => {
    const block: GenFixedPairsBlock = {
      blockId: 'b4', type: 'fixed_pairs', startMin: 17 * 60, durationMinutes: 60,
      matchFormat: { kind: 'best_of_3' }, bufferMinutes: 0,
      groups: [], knockout: true, advancePerGroup: 0, knockoutSeeds: ['x', 'y'],
    };
    const res = layoutGroups(block, courts);
    expect(res.matches).toEqual([]);
    expect(res.endMin).toBe(17 * 60);
  });
});

describe('layoutBracket', () => {
  const block: GenFixedPairsBlock = {
    blockId: 'b5', type: 'fixed_pairs', startMin: 18 * 60, durationMinutes: 120,
    matchFormat: { kind: 'timed', minutes: 30, tieRule: 'golden_point' }, bufferMinutes: 0,
    groups: [], knockout: true, advancePerGroup: 0, knockoutSeeds: ['A', 'B', 'C', 'D'],
  };

  it('4 parejas: ronda 0 (2 partidos en paralelo) y luego la final, en franjas consecutivas', () => {
    const leaves: import('./types').SlotRef[] = block.knockoutSeeds.map((pairId) => ({ type: 'pair', pairId }));
    const res = layoutBracket(leaves, block, courts, block.startMin);
    expect(res.warnings).toEqual([]);
    expect(res.matches).toHaveLength(3); // 2 de ronda 0 + 1 final

    const r0 = res.matches.filter((m) => m.round === 0);
    expect(r0).toHaveLength(2);
    // Ronda 0 en paralelo: ambos a las 18:00, en pistas distintas.
    expect(r0.every((m) => m.startMin === 18 * 60)).toBe(true);
    expect(new Set(r0.map((m) => m.courtId)).size).toBe(2);
    expect(r0.every((m) => m.phaseTag === 'ko:r0')).toBe(true);

    // La final empieza después de la ronda 0 (18:30).
    const final = res.matches.find((m) => m.round === 1)!;
    expect(final.startMin).toBe(18 * 60 + 30);
    expect(final.phaseTag).toBe('ko:r1');
    expect(final.slotA1).toEqual({ type: 'matchWinner', matchId: 'r0m0' });
  });

  it('avisa si el cuadro se sale del tiempo del bloque', () => {
    const tight: GenFixedPairsBlock = { ...block, durationMinutes: 30 }; // solo cabe 1 franja
    const leaves: import('./types').SlotRef[] = ['A', 'B', 'C', 'D'].map((pairId) => ({ type: 'pair', pairId }));
    const res = layoutBracket(leaves, tight, courts, tight.startMin);
    expect(res.warnings.length).toBeGreaterThan(0);
    expect(res.warnings[0]).toContain('cuadro');
  });
});
