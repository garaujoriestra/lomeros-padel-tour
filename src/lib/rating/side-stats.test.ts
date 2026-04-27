import { describe, it, expect } from 'vitest';
import { computeSideStats, type MatchWithSide } from './side-stats';

function makeMatch(overrides: Partial<MatchWithSide>): MatchWithSide {
  return {
    team1Player1Id: 'p1',
    team1Player2Id: 'p2',
    team2Player1Id: 'p3',
    team2Player2Id: 'p4',
    team1Player1Side: null,
    team1Player2Side: null,
    team2Player1Side: null,
    team2Player2Side: null,
    winnerTeam: 1,
    ...overrides,
  };
}

describe('computeSideStats', () => {
  it('returns zero stats for empty matches array', () => {
    const stats = computeSideStats('p1', []);
    expect(stats.drive).toEqual({ matches: 0, wins: 0, losses: 0, winRate: 0 });
    expect(stats.reves).toEqual({ matches: 0, wins: 0, losses: 0, winRate: 0 });
  });

  it('counts only matches where player participated', () => {
    const matches = [
      makeMatch({ team1Player1Id: 'p1', team1Player1Side: 'drive', winnerTeam: 1 }),
      makeMatch({ team1Player1Id: 'pX', team1Player1Side: 'drive', winnerTeam: 1 }), // p1 not in this one
    ];
    const stats = computeSideStats('p1', matches);
    expect(stats.drive.matches).toBe(1);
  });

  it('ignores matches where the player has no recorded side', () => {
    const matches = [
      makeMatch({ team1Player1Id: 'p1', team1Player1Side: null, winnerTeam: 1 }),
    ];
    const stats = computeSideStats('p1', matches);
    expect(stats.drive.matches).toBe(0);
    expect(stats.reves.matches).toBe(0);
  });

  it('ignores matches where winnerTeam is null (not completed)', () => {
    const matches = [
      makeMatch({ team1Player1Id: 'p1', team1Player1Side: 'drive', winnerTeam: null }),
    ];
    expect(computeSideStats('p1', matches).drive.matches).toBe(0);
  });

  it('counts a win on drive correctly when player is in team1Player1', () => {
    const matches = [
      makeMatch({ team1Player1Id: 'p1', team1Player1Side: 'drive', winnerTeam: 1 }),
    ];
    const stats = computeSideStats('p1', matches);
    expect(stats.drive).toEqual({ matches: 1, wins: 1, losses: 0, winRate: 1 });
    expect(stats.reves.matches).toBe(0);
  });

  it('counts a loss on revés correctly when player is in team2Player2', () => {
    const matches = [
      makeMatch({ team2Player2Id: 'p1', team2Player2Side: 'reves', winnerTeam: 1 }),
    ];
    const stats = computeSideStats('p1', matches);
    expect(stats.reves).toEqual({ matches: 1, wins: 0, losses: 1, winRate: 0 });
  });

  it('aggregates multiple matches across both sides', () => {
    const matches = [
      makeMatch({ team1Player1Id: 'p1', team1Player1Side: 'drive', winnerTeam: 1 }), // win drive
      makeMatch({ team1Player1Id: 'p1', team1Player1Side: 'drive', winnerTeam: 2 }), // loss drive
      makeMatch({ team1Player1Id: 'p1', team1Player1Side: 'drive', winnerTeam: 1 }), // win drive
      makeMatch({ team2Player1Id: 'p1', team2Player1Side: 'reves', winnerTeam: 2 }), // win revés
    ];
    const stats = computeSideStats('p1', matches);
    expect(stats.drive).toEqual({ matches: 3, wins: 2, losses: 1, winRate: 2 / 3 });
    expect(stats.reves).toEqual({ matches: 1, wins: 1, losses: 0, winRate: 1 });
  });
});
