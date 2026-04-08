import { db } from '@/lib/db';
import { players } from '@/lib/db/schema';
import { MatchForm } from '@/components/admin/match-form';

export const dynamic = 'force-dynamic';

export default async function NewMatchPage() {
  const allPlayers = await db.select().from(players).orderBy(players.name);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Registrar partido</h1>
        <p className="text-gray-500 text-sm">Selecciona los jugadores, asigna equipos e introduce el resultado set a set</p>
      </div>
      {allPlayers.length < 4 ? (
        <div className="text-center py-12 text-gray-500">
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
