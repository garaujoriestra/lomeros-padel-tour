import { describe, it, expect } from 'vitest';
import { buildDisplayContext, buildPozoGrid, standingLabel } from './pozo-view';
import type { PozoMatchRow } from './pozo-run';

function row(partial: Partial<PozoMatchRow>): PozoMatchRow {
  return {
    id: 'm', round: 0, phaseTag: 'pozo', status: 'pending', courtId: 'c1',
    scheduledStart: '17:00', scheduledEnd: '17:15',
    slotA1: null, slotA2: null, slotB1: null, slotB2: null,
    teamAScore: null, teamBScore: null, winner: null, ...partial,
  };
}
const part = (id: string) => JSON.stringify({ type: 'participant', participantId: id });

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

describe('buildPozoGrid', () => {
  const ctx = buildDisplayContext(
    [{ id: 'p1', name: 'Ana' }, { id: 'p2', name: 'Luis' }, { id: 'p3', name: 'Eva' }, { id: 'p4', name: 'Jon' }],
    [],
  );
  it('coloca cada partido en su fila (pista) y columna (ronda) y etiqueta los equipos', () => {
    const matches: PozoMatchRow[] = [
      row({ id: 'a', round: 0, courtId: 'c1', slotA1: part('p1'), slotA2: part('p2'), slotB1: part('p3'), slotB2: part('p4') }),
      row({ id: 'b', round: 1, courtId: 'c1', status: 'pending', slotA1: part('p1'), slotA2: part('p2'), slotB1: part('p3'), slotB2: part('p4') }),
    ];
    const grid = buildPozoGrid(matches, [{ id: 'c1', label: 'Central' }, { id: 'c2', label: 'Pista 2' }], ctx);
    expect(grid.rounds).toEqual([0, 1]);
    expect(grid.rows.length).toBe(2);
    const c1 = grid.rows.find((r) => r.court.id === 'c1')!;
    expect(c1.cells[0]?.teamA).toBe('Ana / Luis');
    expect(c1.cells[0]?.playable).toBe(true);
    expect(c1.cells[1]?.matchId).toBe('b');
    const c2 = grid.rows.find((r) => r.court.id === 'c2')!;
    expect(c2.cells[0]).toBeNull(); // c2 no tiene partido en la ronda 0
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
