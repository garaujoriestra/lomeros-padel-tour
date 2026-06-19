import { getDefaultGroupId, getGroupContext } from '@/lib/auth/group-context';
import { listAllPlayersInGroup } from '@/lib/players/queries';
import { EventForm } from '@/components/admin/event-form';

export const dynamic = 'force-dynamic';

export default async function NewTorneoPage() {
  const groupId = (await getGroupContext())?.groupId ?? (await getDefaultGroupId());
  const roster = (await listAllPlayersInGroup(groupId)).map((p) => ({ id: p.id, name: p.name, nickname: p.nickname }));
  return (
    <div className="space-y-6">
      <h1 className="sec-title">Nuevo torneo</h1>
      <EventForm kind="torneo" roster={roster} />
    </div>
  );
}
