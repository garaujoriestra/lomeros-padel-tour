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
        <h1 className="sec-title">Resultado ya registrado</h1>
        <p className="text-ink-3">Este partido ya tiene resultado guardado.</p>
      </div>
    );
  }
  if (match.status === 'injury_aborted') {
    return (
      <div className="max-w-2xl space-y-4">
        <h1 className="sec-title">🤕 Marcado como lesión</h1>
        <p className="text-ink-3">Este partido se marcó como no terminado por lesión y no cuenta para ranking.</p>
      </div>
    );
  }

  const allPlayers = await db.select().from(players);
  const pMap = Object.fromEntries(allPlayers.map((p) => [p.id, p]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="sec-title">Añadir resultado</h1>
        <p className="muted text-sm mt-1.5">Introduce el marcador para completar el partido</p>
      </div>
      <ResultForm
        matchId={id}
        date={match.date}
        location={match.location}
        matchPlayers={[
          { id: match.team1Player1Id, name: pMap[match.team1Player1Id]?.name ?? '?' },
          { id: match.team1Player2Id, name: pMap[match.team1Player2Id]?.name ?? '?' },
          { id: match.team2Player1Id, name: pMap[match.team2Player1Id]?.name ?? '?' },
          { id: match.team2Player2Id, name: pMap[match.team2Player2Id]?.name ?? '?' },
        ]}
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
