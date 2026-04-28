export type RankChangeType =
  | 'rank_into_top1'
  | 'rank_loses_top1'
  | 'rank_into_top3'
  | 'rank_loses_top3';

export interface RankChangeEvent {
  playerId: string;
  type: RankChangeType;
  recordedAt: string;
  newElo: number;
}

interface HistoryEntry {
  playerId: string;
  eloBefore: number;
  eloAfter: number;
  recordedAt: string;
}

interface PlayerSeed {
  id: string;
  eloRating: number;
}

const INITIAL_ELO = 1500;

/**
 * Returns 1-based rank of a player given a map of all current ELOs.
 * Ties are broken by Map insertion order (stable, deterministic).
 */
function rankOf(playerId: string, eloMap: Map<string, number>): number {
  const sorted = [...eloMap.entries()].sort((a, b) => b[1] - a[1]);
  return sorted.findIndex(([id]) => id === playerId) + 1;
}

export function detectRankChanges(
  history: HistoryEntry[],
  allPlayers: PlayerSeed[],
): RankChangeEvent[] {
  if (history.length === 0) return [];

  // Sort history chronologically first so we can determine first-appearance order.
  const sorted = [...history].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));

  // Build eloMap in the order players first appear in chronological history,
  // then append any remaining allPlayers who never appear in history.
  // This tie-breaking order ensures that a player who hasn't yet played a match
  // doesn't spuriously hold a top rank over one who plays later.
  const eloMap = new Map<string, number>();
  for (const entry of sorted) {
    if (!eloMap.has(entry.playerId)) {
      eloMap.set(entry.playerId, INITIAL_ELO);
    }
  }
  // Players in allPlayers who never appear in history — append at end.
  for (const p of allPlayers) {
    if (!eloMap.has(p.id)) eloMap.set(p.id, INITIAL_ELO);
  }

  const events: RankChangeEvent[] = [];

  for (const entry of sorted) {
    // Compute pre-state ranks for ALL players (because applying entry can affect others).
    const preRanks = new Map<string, number>();
    for (const id of eloMap.keys()) preRanks.set(id, rankOf(id, eloMap));

    // Apply the entry.
    eloMap.set(entry.playerId, entry.eloAfter);

    // Compute post-state ranks for ALL players.
    const postRanks = new Map<string, number>();
    for (const id of eloMap.keys()) postRanks.set(id, rankOf(id, eloMap));

    // Emit events for any player whose rank crossed a threshold.
    for (const id of eloMap.keys()) {
      const pre = preRanks.get(id)!;
      const post = postRanks.get(id)!;

      if (pre !== 1 && post === 1) {
        events.push({ playerId: id, type: 'rank_into_top1', recordedAt: entry.recordedAt, newElo: eloMap.get(id)! });
      } else if (pre === 1 && post !== 1) {
        events.push({ playerId: id, type: 'rank_loses_top1', recordedAt: entry.recordedAt, newElo: eloMap.get(id)! });
      }

      if (pre > 3 && post <= 3) {
        events.push({ playerId: id, type: 'rank_into_top3', recordedAt: entry.recordedAt, newElo: eloMap.get(id)! });
      } else if (pre <= 3 && post > 3) {
        events.push({ playerId: id, type: 'rank_loses_top3', recordedAt: entry.recordedAt, newElo: eloMap.get(id)! });
      }
    }
  }

  return events;
}
