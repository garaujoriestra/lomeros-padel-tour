export interface RankGroup<T> {
  rank: number;
  players: T[];
}

/**
 * Groups players by displayed ELO (rounded) into competition-ranked buckets.
 * Two players whose rounded ELOs are equal share the same rank; the next
 * distinct group's rank skips ahead by the size of the previous tie.
 *
 * Input must already be sorted by `eloRating` descending. Returns at most
 * `limit` distinct rank groups (each group may contain multiple players).
 */
export function buildPodiumGroups<T extends { eloRating: number }>(
  players: readonly T[],
  limit = 3,
): RankGroup<T>[] {
  const groups: RankGroup<T>[] = [];
  let i = 0;
  let nextRank = 1;
  while (i < players.length && groups.length < limit) {
    const elo = Math.round(players[i].eloRating);
    const tied: T[] = [];
    while (i < players.length && Math.round(players[i].eloRating) === elo) {
      tied.push(players[i]);
      i++;
    }
    groups.push({ rank: nextRank, players: tied });
    nextRank += tied.length;
  }
  return groups;
}

/**
 * Annotates each player with its competition rank based on `eloRating`
 * (rounded). Useful for the full rankings table — tied players show the same
 * rank number and the next distinct rank skips ahead.
 */
export function assignCompetitionRanks<T extends { eloRating: number }>(
  players: readonly T[],
): Array<T & { rank: number }> {
  const result: Array<T & { rank: number }> = [];
  let i = 0;
  let nextRank = 1;
  while (i < players.length) {
    const elo = Math.round(players[i].eloRating);
    let tieSize = 0;
    while (i + tieSize < players.length && Math.round(players[i + tieSize].eloRating) === elo) {
      result.push({ ...players[i + tieSize], rank: nextRank });
      tieSize++;
    }
    i += tieSize;
    nextRank += tieSize;
  }
  return result;
}
