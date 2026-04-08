import { db } from '@/lib/db';
import { matches, players } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { ResultForm } from '@/components/admin/result-form';

export const dynamic = 'force-dynamic';

export default async function AddResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [match] = await db.select().from(matches).where(eq(matches.id, id));
  if (!match) notFound();
  if (match.status === 'completed') {
    return (
      <div className="max-w-2xl space-y-4">
        <h1 className="text-2xl font-black">Resultado ya registrado</h1>
        <p className="text-gray-500">Este partido ya tiene resultado guardado.</p>
      </div>
    );
  }

  const allPlayers = await db.select().from(players);
  const pMap = Object.fromEntries(allPlayers.map((p) => [p.id, p]));

  const team1Name = `${pMap[match.team1Player1Id]?.name ?? '?'} / ${pMap[match.team1Player2Id]?.name ?? '?'}`;
  const team2Name = `${pMap[match.team2Player1Id]?.name ?? '?'} / ${pMap[match.team2Player2Id]?.name ?? '?'}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black">Añadir resultado</h1>
        <p className="text-gray-500 text-sm">Introduce el marcador para completar el partido</p>
      </div>
      <ResultForm
        matchId={id}
        team1Name={team1Name}
        team2Name={team2Name}
        date={match.date}
        location={match.location}
      />
    </div>
  );
}
