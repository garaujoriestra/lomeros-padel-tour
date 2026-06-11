import Link from 'next/link';
import { Swords, Bandage, Calendar, TrendingUp, TrendingDown, UserPlus, Award, type LucideIcon } from 'lucide-react';
import type { FeedEvent } from '@/lib/feed/build-feed';
import { relativeTime } from '@/lib/format/relative-time';

interface PlayerMap {
  [id: string]: { id: string; name: string; nickname?: string | null };
}

const RANK_LABELS: Record<string, string> = {
  rank_into_top1: 'llega al #1 del ranking',
  rank_loses_top1: 'pierde el #1 del ranking',
  rank_into_top3: 'entra al top 3',
  rank_loses_top3: 'sale del top 3',
};

const RANK_UP: Record<string, boolean> = {
  rank_into_top1: true,
  rank_loses_top1: false,
  rank_into_top3: true,
  rank_loses_top3: false,
};

function pName(p: { name: string; nickname?: string | null } | undefined) {
  return p ? p.nickname || p.name : '?';
}

function teamNames(p1: PlayerMap[string] | undefined, p2: PlayerMap[string] | undefined) {
  return `${pName(p1)} & ${pName(p2)}`;
}

function Row({
  icon: Icon,
  href,
  time,
  emoji,
  children,
}: {
  icon?: LucideIcon;
  emoji?: string;
  href: string;
  time: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className="feed-row" style={{ display: 'flex' }}>
      <div className="feed-ico">{emoji ? <span style={{ fontSize: 15 }}>{emoji}</span> : Icon && <Icon size={15} />}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13.5, lineHeight: 1.45 }}>{children}</div>
        <div className="small muted" style={{ marginTop: 2, fontSize: 11.5 }}>{time}</div>
      </div>
    </Link>
  );
}

export function ActivityFeedItem({ event, playerMap }: { event: FeedEvent; playerMap: PlayerMap }) {
  const time = relativeTime(event.timestamp);

  if (event.type === 'match_completed') {
    const m = event.match;
    const t1 = teamNames(playerMap[m.team1Player1Id], playerMap[m.team1Player2Id]);
    const t2 = teamNames(playerMap[m.team2Player1Id], playerMap[m.team2Player2Id]);
    const winnerNames = m.winnerTeam === 1 ? t1 : t2;
    const loserNames = m.winnerTeam === 1 ? t2 : t1;
    const setsStr = event.sets.map((s) => `${s.team1Games}–${s.team2Games}`).join(' · ');
    return (
      <Row icon={Swords} href={`/matches/${m.id}`} time={time}>
        <b>{winnerNames}</b> ganan a {loserNames}{' '}
        {setsStr && <span className="num" style={{ fontWeight: 700 }}>({setsStr})</span>}
      </Row>
    );
  }

  if (event.type === 'match_injury_aborted') {
    const m = event.match;
    const t1 = teamNames(playerMap[m.team1Player1Id], playerMap[m.team1Player2Id]);
    const t2 = teamNames(playerMap[m.team2Player1Id], playerMap[m.team2Player2Id]);
    const injured = m.injuredPlayerId ? playerMap[m.injuredPlayerId] : null;
    return (
      <Row icon={Bandage} href={`/matches/${m.id}`} time={time}>
        <b>{t1}</b> vs <b>{t2}</b> — no terminado{injured && <> por lesión de <b>{pName(injured)}</b></>}
      </Row>
    );
  }

  if (event.type === 'match_scheduled') {
    const m = event.match;
    const t1 = teamNames(playerMap[m.team1Player1Id], playerMap[m.team1Player2Id]);
    const t2 = teamNames(playerMap[m.team2Player1Id], playerMap[m.team2Player2Id]);
    return (
      <Row icon={Calendar} href={`/matches/${m.id}`} time={time}>
        Programado: <b>{t1}</b> vs <b>{t2}</b>
      </Row>
    );
  }

  if (event.type === 'rank_change') {
    const player = playerMap[event.event.playerId];
    const up = RANK_UP[event.event.type];
    return (
      <Row icon={up ? TrendingUp : TrendingDown} href={`/players/${event.event.playerId}`} time={time}>
        <b>{pName(player)}</b> {RANK_LABELS[event.event.type]}{' '}
        <span className="num muted">({Math.round(event.event.newElo)} Elo)</span>
      </Row>
    );
  }

  if (event.type === 'new_player') {
    return (
      <Row icon={UserPlus} href={`/players/${event.player.id}`} time={time}>
        <b>{event.player.name}</b> se une al tour
      </Row>
    );
  }

  if (event.type === 'achievement_unlocked') {
    const player = playerMap[event.playerId];
    return (
      <Row icon={Award} href={`/players/${event.playerId}`} time={time}>
        <b>{pName(player)}</b> desbloquea <b>{event.achievement.icon} {event.achievement.name}</b>
      </Row>
    );
  }

  return null;
}
