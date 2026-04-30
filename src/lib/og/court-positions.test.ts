import { describe, it, expect } from 'vitest';
import { resolveCourtPositions } from './court-positions';

describe('resolveCourtPositions', () => {
  it('places team1 revés top-left and drive bottom-left when sides are set', () => {
    const result = resolveCourtPositions({
      team1: { p1Id: 'a', p2Id: 'b', p1Side: 'drive', p2Side: 'reves' },
      team2: { p1Id: 'c', p2Id: 'd', p1Side: 'reves', p2Side: 'drive' },
    });
    expect(result.topLeft).toEqual({ playerId: 'b', label: 'R' });
    expect(result.bottomLeft).toEqual({ playerId: 'a', label: 'D' });
  });

  it('places team2 drive top-right and revés bottom-right when sides are set', () => {
    const result = resolveCourtPositions({
      team1: { p1Id: 'a', p2Id: 'b', p1Side: 'drive', p2Side: 'reves' },
      team2: { p1Id: 'c', p2Id: 'd', p1Side: 'reves', p2Side: 'drive' },
    });
    expect(result.topRight).toEqual({ playerId: 'd', label: 'D' });
    expect(result.bottomRight).toEqual({ playerId: 'c', label: 'R' });
  });

  it('handles team1 with p1=revés, p2=drive (revés stays top)', () => {
    const result = resolveCourtPositions({
      team1: { p1Id: 'a', p2Id: 'b', p1Side: 'reves', p2Side: 'drive' },
      team2: { p1Id: 'c', p2Id: 'd', p1Side: 'drive', p2Side: 'reves' },
    });
    expect(result.topLeft).toEqual({ playerId: 'a', label: 'R' });
    expect(result.bottomLeft).toEqual({ playerId: 'b', label: 'D' });
  });

  it('handles team2 with p1=drive, p2=revés (drive stays top)', () => {
    const result = resolveCourtPositions({
      team1: { p1Id: 'a', p2Id: 'b', p1Side: 'drive', p2Side: 'reves' },
      team2: { p1Id: 'c', p2Id: 'd', p1Side: 'drive', p2Side: 'reves' },
    });
    expect(result.topRight).toEqual({ playerId: 'c', label: 'D' });
    expect(result.bottomRight).toEqual({ playerId: 'd', label: 'R' });
  });

  it('falls back to p1 top, p2 bottom (no labels) when team1 sides are null', () => {
    const result = resolveCourtPositions({
      team1: { p1Id: 'a', p2Id: 'b', p1Side: null, p2Side: null },
      team2: { p1Id: 'c', p2Id: 'd', p1Side: 'reves', p2Side: 'drive' },
    });
    expect(result.topLeft).toEqual({ playerId: 'a', label: null });
    expect(result.bottomLeft).toEqual({ playerId: 'b', label: null });
    expect(result.topRight).toEqual({ playerId: 'd', label: 'D' });
    expect(result.bottomRight).toEqual({ playerId: 'c', label: 'R' });
  });

  it('falls back when only one side is set in a team (treats as missing)', () => {
    const result = resolveCourtPositions({
      team1: { p1Id: 'a', p2Id: 'b', p1Side: 'drive', p2Side: null },
      team2: { p1Id: 'c', p2Id: 'd', p1Side: 'reves', p2Side: 'drive' },
    });
    expect(result.topLeft).toEqual({ playerId: 'a', label: null });
    expect(result.bottomLeft).toEqual({ playerId: 'b', label: null });
  });

  it('falls back when sides are an invalid string', () => {
    const result = resolveCourtPositions({
      team1: { p1Id: 'a', p2Id: 'b', p1Side: 'left', p2Side: 'right' },
      team2: { p1Id: 'c', p2Id: 'd', p1Side: null, p2Side: null },
    });
    expect(result.topLeft).toEqual({ playerId: 'a', label: null });
    expect(result.bottomLeft).toEqual({ playerId: 'b', label: null });
  });
});
