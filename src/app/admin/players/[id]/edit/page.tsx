import { db } from '@/lib/db';
import { players, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { PlayerForm } from '@/components/admin/player-form';

export const dynamic = 'force-dynamic';

export default async function EditPlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [player] = await db.select().from(players).where(eq(players.id, id));
  if (!player) notFound();

  const [linkedUser] = await db.select().from(users).where(eq(users.playerId, id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="sec-title">Editar jugador</h1>
        <p className="muted text-sm mt-1.5">{player.name}</p>
      </div>
      <PlayerForm initialData={{ ...player, email: linkedUser?.email ?? '' }} />
    </div>
  );
}
