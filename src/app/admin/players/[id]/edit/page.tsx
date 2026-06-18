import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getDefaultGroupId, getGroupContext } from '@/lib/auth/group-context';
import { getPlayerInGroup } from '@/lib/players/queries';
import { notFound } from 'next/navigation';
import { PlayerForm } from '@/components/admin/player-form';

export const dynamic = 'force-dynamic';

export default async function EditPlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const groupId = (await getGroupContext())?.groupId ?? (await getDefaultGroupId());
  const player = await getPlayerInGroup(groupId, id);
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
