import Link from 'next/link';
import type { FeedEvent } from '@/lib/feed/build-feed';
import { ActivityFeedItem } from './activity-feed-item';

interface ActivityFeedProps {
  events: FeedEvent[];
  playerMap: Record<string, { id: string; name: string }>;
}

export function ActivityFeed({ events, playerMap }: ActivityFeedProps) {
  if (events.length === 0) {
    return (
      <div className="text-center py-10 text-gray-400">
        <p className="text-3xl mb-2">🎾</p>
        <p className="text-sm">Aún no hay actividad. ¡Que ruede el primer partido!</p>
      </div>
    );
  }

  return (
    <section className="space-y-5">
      <div className="flex items-center gap-4">
        <h2 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">⚡ ACTIVIDAD</h2>
        <div className="flex-1 h-px bg-gradient-to-r from-green-300/60 to-transparent" />
        <Link href="/matches" className="text-sm font-bold text-green-700 hover:text-green-900 transition-colors">
          Ver todos →
        </Link>
      </div>
      <div className="space-y-2.5">
        {events.map((e, idx) => (
          <ActivityFeedItem key={`${e.type}-${e.timestamp}-${idx}`} event={e} playerMap={playerMap} />
        ))}
      </div>
    </section>
  );
}
