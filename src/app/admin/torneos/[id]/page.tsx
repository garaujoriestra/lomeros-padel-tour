import { getDefaultGroupId, getGroupContext } from '@/lib/auth/group-context';
import { getTournamentInGroup } from '@/lib/tournament/queries';
import { notFound } from 'next/navigation';
import { EventPanel } from '@/components/admin/event-panel';

export const dynamic = 'force-dynamic';

export default async function TorneoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const groupId = (await getGroupContext())?.groupId ?? (await getDefaultGroupId());
  const t = await getTournamentInGroup(groupId, id);
  if (!t || t.kind !== 'torneo') notFound();
  return <EventPanel id={id} />;
}
