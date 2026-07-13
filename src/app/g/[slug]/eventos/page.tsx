import { db } from '@/lib/db';
import { CalendarDays } from 'lucide-react';
import { SectionHead } from '@/components/lpt/ui';
import { resolvePageContext } from '@/lib/auth/page-context';
import { listEventSummaries } from '@/lib/tournament/event-store';
import { eventLiveState } from '@/lib/tournament/event-summary';
import { EventCard } from '@/components/tournament/event-card';
import { EmptyState } from '@/components/shared/empty-state';

export const dynamic = 'force-dynamic';

// Réplica de (public)/eventos/page.tsx (34 líneas: por debajo del umbral de
// extracción, se copia con sustituciones). `ctx.groupId` sustituye a
// `getDefaultGroupId()`; `ctx.basePath` se enhebra a <EventCard> para que sus
// hrefs (pozos/torneos) queden bajo el grupo (destino ya existente, Task 5).
export default async function GroupEventosPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await resolvePageContext(slug);
  const summaries = await listEventSummaries(db, ctx.groupId);
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
            <EventCard key={event.id} event={event} basePath={ctx.basePath} />
          ))}
        </div>
      )}
    </section>
  );
}
