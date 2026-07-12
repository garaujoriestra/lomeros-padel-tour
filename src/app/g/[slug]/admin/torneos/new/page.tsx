import { resolvePageContext } from '@/lib/auth/page-context';
import { listAllPlayersInGroup } from '@/lib/players/queries';
import { EventForm } from '@/components/admin/event-form';

export const dynamic = 'force-dynamic';

// Réplica de admin/torneos/new/page.tsx (Task 7, paridad 2b).
export default async function GroupNewTorneoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { groupId } = await resolvePageContext(slug);
  const roster = (await listAllPlayersInGroup(groupId)).map((p) => ({ id: p.id, name: p.name, nickname: p.nickname }));
  return (
    <div className="space-y-6">
      <h1 className="sec-title">Nuevo torneo</h1>
      <EventForm kind="torneo" roster={roster} groupSlug={slug} />
    </div>
  );
}
