import { db } from '@/lib/db';
import { players } from '@/lib/db/schema';
import { asc } from 'drizzle-orm';
import { EventForm } from '@/components/admin/event-form';

export const dynamic = 'force-dynamic';

export default async function NewTorneoPage() {
  const roster = await db.select({ id: players.id, name: players.name, nickname: players.nickname }).from(players).orderBy(asc(players.name));
  return (
    <div className="space-y-6">
      <h1 className="sec-title">Nuevo torneo</h1>
      <EventForm kind="torneo" roster={roster} />
    </div>
  );
}
