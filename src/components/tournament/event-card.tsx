import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { formatMatchDate } from '@/components/lpt/ui';
import { formatLabel } from '@/lib/tournament/pozo-view';
import { eventLiveState, kindLabel, eventDetailHref } from '@/lib/tournament/event-summary';
import type { EventSummary } from '@/lib/tournament/event-store';

// Tarjeta clicable de un evento (pozo/torneo) para los listados públicos.
export function EventCard({ event, basePath = '' }: { event: EventSummary; basePath?: string }) {
  const state = eventLiveState(event);
  const href = eventDetailHref(event.kind, event.id, basePath);

  return (
    <Link
      href={href}
      className="lpt-card clickable card-pad"
      style={{ display: 'flex', alignItems: 'center', gap: 14, textDecoration: 'none' }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
          <span className="lpt-badge accent">{kindLabel(event.kind)}</span>
          <span className="lpt-badge">{formatLabel(event.format)}</span>
          {state === 'live' && (
            <span className="lpt-badge win">● En directo</span>
          )}
          {state === 'finished' && (
            <span className="lpt-badge">Terminado</span>
          )}
        </div>
        <div className="sec-title" style={{ fontSize: 17, lineHeight: 1.2 }}>{event.name}</div>
        <div className="muted small" style={{ marginTop: 4 }}>
          {formatMatchDate(event.date)}
          {event.location ? ` · ${event.location}` : ''}
        </div>
      </div>
      <ChevronRight size={18} className="muted" style={{ flexShrink: 0 }} />
    </Link>
  );
}
