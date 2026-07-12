import { resolvePageContext } from '@/lib/auth/page-context';
import { listMatchesByDate, listMatchSetsInGroup } from '@/lib/matches/queries';
import { listAllPlayersInGroup } from '@/lib/players/queries';
import { MatchesList, type MatchListItem } from '@/components/shared/matches-list';
import { DirectionalTransition } from '@/components/shared/view-transitions';

export const dynamic = 'force-dynamic';

// Réplica de (public)/matches/page.tsx (48 líneas: por debajo del umbral de
// extracción, se copia con sustituciones). `ctx.groupId` sustituye a
// `getDefaultGroupId()`; `ctx.basePath` se enhebra a <MatchesList> para que el
// link de cada partido quede bajo el grupo.
export default async function GroupMatchesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await resolvePageContext(slug);
  const allMatches = await listMatchesByDate(ctx.groupId);
  const allSets = await listMatchSetsInGroup(ctx.groupId);
  const allPlayers = await listAllPlayersInGroup(ctx.groupId);
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

  return (
    <DirectionalTransition>
      <MatchesList items={items} basePath={ctx.basePath} />
    </DirectionalTransition>
  );
}
