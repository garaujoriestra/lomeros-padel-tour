import { notFound } from 'next/navigation';
import { getDefaultGroupId, getGroupContext } from '@/lib/auth/group-context';
import { getMatchInGroup, getMatchSetsForMatch } from '@/lib/matches/queries';
import { listAllPlayersInGroup } from '@/lib/players/queries';
import { EditResultForm } from '@/components/admin/edit-result-form';

export const dynamic = 'force-dynamic';

// Corregir el resultado (juegos y/o foto) de un partido ya registrado.
export default async function EditMatchResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const groupId = (await getGroupContext())?.groupId ?? (await getDefaultGroupId());
  const match = await getMatchInGroup(groupId, id);
  if (!match || match.status !== 'completed' || (match.winnerTeam !== 1 && match.winnerTeam !== 2)) notFound();

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
        winnerTeam={match.winnerTeam}
        initialSets={sets.map((s) => ({ team1Games: s.team1Games, team2Games: s.team2Games }))}
        initialPhotoUrl={match.photoUrl}
      />
    </div>
  );
}
