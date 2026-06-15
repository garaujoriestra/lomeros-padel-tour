import { db } from '@/lib/db';
import { players } from '@/lib/db/schema';
import { asc } from 'drizzle-orm';
import { TournamentForm } from '@/components/admin/tournament-form';

export const dynamic = 'force-dynamic';

export default async function NewTournamentPage() {
  const roster = await db
    .select({ id: players.id, name: players.name, nickname: players.nickname })
    .from(players)
    .orderBy(asc(players.name));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="sec-title">Nuevo torneo</h1>
        <p className="muted text-sm mt-1.5">Define jugadores y pistas. Los bloques se configuran después.</p>
      </div>
      <TournamentForm roster={roster} />
    </div>
  );
}
