import { describe, it, expect } from 'vitest';
import { recommendPairings, type PlayerSummary } from './recommend-pairs';
import type { SideStats } from './side-stats';

function player(id: string, elo: number): PlayerSummary {
  return { id, name: `Player ${id}`, eloRating: elo, matchesPlayed: 10 };
}

function emptyStats(): SideStats {
  return {
    drive: { matches: 0, wins: 0, losses: 0, winRate: 0 },
    reves: { matches: 0, wins: 0, losses: 0, winRate: 0 },
  };
}

const four: [PlayerSummary, PlayerSummary, PlayerSummary, PlayerSummary] = [
  player('a', 1500),
  player('b', 1500),
  player('c', 1500),
  player('d', 1500),
];

describe('recommendPairings', () => {
  it('returns 3 pairing options with team1SideRec/team2SideRec=null when no sideStats provided', () => {
    const options = recommendPairings(four);
    expect(options).toHaveLength(3);
    for (const opt of options) {
      expect(opt.team1SideRec).toBeNull();
      expect(opt.team2SideRec).toBeNull();
    }
  });

  it('returns null side recs when sideStatsByPlayer has no data for any of the 4 players', () => {
    const sideStatsByPlayer: Record<string, SideStats> = {
      a: emptyStats(), b: emptyStats(), c: emptyStats(), d: emptyStats(),
    };
    const options = recommendPairings(four, sideStatsByPlayer);
    for (const opt of options) {
      expect(opt.team1SideRec).toBeNull();
      expect(opt.team2SideRec).toBeNull();
    }
  });

  it('returns concrete side recommendations when at least one player in each team has data', () => {
    // a: 80% drive, 50% revés. b: 60% drive, 70% revés. c & d: empty.
    // For a team containing a+b: a should be on drive (sum 1.5 > 1.1).
    const sideStatsByPlayer: Record<string, SideStats> = {
      a: {
        drive: { matches: 5, wins: 4, losses: 1, winRate: 0.8 },
        reves: { matches: 5, wins: 2, losses: 3, winRate: 0.5 },
      },
      b: {
        drive: { matches: 5, wins: 3, losses: 2, winRate: 0.6 },
        reves: { matches: 5, wins: 3, losses: 2, winRate: 0.7 },
      },
      c: emptyStats(),
      d: emptyStats(),
    };
    const options = recommendPairings(four, sideStatsByPlayer);
    expect(options).toHaveLength(3);

    // Find the option where team1 OR team2 contains both a and b
    const opt = options.find((o) =>
      (o.team1.some((p) => p.id === 'a') && o.team1.some((p) => p.id === 'b')) ||
      (o.team2.some((p) => p.id === 'a') && o.team2.some((p) => p.id === 'b'))
    );
    expect(opt).toBeDefined();

    // The team containing a+b should have a side rec with a on drive.
    const teamWithAB = opt!.team1.some((p) => p.id === 'a') ? opt!.team1SideRec : opt!.team2SideRec;
    expect(teamWithAB).toEqual({ driveSidePlayerId: 'a', revesSidePlayerId: 'b' });
  });
});
