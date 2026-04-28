interface PlayerLike {
  id: string;
  name: string;
  matchesPlayed: number;
}

interface PairStatLike {
  player1Id: string;
  player2Id: string;
  matchesPlayed: number;
}

export function findUnplayedPartners<P extends PlayerLike>(
  playerId: string,
  allPlayers: P[],
  pairStats: PairStatLike[],
): P[] {
  // Set of partner IDs the target has actually played with.
  const playedWith = new Set<string>();
  for (const ps of pairStats) {
    if (ps.matchesPlayed <= 0) continue;
    if (ps.player1Id === playerId) playedWith.add(ps.player2Id);
    else if (ps.player2Id === playerId) playedWith.add(ps.player1Id);
  }

  return allPlayers
    .filter((p) => p.id !== playerId)
    .filter((p) => p.matchesPlayed > 0)
    .filter((p) => !playedWith.has(p.id))
    .sort((a, b) => a.name.localeCompare(b.name));
}
