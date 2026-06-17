import { describe, it, expect } from 'vitest';
import { buildDisplayContext, standingLabel, buildEscaleraView } from './pozo-view';
import type { PozoMatchRow } from './pozo-run';

describe('buildDisplayContext', () => {
  it('mapea nombres de jugador y etiqueta de pareja', () => {
    const ctx = buildDisplayContext(
      [{ id: 'p1', name: 'Ana' }, { id: 'p2', name: 'Luis' }],
      [{ id: 'pr1', player1Id: 'p1', player2Id: 'p2' }],
    );
    expect(ctx.playerName.get('p1')).toBe('Ana');
    expect(ctx.pairLabel.get('pr1')).toBe('Ana / Luis');
  });
});

describe('standingLabel', () => {
  it('usa nombre de jugador o etiqueta de pareja según el id', () => {
    const ctx = buildDisplayContext(
      [{ id: 'p1', name: 'Ana' }, { id: 'p2', name: 'Luis' }],
      [{ id: 'pr1', player1Id: 'p1', player2Id: 'p2' }],
    );
    expect(standingLabel('p1', ctx)).toBe('Ana');
    expect(standingLabel('pr1', ctx)).toBe('Ana / Luis');
    expect(standingLabel('zzz', ctx)).toBe('—');
  });
});

const pairSlot = (id: string) => JSON.stringify({ type: 'pair', pairId: id });

function fixedPairMatch(over: Partial<PozoMatchRow>): PozoMatchRow {
  return {
    id: 'm', round: 0, phaseTag: 'pozo', status: 'pending',
    courtId: null, scheduledStart: null, scheduledEnd: null,
    slotA1: null, slotA2: null, slotB1: null, slotB2: null,
    teamAScore: null, teamBScore: null, winner: null, ...over,
  };
}

describe('buildEscaleraView', () => {
  const courts = [{ id: 'c0', label: 'Central' }, { id: 'c1', label: 'Pista 2' }];
  // Players named after their IDs so pair labels resolve to "x / y" etc.
  const ctx = buildDisplayContext(
    [
      { id: 'x', name: 'x' }, { id: 'y', name: 'y' },
      { id: 'z', name: 'z' }, { id: 'w', name: 'w' },
      { id: 'm', name: 'm' }, { id: 'n', name: 'n' },
      { id: 'o', name: 'o' }, { id: 'q', name: 'q' },
    ],
    [
      { id: 'p1', player1Id: 'x', player2Id: 'y' },
      { id: 'p2', player1Id: 'z', player2Id: 'w' },
      { id: 'p3', player1Id: 'm', player2Id: 'n' },
      { id: 'p4', player1Id: 'o', player2Id: 'q' },
    ],
  );

  it('ordena carriles por pista (top primero) y marca ganador y miembros', () => {
    const matches: PozoMatchRow[] = [
      fixedPairMatch({ id: 'm1', round: 0, courtId: 'c1', slotA1: pairSlot('p3'), slotB1: pairSlot('p4') }),
      fixedPairMatch({ id: 'm0', round: 0, courtId: 'c0', status: 'completed',
        slotA1: pairSlot('p1'), slotB1: pairSlot('p2'), teamAScore: 6, teamBScore: 3, winner: 'A' }),
    ];
    const v = buildEscaleraView(matches, courts, ctx, ['p1', 'p2', 'p3', 'p4']);
    expect(v.rounds).toEqual([0]);
    expect(v.latestRound).toBe(0);
    const lanes = v.byRound[0].lanes;
    expect(lanes.map((l) => l.courtLabel)).toEqual(['Central', 'Pista 2']); // top primero
    expect(lanes[0].isTop).toBe(true);
    expect(lanes[1].isBottom).toBe(true);
    expect(lanes[0].sideA.members).toEqual([{ entityId: 'p1', label: 'x / y' }]);
    expect(lanes[0].sideA.isWinner).toBe(true);
    expect(lanes[0].sideA.score).toBe(6);
    expect(v.byRound[0].restingLabels).toEqual([]);
  });

  it('lista a los que descansan esa ronda', () => {
    const matches = [fixedPairMatch({ id: 'm0', round: 0, courtId: 'c0', slotA1: pairSlot('p1'), slotB1: pairSlot('p2') })];
    const v = buildEscaleraView(matches, courts, ctx, ['p1', 'p2', 'p3', 'p4']);
    expect(v.byRound[0].restingLabels.sort()).toEqual(['m / n', 'o / q']); // p3, p4 (pair labels)
  });

  it('acumula varias rondas: rounds=[0,1], latestRound=1, byRound[1] con sus carriles', () => {
    const matches: PozoMatchRow[] = [
      fixedPairMatch({ id: 'r0m0', round: 0, courtId: 'c0', slotA1: pairSlot('p1'), slotB1: pairSlot('p2') }),
      fixedPairMatch({ id: 'r0m1', round: 0, courtId: 'c1', slotA1: pairSlot('p3'), slotB1: pairSlot('p4') }),
      fixedPairMatch({ id: 'r1m0', round: 1, courtId: 'c0', slotA1: pairSlot('p2'), slotB1: pairSlot('p3') }),
      fixedPairMatch({ id: 'r1m1', round: 1, courtId: 'c1', slotA1: pairSlot('p1'), slotB1: pairSlot('p4') }),
    ];
    const v = buildEscaleraView(matches, courts, ctx, ['p1', 'p2', 'p3', 'p4']);
    expect(v.rounds).toEqual([0, 1]);
    expect(v.latestRound).toBe(1);
    expect(v.byRound[1]).toBeDefined();
    const lanes1 = v.byRound[1].lanes;
    expect(lanes1.length).toBe(2);
    expect(lanes1.map((l) => l.courtLabel)).toEqual(['Central', 'Pista 2']); // ordenados por pista
  });
});
