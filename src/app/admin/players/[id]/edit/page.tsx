import { db } from '@/lib/db';
import { players } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { PlayerForm } from '@/components/admin/player-form';

export const dynamic = 'force-dynamic';

export default async function EditPlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [player] = await db.select().from(players).where(eq(players.id, id));
  if (!player) notFound();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Editar jugador</h1>
        <p className="text-gray-500 text-sm">{player.name}</p>
      </div>
      <PlayerForm initialData={player} />
    </div>
  );
}
