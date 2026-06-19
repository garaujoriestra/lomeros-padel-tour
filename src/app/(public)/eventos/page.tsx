import { db } from '@/lib/db';
import { CalendarDays } from 'lucide-react';
import { SectionHead } from '@/components/lpt/ui';
import { getDefaultGroupId } from '@/lib/auth/group-context';
import { listEventSummaries } from '@/lib/tournament/event-store';
import { eventLiveState } from '@/lib/tournament/event-summary';
import { EventCard } from '@/components/tournament/event-card';

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
        <div className="muted" style={{ textAlign: 'center', padding: '40px 0' }}>
          <p style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Aún no hay eventos.</p>
          <p className="small" style={{ marginTop: 8 }}>Pozos y torneos aparecerán aquí cuando empiecen.</p>
        </div>
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
