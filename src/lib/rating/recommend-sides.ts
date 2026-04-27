import type { SideStats } from './side-stats';

export interface SideRecommendation {
  driveSidePlayerId: string;
  revesSidePlayerId: string;
}

interface PlayerWithStats {
  id: string;
  sideStats: SideStats;
}

const NEUTRAL = 0.5;

function comfortAt(stats: { matches: number; winRate: number }): number {
  return stats.matches > 0 ? stats.winRate : NEUTRAL;
}

export function recommendSides(playerA: PlayerWithStats, playerB: PlayerWithStats): SideRecommendation | null {
  const aHasAny = playerA.sideStats.drive.matches + playerA.sideStats.reves.matches > 0;
  const bHasAny = playerB.sideStats.drive.matches + playerB.sideStats.reves.matches > 0;
  if (!aHasAny && !bHasAny) return null;

  const aDrive = comfortAt(playerA.sideStats.drive);
  const aReves = comfortAt(playerA.sideStats.reves);
  const bDrive = comfortAt(playerB.sideStats.drive);
  const bReves = comfortAt(playerB.sideStats.reves);

  const aOnDriveSum = aDrive + bReves;
  const bOnDriveSum = bDrive + aReves;

  if (aOnDriveSum > bOnDriveSum) return { driveSidePlayerId: playerA.id, revesSidePlayerId: playerB.id };
  if (bOnDriveSum > aOnDriveSum) return { driveSidePlayerId: playerB.id, revesSidePlayerId: playerA.id };
  return null; // exact tie
}
