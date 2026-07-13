import { db } from '@/lib/db';
import { CalendarDays } from 'lucide-react';
import { SectionHead } from '@/components/lpt/ui';
import { getDefaultGroupId } from '@/lib/auth/group-context';
import { listEventSummaries } from '@/lib/tournament/event-store';
import { eventLiveState } from '@/lib/tournament/event-summary';
import { EventCard } from '@/components/tournament/event-card';
import { EmptyState } from '@/components/shared/empty-state';

export const dynamic = 'force-dynamic';

export default async function EventosPage() {
  const groupId = await getDefaultGroupId();
  const summaries = await listEventSummaries(db, groupId);
  // Listado público: solo eventos generados (los borradores son solo de admin).
  const events = summaries.filter((s) => eventLiveState(s) !== 'upcoming');

  return (
    <section className="section">
      <SectionHead icon={CalendarDays} title="Eventos" />
      {events.length === 0 ? (
        <EmptyState
          emoji="📅"
          title="Aún no hay eventos"
          hint="Los torneos y pozos del grupo aparecerán aquí."
        />
      ) : (
        <div className="grid-2 stagger">
          {events.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </section>
  );
}
