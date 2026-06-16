import { db } from '@/lib/db';
import { loadEvent } from '@/lib/tournament/event-store';
import { notFound } from 'next/navigation';
import { EventPanel } from '@/components/admin/event-panel';

export const dynamic = 'force-dynamic';

export default async function TorneoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const ev = await loadEvent(db, id);
    if (ev.kind !== 'torneo') notFound();
  } catch { notFound(); }
  return <EventPanel id={id} />;
}
