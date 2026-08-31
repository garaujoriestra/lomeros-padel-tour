import { notFound } from 'next/navigation';
import { resolvePageContext } from '@/lib/auth/page-context';
import { getMatchInGroup, getMatchSetsForMatch } from '@/lib/matches/queries';
import { listAllPlayersInGroup } from '@/lib/players/queries';
import { EditResultForm } from '@/components/admin/edit-result-form';

export const dynamic = 'force-dynamic';

// Réplica de admin/matches/[id]/edit/page.tsx (Task 9, paridad 2b): getGroupContext →
// resolvePageContext(slug), groupSlug threaded a EditResultForm para el PATCH con
// body.g y las vueltas a la lista. Hereda el gate admin-del-grupo del layout de
// /g/[slug]/admin.
export default async function GroupEditMatchResultPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const ctx = await resolvePageContext(slug);
  const groupId = ctx.groupId;
  const match = await getMatchInGroup(groupId, id);
  if (!match || (match.status !== 'completed' && match.status !== 'draw')) notFound();

  const sets = await getMatchSetsForMatch(id);
  const allPlayers = await listAllPlayersInGroup(groupId);
  const playerMap = Object.fromEntries(allPlayers.map((p) => [p.id, p]));

  const name = (pid: string) => playerMap[pid]?.name ?? '?';
  const team1Name = `${name(match.team1Player1Id)} / ${name(match.team1Player2Id)}`;
  const team2Name = `${name(match.team2Player1Id)} / ${name(match.team2Player2Id)}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="sec-title">Corregir resultado</h1>
        <p className="muted text-sm mt-1.5">{match.date}{match.location ? ` · ${match.location}` : ''}</p>
      </div>
      <EditResultForm
        matchId={match.id}
        date={match.date}
        location={match.location}
        team1Name={team1Name}
        team2Name={team2Name}
        winnerTeam={match.winnerTeam === 1 || match.winnerTeam === 2 ? match.winnerTeam : null}
        initialSets={sets.map((s) => ({ team1Games: s.team1Games, team2Games: s.team2Games }))}
        initialPhotoUrl={match.photoUrl}
        groupSlug={slug}
      />
    </div>
  );
}
