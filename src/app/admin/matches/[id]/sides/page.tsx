import { notFound } from 'next/navigation';
import { getDefaultGroupId, getGroupContext } from '@/lib/auth/group-context';
import { getMatchInGroup } from '@/lib/matches/queries';
import { listAllPlayersInGroup } from '@/lib/players/queries';
import { MatchSidesForm } from '@/components/admin/match-sides-form';

export const dynamic = 'force-dynamic';

export default async function MatchSidesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const groupId = (await getGroupContext())?.groupId ?? (await getDefaultGroupId());
  const match = await getMatchInGroup(groupId, id);
  if (!match) notFound();

  const allPlayers = await listAllPlayersInGroup(groupId);
  const playerMap = Object.fromEntries(allPlayers.map((p) => [p.id, p]));

  const t1p1 = playerMap[match.team1Player1Id];
  const t1p2 = playerMap[match.team1Player2Id];
  const t2p1 = playerMap[match.team2Player1Id];
  const t2p2 = playerMap[match.team2Player2Id];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="sec-title">Lados de pista</h1>
        <p className="muted text-sm mt-1.5">{match.date}{match.location ? ` · ${match.location}` : ''}</p>
      </div>
      <MatchSidesForm
        matchId={match.id}
        team1Player1Name={t1p1?.name ?? '?'}
        team1Player2Name={t1p2?.name ?? '?'}
        team2Player1Name={t2p1?.name ?? '?'}
        team2Player2Name={t2p2?.name ?? '?'}
        initialSides={{
          team1Player1Side: match.team1Player1Side,
          team1Player2Side: match.team1Player2Side,
          team2Player1Side: match.team2Player1Side,
          team2Player2Side: match.team2Player2Side,
        }}
      />
    </div>
  );
}
