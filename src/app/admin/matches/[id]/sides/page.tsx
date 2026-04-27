import { db } from '@/lib/db';
import { matches, players } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { MatchSidesForm } from '@/components/admin/match-sides-form';

export const dynamic = 'force-dynamic';

export default async function MatchSidesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [match] = await db.select().from(matches).where(eq(matches.id, id));
  if (!match) notFound();

  const allPlayers = await db.select().from(players);
  const playerMap = Object.fromEntries(allPlayers.map((p) => [p.id, p]));

  const t1p1 = playerMap[match.team1Player1Id];
  const t1p2 = playerMap[match.team1Player2Id];
  const t2p1 = playerMap[match.team2Player1Id];
  const t2p2 = playerMap[match.team2Player2Id];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Editar lados de pista</h1>
        <p className="text-gray-500 text-sm">{match.date}{match.location ? ` · ${match.location}` : ''}</p>
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
