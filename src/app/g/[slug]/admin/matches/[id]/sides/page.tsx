import { notFound } from 'next/navigation';
import { resolvePageContext } from '@/lib/auth/page-context';
import { getMatchInGroup } from '@/lib/matches/queries';
import { listAllPlayersInGroup } from '@/lib/players/queries';
import { MatchSidesForm } from '@/components/admin/match-sides-form';

export const dynamic = 'force-dynamic';

// Réplica de admin/matches/[id]/sides/page.tsx (Task 9, paridad 2b): getGroupContext →
// resolvePageContext(slug), groupSlug threaded a MatchSidesForm para el PATCH con
// body.g y las vueltas a la lista. Hereda el gate admin-del-grupo del layout de
// /g/[slug]/admin.
export default async function GroupMatchSidesPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const ctx = await resolvePageContext(slug);
  const groupId = ctx.groupId;
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
        groupSlug={slug}
      />
    </div>
  );
}
