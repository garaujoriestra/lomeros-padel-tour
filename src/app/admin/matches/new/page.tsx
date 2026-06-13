import { db } from '@/lib/db';
import { players } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { MatchForm } from '@/components/admin/match-form';

export const dynamic = 'force-dynamic';

export default async function NewMatchPage() {
  const allPlayers = await db.select().from(players).where(eq(players.juegaPadel, true)).orderBy(players.name);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="sec-title">Registrar partido</h1>
        <p className="muted text-sm mt-1.5">Selecciona los jugadores, asigna equipos e introduce el resultado set a set</p>
      </div>
      {allPlayers.length < 4 ? (
        <div className="text-center py-12 text-ink-3">
          <p className="text-4xl mb-2">⚠️</p>
          <p>Necesitas al menos 4 jugadores para registrar un partido.</p>
          <p className="text-sm mt-1">Tienes {allPlayers.length} jugador{allPlayers.length !== 1 ? 'es' : ''} registrado{allPlayers.length !== 1 ? 's' : ''}.</p>
        </div>
      ) : (
        <MatchForm players={allPlayers} />
      )}
    </div>
  );
}
