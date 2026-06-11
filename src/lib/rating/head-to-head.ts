export interface RivalryStats {
  opponentId: string;
  opponentName: string;
  opponentAvatarUrl: string | null;
  matches: number;
  wins: number;
  losses: number;
  winRate: number;
}

export interface MatchForRivalry {
  team1Player1Id: string;
  team1Player2Id: string;
  team2Player1Id: string;
  team2Player2Id: string;
  winnerTeam: number | null;
}

interface PlayerForRivalry {
  id: string;
  name: string;
  avatarUrl?: string | null;
}

function findPlayerTeam(playerId: string, m: MatchForRivalry): 1 | 2 | null {
  if (m.team1Player1Id === playerId || m.team1Player2Id === playerId) return 1;
  if (m.team2Player1Id === playerId || m.team2Player2Id === playerId) return 2;
  return null;
}

function opposingPlayerIds(playerTeam: 1 | 2, m: MatchForRivalry): string[] {
  return playerTeam === 1
    ? [m.team2Player1Id, m.team2Player2Id]
    : [m.team1Player1Id, m.team1Player2Id];
}

interface Tally { matches: number; wins: number; losses: number; }

export function computeAllRivalries(
  playerId: string,
  matches: MatchForRivalry[],
  allPlayers: PlayerForRivalry[],
): RivalryStats[] {
  const tally = new Map<string, Tally>();

  for (const m of matches) {
    if (m.winnerTeam === null) continue;
    const playerTeam = findPlayerTeam(playerId, m);
    if (!playerTeam) continue;

    const won = m.winnerTeam === playerTeam;
    for (const oppId of opposingPlayerIds(playerTeam, m)) {
      const t = tally.get(oppId) ?? { matches: 0, wins: 0, losses: 0 };
      t.matches += 1;
      if (won) t.wins += 1;
      else t.losses += 1;
      tally.set(oppId, t);
    }
  }

  const playerNameMap = new Map(allPlayers.map((p) => [p.id, p.name]));
  const playerAvatarMap = new Map(allPlayers.map((p) => [p.id, p.avatarUrl ?? null]));

  const result: RivalryStats[] = [];
  for (const [opponentId, t] of tally) {
    result.push({
      opponentId,
      opponentName: playerNameMap.get(opponentId) ?? '?',
      opponentAvatarUrl: playerAvatarMap.get(opponentId) ?? null,
      matches: t.matches,
      wins: t.wins,
      losses: t.losses,
      winRate: t.wins / t.matches,
    });
  }

  // Sort: matches DESC, then name ASC for ties
  result.sort((a, b) => {
    if (b.matches !== a.matches) return b.matches - a.matches;
    return a.opponentName.localeCompare(b.opponentName);
  });

  return result;
}
