/**
 * Pair Recommender
 * Given 4 players, evaluates all 3 possible team combinations and ranks them
 * by fairness (smallest Elo gap between teams = most balanced match).
 */

import { recommendSides, type SideRecommendation } from './recommend-sides';
import type { SideStats } from './side-stats';

export interface PlayerSummary {
  id: string;
  name: string;
  eloRating: number;
  matchesPlayed: number;
}

export interface PairingOption {
  team1: [PlayerSummary, PlayerSummary];
  team2: [PlayerSummary, PlayerSummary];
  team1Elo: number;
  team2Elo: number;
  eloDiff: number; // absolute difference — lower = more balanced
  fairnessScore: number; // 0-100 — higher = fairer
  label: string; // 'Más equilibrado' | 'Equilibrado' | 'Desequilibrado'
  team1SideRec: SideRecommendation | null;
  team2SideRec: SideRecommendation | null;
}

function emptySideStats(): SideStats {
  return {
    drive: { matches: 0, wins: 0, losses: 0, winRate: 0 },
    reves: { matches: 0, wins: 0, losses: 0, winRate: 0 },
  };
}

export function recommendPairings(
  players: [PlayerSummary, PlayerSummary, PlayerSummary, PlayerSummary],
  sideStatsByPlayer?: Record<string, SideStats>,
): PairingOption[] {
  const [a, b, c, d] = players;

  // All 3 possible pairings: AB vs CD, AC vs BD, AD vs BC
  const combos: [[PlayerSummary, PlayerSummary], [PlayerSummary, PlayerSummary]][] = [
    [[a, b], [c, d]],
    [[a, c], [b, d]],
    [[a, d], [b, c]],
  ];

  const options: PairingOption[] = combos.map(([t1, t2]) => {
    const team1Elo = (t1[0].eloRating + t1[1].eloRating) / 2;
    const team2Elo = (t2[0].eloRating + t2[1].eloRating) / 2;
    const eloDiff = Math.abs(team1Elo - team2Elo);
    const team1SideRec = sideStatsByPlayer
      ? recommendSides(
          { id: t1[0].id, sideStats: sideStatsByPlayer[t1[0].id] ?? emptySideStats() },
          { id: t1[1].id, sideStats: sideStatsByPlayer[t1[1].id] ?? emptySideStats() },
        )
      : null;
    const team2SideRec = sideStatsByPlayer
      ? recommendSides(
          { id: t2[0].id, sideStats: sideStatsByPlayer[t2[0].id] ?? emptySideStats() },
          { id: t2[1].id, sideStats: sideStatsByPlayer[t2[1].id] ?? emptySideStats() },
        )
      : null;
    return { team1: t1, team2: t2, team1Elo, team2Elo, eloDiff, fairnessScore: 0, label: '', team1SideRec, team2SideRec };
  });

  // Sort by eloDiff ascending (most balanced first)
  options.sort((a, b) => a.eloDiff - b.eloDiff);

  // Assign fairness scores: best=100, worst scales down
  const maxDiff = Math.max(...options.map((o) => o.eloDiff), 1);
  options.forEach((opt, i) => {
    opt.fairnessScore = Math.round(100 - (opt.eloDiff / maxDiff) * 60);
    opt.label = i === 0 ? 'Más equilibrado' : i === 1 ? 'Equilibrado' : 'Desequilibrado';
  });

  return options;
}
