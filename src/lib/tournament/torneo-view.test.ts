import { describe, it, expect } from 'vitest';
import { buildDisplayContext } from './pozo-view';
import { buildGroupsView, buildBracketView, torneoNextMatch, seedLabelByPair } from './torneo-view';
import type { PozoMatchRow } from './pozo-run';

function row(p: Partial<PozoMatchRow>): PozoMatchRow {
  return {
    id: 'm', round: 0, phaseTag: 'ko:r0m0', status: 'pending', courtId: 'c1',
    scheduledStart: '17:00', scheduledEnd: '17:40',
    slotA1: null, slotA2: null, slotB1: null, slotB2: null,
    teamAScore: null, teamBScore: null, winner: null, ...p,
  };
}
const pairSlot = (id: string) => JSON.stringify({ type: 'pair', pairId: id });
const winnerSlot = (mid: string) => JSON.stringify({ type: 'matchWinner', matchId: mid });

const ctx = buildDisplayContext(
  [{ id: 'pA1', name: 'Ana' }, { id: 'pA2', name: 'Luis' }, { id: 'pB1', name: 'Eva' }, { id: 'pB2', name: 'Jon' }],
  [
    { id: 'prA', player1Id: 'pA1', player2Id: 'pA2' },
    { id: 'prB', player1Id: 'pB1', player2Id: 'pB2' },
  ],
);
const courtLabelById = new Map([['c1', 'Central']]);

describe('buildGroupsView', () => {
  it('arma standings por grupo y celdas de partido', () => {
    const groups = [{ id: 'gA', name: 'A' }];
    const pairs = [
      { id: 'prA', player1Id: 'pA1', player2Id: 'pA2', groupId: 'gA' },
      { id: 'prB', player1Id: 'pB1', player2Id: 'pB2', groupId: 'gA' },
    ];
    const matches: PozoMatchRow[] = [
      row({ id: 'gm', phaseTag: 'group:A', round: 0, status: 'completed', slotA1: pairSlot('prA'), slotB1: pairSlot('prB'), teamAScore: 6, teamBScore: 3, winner: 'A' }),
    ];
    const view = buildGroupsView(groups, pairs, matches, ctx, courtLabelById);
    expect(view.length).toBe(1);
    expect(view[0].name).toBe('A');
    expect(view[0].standings[0].pairId).toBe('prA');
    expect(view[0].standings[0].points).toBe(3);
    expect(view[0].matches[0].teamA).toBe('Ana / Luis');
    expect(view[0].matches[0].status).toBe('completed');
  });
});

describe('buildBracketView', () => {
  it('resuelve matchWinner → pareja concreta y agrupa por ronda', () => {
    const matches: PozoMatchRow[] = [
      row({ id: 's0', phaseTag: 'ko:r0m0', round: 0, status: 'completed', slotA1: pairSlot('prA'), slotB1: pairSlot('prB'), teamAScore: 2, teamBScore: 1, winner: 'A' }),
      row({ id: 'f0', phaseTag: 'ko:r1m0', round: 1, status: 'pending', slotA1: winnerSlot('r0m0'), slotB1: winnerSlot('r0m1') }),
    ];
    const bracket = buildBracketView(matches, ctx, courtLabelById);
    expect(bracket.rounds.map((r) => r.round)).toEqual([0, 1]);
    const final = bracket.rounds.find((r) => r.round === 1)!.matches[0];
    expect(final.teamA).toBe('Ana / Luis');
    expect(final.teamB).toBe('Ganador (pdte.)');
    expect(final.playable).toBe(false);
  });
});

const byeSlot = () => JSON.stringify({ type: 'bye' });

describe('MatchCell aditivos (isBye, teamAId/teamBId)', () => {
  it('expone pairId por lado y marca isBye=false en partido normal', () => {
    const matches: PozoMatchRow[] = [
      row({ id: 's0', phaseTag: 'ko:r0m0', round: 0, status: 'pending', slotA1: pairSlot('prA'), slotB1: pairSlot('prB') }),
    ];
    const bracket = buildBracketView(matches, ctx, courtLabelById);
    const cell = bracket.rounds.find((r) => r.round === 0)!.matches[0];
    expect(cell.teamAId).toBe('prA');
    expect(cell.teamBId).toBe('prB');
    expect(cell.isBye).toBe(false);
  });

  it('marca isBye=true cuando un lado es bye y deja su pairId en null', () => {
    const matches: PozoMatchRow[] = [
      row({ id: 's0', phaseTag: 'ko:r0m0', round: 0, status: 'pending', slotA1: pairSlot('prA'), slotB1: byeSlot() }),
    ];
    const bracket = buildBracketView(matches, ctx, courtLabelById);
    const cell = bracket.rounds.find((r) => r.round === 0)!.matches[0];
    expect(cell.teamAId).toBe('prA');
    expect(cell.teamBId).toBeNull();
    expect(cell.isBye).toBe(true);
  });
});

describe('seedLabelByPair', () => {
  it('etiqueta cada pareja con "<rank>º <grupo>"', () => {
    const groups = [
      { name: 'A', standings: [
        { pairId: 'pa1', label: 'A1', played: 2, wins: 2, draws: 0, losses: 0, gameDiff: 6, points: 6, rank: 1 },
        { pairId: 'pa2', label: 'A2', played: 2, wins: 0, draws: 0, losses: 2, gameDiff: -6, points: 0, rank: 2 },
      ], matches: [] },
      { name: 'B', standings: [
        { pairId: 'pb1', label: 'B1', played: 2, wins: 2, draws: 0, losses: 0, gameDiff: 6, points: 6, rank: 1 },
        { pairId: 'pb2', label: 'B2', played: 2, wins: 0, draws: 0, losses: 2, gameDiff: -6, points: 0, rank: 2 },
      ], matches: [] },
    ];
    const m = seedLabelByPair(groups);
    expect(m.get('pa1')).toBe('1º A');
    expect(m.get('pb2')).toBe('2º B');
    expect(m.get('desconocida')).toBeUndefined();
  });
});

describe('torneoNextMatch', () => {
  it('devuelve el próximo partido pendiente del jugador (por su pareja)', () => {
    const matches: PozoMatchRow[] = [
      row({ id: 's0', phaseTag: 'ko:r0m0', round: 0, status: 'pending', slotA1: pairSlot('prA'), slotB1: pairSlot('prB') }),
    ];
    const next = torneoNextMatch(matches, ctx, courtLabelById, 'pA1', ['prA']);
    expect(next).not.toBeNull();
    expect(next!.teamA).toBe('Ana / Luis');
    expect(next!.courtLabel).toBe('Central');
  });
});
