import { resolvePageContext } from '@/lib/auth/page-context';
import { getTournamentInGroup } from '@/lib/tournament/queries';
import { notFound } from 'next/navigation';
import { EventPanel } from '@/components/admin/event-panel';

export const dynamic = 'force-dynamic';

// Réplica de admin/torneos/[id]/page.tsx (Task 7, paridad 2b).
export default async function GroupAdminTorneoDetailPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const { groupId } = await resolvePageContext(slug);
  const t = await getTournamentInGroup(groupId, id);
  if (!t || t.kind !== 'torneo') notFound();
  return <EventPanel id={id} groupSlug={slug} />;
}
