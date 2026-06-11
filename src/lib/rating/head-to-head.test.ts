import { describe, it, expect } from 'vitest';
import { computeAllRivalries, type MatchForRivalry } from './head-to-head';

const players = [
  { id: 'p1', name: 'Alice', avatarUrl: null },
  { id: 'p2', name: 'Bob', avatarUrl: null },
  { id: 'p3', name: 'Carol', avatarUrl: null },
  { id: 'p4', name: 'Dave', avatarUrl: null },
  { id: 'p5', name: 'Eve', avatarUrl: null },
];

function makeMatch(overrides: Partial<MatchForRivalry>): MatchForRivalry {
  return {
    team1Player1Id: 'p1',
    team1Player2Id: 'p2',
    team2Player1Id: 'p3',
    team2Player2Id: 'p4',
    winnerTeam: 1,
    ...overrides,
  };
}

describe('computeAllRivalries', () => {
  it('returns empty array for empty matches', () => {
    expect(computeAllRivalries('p1', [], players)).toEqual([]);
  });

  it('returns empty array when player did not play any match', () => {
    const matches = [
      makeMatch({ team1Player1Id: 'p2', team2Player1Id: 'p3' }),
    ];
    expect(computeAllRivalries('p99', matches, players)).toEqual([]);
  });

  it('does not count teammates as rivals', () => {
    const matches: MatchForRivalry[] = [
      {
        team1Player1Id: 'p1', team1Player2Id: 'p2',
        team2Player1Id: 'p3', team2Player2Id: 'p4',
        winnerTeam: 1,
      },
    ];
    const result = computeAllRivalries('p1', matches, players);
    expect(result.find((r) => r.opponentId === 'p2')).toBeUndefined();
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.opponentId).sort()).toEqual(['p3', 'p4']);
  });

  it('counts a single win against a single rival correctly', () => {
    const matches = [
      makeMatch({
        team1Player1Id: 'p1', team1Player2Id: 'p2',
        team2Player1Id: 'p3', team2Player2Id: 'p4',
        winnerTeam: 1,
      }),
    ];
    const result = computeAllRivalries('p1', matches, players);
    const vsP3 = result.find((r) => r.opponentId === 'p3');
    expect(vsP3).toEqual({
      opponentId: 'p3',
      opponentName: 'Carol',
      opponentAvatarUrl: null,
      matches: 1,
      wins: 1,
      losses: 0,
      winRate: 1,
    });
  });

  it('counts a single loss against a rival correctly', () => {
    const matches = [
      makeMatch({
        team1Player1Id: 'p1', team1Player2Id: 'p2',
        team2Player1Id: 'p3', team2Player2Id: 'p4',
        winnerTeam: 2,
      }),
    ];
    const result = computeAllRivalries('p1', matches, players);
    const vsP3 = result.find((r) => r.opponentId === 'p3');
    expect(vsP3).toEqual({
      opponentId: 'p3',
      opponentName: 'Carol',
      opponentAvatarUrl: null,
      matches: 1,
      wins: 0,
      losses: 1,
      winRate: 0,
    });
  });

  it('aggregates multiple matches against the same rival', () => {
    const matches = [
      makeMatch({ team1Player1Id: 'p1', team2Player1Id: 'p3', winnerTeam: 1 }),
      makeMatch({ team1Player1Id: 'p1', team2Player1Id: 'p3', winnerTeam: 2 }),
      makeMatch({ team1Player1Id: 'p1', team2Player1Id: 'p3', winnerTeam: 1 }),
    ];
    const result = computeAllRivalries('p1', matches, players);
    const vsP3 = result.find((r) => r.opponentId === 'p3');
    expect(vsP3?.matches).toBe(3);
    expect(vsP3?.wins).toBe(2);
    expect(vsP3?.losses).toBe(1);
    expect(vsP3?.winRate).toBeCloseTo(2 / 3, 5);
  });

  it('sorts rivalries by matches played DESC, then by name ASC for ties', () => {
    // Setup so that p4 plays opposing 4 times, p3 = 3, p5 = 1, p2 never (always teammate).
    const matches: MatchForRivalry[] = [
      { team1Player1Id: 'p1', team1Player2Id: 'p2', team2Player1Id: 'p3', team2Player2Id: 'p4', winnerTeam: 1 },
      { team1Player1Id: 'p1', team1Player2Id: 'p2', team2Player1Id: 'p3', team2Player2Id: 'p4', winnerTeam: 2 },
      { team1Player1Id: 'p1', team1Player2Id: 'p2', team2Player1Id: 'p3', team2Player2Id: 'p4', winnerTeam: 1 },
      { team1Player1Id: 'p1', team1Player2Id: 'p2', team2Player1Id: 'p5', team2Player2Id: 'p4', winnerTeam: 1 },
    ];
    const result = computeAllRivalries('p1', matches, players);
    expect(result.map((r) => r.opponentId)).toEqual(['p4', 'p3', 'p5']);
    expect(result.find((r) => r.opponentId === 'p2')).toBeUndefined();
  });

  it('ignores matches where winnerTeam is null (scheduled)', () => {
    const matches = [
      makeMatch({ winnerTeam: null }),
    ];
    const result = computeAllRivalries('p1', matches, players);
    expect(result).toEqual([]);
  });
});
