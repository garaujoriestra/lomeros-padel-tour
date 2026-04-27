import { describe, it, expect } from 'vitest';
import { recommendSides } from './recommend-sides';
import type { SideStats } from './side-stats';

function emptyStats(): SideStats {
  return {
    drive: { matches: 0, wins: 0, losses: 0, winRate: 0 },
    reves: { matches: 0, wins: 0, losses: 0, winRate: 0 },
  };
}

function statsWith(driveWinRate: number, driveMatches: number, revesWinRate: number, revesMatches: number): SideStats {
  return {
    drive: { matches: driveMatches, wins: Math.round(driveWinRate * driveMatches), losses: driveMatches - Math.round(driveWinRate * driveMatches), winRate: driveWinRate },
    reves: { matches: revesMatches, wins: Math.round(revesWinRate * revesMatches), losses: revesMatches - Math.round(revesWinRate * revesMatches), winRate: revesWinRate },
  };
}

describe('recommendSides', () => {
  it('returns null when neither player has any data', () => {
    const result = recommendSides(
      { id: 'a', sideStats: emptyStats() },
      { id: 'b', sideStats: emptyStats() },
    );
    expect(result).toBeNull();
  });

  it('clearly recommends A on drive when A is much better at drive', () => {
    // A: 80% drive, 50% revés. B: 60% drive, 70% revés.
    // A_drive_sum = 0.8 + 0.7 = 1.5; B_drive_sum = 0.6 + 0.5 = 1.1 → A drive.
    const result = recommendSides(
      { id: 'a', sideStats: statsWith(0.8, 5, 0.5, 5) },
      { id: 'b', sideStats: statsWith(0.6, 5, 0.7, 5) },
    );
    expect(result).toEqual({ driveSidePlayerId: 'a', revesSidePlayerId: 'b' });
  });

  it('clearly recommends B on drive when B is much better at drive', () => {
    const result = recommendSides(
      { id: 'a', sideStats: statsWith(0.4, 5, 0.7, 5) },
      { id: 'b', sideStats: statsWith(0.9, 5, 0.5, 5) },
    );
    expect(result).toEqual({ driveSidePlayerId: 'b', revesSidePlayerId: 'a' });
  });

  it('returns null on exact tie', () => {
    // A: 0.5/0.5; B: 0.5/0.5. Both sums = 1.0 → tie.
    const result = recommendSides(
      { id: 'a', sideStats: statsWith(0.5, 4, 0.5, 4) },
      { id: 'b', sideStats: statsWith(0.5, 4, 0.5, 4) },
    );
    expect(result).toBeNull();
  });

  it('uses 0.5 default for the side with no data of one player', () => {
    // A: 80% drive, 0 revés (defaults to 0.5). B: 0 drive (default 0.5), 70% revés.
    // A_drive_sum = 0.8 + 0.7 = 1.5; B_drive_sum = 0.5 + 0.5 = 1.0 → A drive.
    const result = recommendSides(
      { id: 'a', sideStats: statsWith(0.8, 5, 0, 0) },
      { id: 'b', sideStats: statsWith(0, 0, 0.7, 5) },
    );
    expect(result).toEqual({ driveSidePlayerId: 'a', revesSidePlayerId: 'b' });
  });

  it('still recommends when only one player has any data', () => {
    // A: 80% drive, 30% revés. B: no data (both 0.5).
    // A_drive_sum = 0.8 + 0.5 = 1.3; B_drive_sum = 0.5 + 0.3 = 0.8 → A drive.
    const result = recommendSides(
      { id: 'a', sideStats: statsWith(0.8, 5, 0.3, 5) },
      { id: 'b', sideStats: emptyStats() },
    );
    expect(result).toEqual({ driveSidePlayerId: 'a', revesSidePlayerId: 'b' });
  });
});
