import { describe, it, expect } from 'vitest';
import { layoutPozo, qualifierSeeds } from './generate';
import type { GenPozoBlock, GenCourt } from './generate';

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
