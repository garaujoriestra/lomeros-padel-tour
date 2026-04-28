import Link from 'next/link';
import type { FeedEvent } from '@/lib/feed/build-feed';
import { relativeTime } from '@/lib/format/relative-time';

interface PlayerMap {
  [id: string]: { id: string; name: string };
}

const RANK_LABELS: Record<string, string> = {
  rank_into_top1: 'llega al #1 del ranking',
  rank_loses_top1: 'pierde el #1 del ranking',
  rank_into_top3: 'entra al top 3',
  rank_loses_top3: 'sale del top 3',
};

const RANK_ICONS: Record<string, string> = {
  rank_into_top1: '🥇',
  rank_loses_top1: '📉',
  rank_into_top3: '📈',
  rank_loses_top3: '📉',
};

function teamNames(p1: { name: string } | undefined, p2: { name: string } | undefined) {
  return `${p1?.name ?? '?'} & ${p2?.name ?? '?'}`;
}

export function ActivityFeedItem({ event, playerMap }: { event: FeedEvent; playerMap: PlayerMap }) {
  const time = relativeTime(event.timestamp);

  if (event.type === 'match_completed') {
    const m = event.match;
    const t1 = teamNames(playerMap[m.team1Player1Id], playerMap[m.team1Player2Id]);
    const t2 = teamNames(playerMap[m.team2Player1Id], playerMap[m.team2Player2Id]);
    const winnerNames = m.winnerTeam === 1 ? t1 : m.winnerTeam === 2 ? t2 : null;
    const loserNames = m.winnerTeam === 1 ? t2 : m.winnerTeam === 2 ? t1 : null;
    const setsStr = event.sets.map((s) => `${s.team1Games}-${s.team2Games}`).join(' · ');

    return (
      <Link href={`/matches/${m.id}`} className="block">
        <div className="bg-white border border-gray-100 rounded-2xl p-4 flex items-start gap-3 hover:border-green-200 hover:shadow-sm transition-all">
          <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center text-lg shrink-0">✅</div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-800 leading-snug">
              <span className="font-bold">{winnerNames}</span> ganan a <span className="font-bold">{loserNames}</span>
            </p>
            <div className="flex items-center gap-2 mt-1.5">
              {setsStr && (
                <span className="font-mono text-xs bg-gray-50 px-2 py-0.5 rounded text-gray-700">{setsStr}</span>
              )}
              <span className="text-xs text-gray-400">· {time}</span>
            </div>
          </div>
        </div>
      </Link>
    );
  }

  if (event.type === 'match_scheduled') {
    const m = event.match;
    const t1 = teamNames(playerMap[m.team1Player1Id], playerMap[m.team1Player2Id]);
    const t2 = teamNames(playerMap[m.team2Player1Id], playerMap[m.team2Player2Id]);
    const meta = [m.date, m.location].filter(Boolean).join(' · ');

    return (
      <Link href={`/matches/${m.id}`} className="block">
        <div className="bg-white border border-amber-100 rounded-2xl p-4 flex items-start gap-3 hover:border-amber-200 hover:shadow-sm transition-all">
          <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center text-lg shrink-0">📅</div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-800 leading-snug">
              Programado: <span className="font-bold">{t1} vs {t2}</span>
            </p>
            <p className="text-xs text-gray-500 mt-1.5">
              {meta} <span className="text-gray-400">· {time}</span>
            </p>
          </div>
        </div>
      </Link>
    );
  }

  if (event.type === 'rank_change') {
    const player = playerMap[event.event.playerId];
    return (
      <Link href={`/players/${event.event.playerId}`} className="block">
        <div className="bg-white border border-blue-100 rounded-2xl p-4 flex items-start gap-3 hover:border-blue-200 hover:shadow-sm transition-all">
          <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-lg shrink-0">{RANK_ICONS[event.event.type]}</div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-800 leading-snug">
              <span className="font-bold">{player?.name ?? '?'}</span> {RANK_LABELS[event.event.type]}
            </p>
            <p className="text-xs text-gray-400 mt-1.5">{Math.round(event.event.newElo)} ELO · {time}</p>
          </div>
        </div>
      </Link>
    );
  }

  // new_player
  if (event.type === 'new_player') {
    return (
      <Link href={`/players/${event.player.id}`} className="block">
        <div className="bg-white border border-pink-100 rounded-2xl p-4 flex items-start gap-3 hover:border-pink-200 hover:shadow-sm transition-all">
          <div className="w-9 h-9 rounded-full bg-pink-100 flex items-center justify-center text-lg shrink-0">👤</div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-800 leading-snug">
              Nuevo jugador en el grupo: <span className="font-bold">{event.player.name}</span>
            </p>
            <p className="text-xs text-gray-400 mt-1.5">{time}</p>
          </div>
        </div>
      </Link>
    );
  }

  if (event.type === 'achievement_unlocked') {
    const player = playerMap[event.playerId];
    return (
      <Link href={`/players/${event.playerId}`} className="block">
        <div className="bg-white border border-yellow-200 rounded-2xl p-4 flex items-start gap-3 hover:border-yellow-300 hover:shadow-sm transition-all">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-yellow-100 to-yellow-300 flex items-center justify-center text-lg shrink-0">
            {event.achievement.icon}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-800 leading-snug">
              <span className="font-bold">{player?.name ?? '?'}</span> desbloquea{' '}
              <span className="font-bold">{event.achievement.name}</span>
            </p>
            <p className="text-xs text-gray-400 mt-1.5">{event.achievement.description} · {time}</p>
          </div>
        </div>
      </Link>
    );
  }

  // Should not reach here; all variants have explicit handlers
  return null;
}
