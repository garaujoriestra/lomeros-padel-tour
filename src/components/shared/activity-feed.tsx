import { Activity } from 'lucide-react';
import type { FeedEvent } from '@/lib/feed/build-feed';
import { ActivityFeedItem } from './activity-feed-item';
import { SectionHead } from '@/components/lpt/ui';

interface ActivityFeedProps {
  events: FeedEvent[];
  playerMap: Record<string, { id: string; name: string; nickname?: string | null }>;
}

export function ActivityFeed({ events, playerMap }: ActivityFeedProps) {
  if (events.length === 0) {
    return (
      <div className="muted" style={{ textAlign: 'center', padding: '40px 0' }}>
        <p style={{ fontSize: 28, margin: '0 0 8px' }}>🎾</p>
        <p className="small" style={{ margin: 0 }}>Aún no hay actividad. ¡Que ruede el primer partido!</p>
      </div>
    );
  }

  return (
    <section className="section">
      <SectionHead icon={Activity} title="Actividad" />
      <div className="lpt-card card-pad">
        {events.map((e, idx) => (
          <ActivityFeedItem key={`${e.type}-${e.timestamp}-${idx}`} event={e} playerMap={playerMap} />
        ))}
      </div>
    </section>
  );
}
