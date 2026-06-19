import { getDefaultGroupId } from '@/lib/auth/group-context';
import { listMatchesByDate, listMatchSetsInGroup } from '@/lib/matches/queries';
import { listAllPlayersInGroup } from '@/lib/players/queries';
import { MatchesList, type MatchListItem } from '@/components/shared/matches-list';

export const dynamic = 'force-dynamic';

export default async function MatchesPage() {
  const groupId = await getDefaultGroupId();
  const allMatches = await listMatchesByDate(groupId);
  const allSets = await listMatchSetsInGroup(groupId);
  const allPlayers = await listAllPlayersInGroup(groupId);
  const playerMap = Object.fromEntries(allPlayers.map((p) => [p.id, p]));

  const setsMap: Record<string, typeof allSets> = {};
  for (const set of allSets) {
    if (!setsMap[set.matchId]) setsMap[set.matchId] = [];
    setsMap[set.matchId].push(set);
    setsMap[set.matchId].sort((a, b) => a.setNumber - b.setNumber);
  }

  const toPlayer = (id: string) => {
    const p = playerMap[id];
    return p ? { id: p.id, name: p.name, nickname: p.nickname, avatarUrl: p.avatarUrl } : undefined;
  };

  const items: MatchListItem[] = allMatches.map((m) => ({
    match: {
      id: m.id,
      date: m.date,
      location: m.location,
      status: m.status,
      winnerTeam: m.winnerTeam,
      photoUrl: m.photoUrl,
      injuredPlayerId: m.injuredPlayerId,
    },
    team1: [toPlayer(m.team1Player1Id), toPlayer(m.team1Player2Id)],
    team2: [toPlayer(m.team2Player1Id), toPlayer(m.team2Player2Id)],
    sets: (setsMap[m.id] ?? []).map((s) => ({ team1Games: s.team1Games, team2Games: s.team2Games })),
  }));

  return <MatchesList items={items} />;
}
