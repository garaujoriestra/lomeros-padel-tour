import Link from 'next/link';
import { Crown } from 'lucide-react';
import type { RankGroup } from '@/lib/rankings/podium-groups';
import { LptAvatar, AvatarStack, Delta, displayName } from '@/components/lpt/ui';
import { CountUp } from '@/components/lpt/count-up';

interface PodiumPlayer {
  id: string;
  name: string;
  nickname?: string | null;
  eloRating: number;
  wins: number;
  losses: number;
  matchesPlayed: number;
  avatarUrl?: string | null;
  /** Cambio de Elo del último partido (para el ▲/▼). */
  delta?: number | null;
}

interface PodiumProps {
  /** Up to 3 rank groups in descending order (group[0] = top step). */
  groups: RankGroup<PodiumPlayer>[];
  variant?: 'home' | 'rankings';
}

function winRate(p: PodiumPlayer) {
  return p.matchesPlayed > 0 ? Math.round((p.wins / p.matchesPlayed) * 100) : 0;
}

function Step({ group, rank, first, barHeight }: { group: RankGroup<PodiumPlayer> | undefined; rank: number; first: boolean; barHeight: number }) {
  if (!group || group.players.length === 0) return <div />;
  const players = group.players;
  const single = players.length === 1;
  const p = players[0];

  return (
    <div
      className={`lpt-card clickable ${first ? 'podium-gold' : ''}`}
      style={{ textAlign: 'center', overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column' }}
    >
      <Link
        href={single ? `/players/${p.id}` : '/rankings'}
        style={{
          padding: `calc(${first ? 22 : 14}px * var(--sp)) 10px calc(12px * var(--sp))`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 7,
          flex: 1,
        }}
      >
        {first && <Crown size={20} strokeWidth={2.2} style={{ color: 'var(--acc-text)', marginBottom: -2 }} />}
        {single ? (
          <LptAvatar player={p} size={first ? 62 : 48} />
        ) : (
          <AvatarStack players={players} size={first ? 48 : 40} />
        )}
        <div style={{ minWidth: 0, width: '100%' }}>
          <div
            className="display"
            style={{ fontSize: first ? 21 : 16, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
          >
            {single ? displayName(p) : players.map((x) => displayName(x)).join(' · ')}
          </div>
          <div className="small muted" style={{ marginTop: 2 }}>
            {single ? `${p.wins}V – ${p.losses}D · ${winRate(p)}%` : 'Empate'}
          </div>
        </div>
        <div>
          <span className="elo-num" style={{ fontSize: first ? 34 : 24 }}>
            <CountUp value={Math.round(p.eloRating)} />
          </span>
          <div style={{ marginTop: 1 }}>
            <Delta value={p.delta} pulse={first} />
          </div>
        </div>
      </Link>
      <div
        className="display"
        style={{
          height: barHeight,
          display: 'grid',
          placeItems: 'center',
          fontSize: first ? 30 : 22,
          background: first ? 'var(--acc)' : 'var(--surface-2)',
          color: first ? 'var(--on-acc)' : 'var(--ink-3)',
          borderTop: 'var(--card-border)',
        }}
      >
        {rank}
      </div>
    </div>
  );
}

export function Podium({ groups }: PodiumProps) {
  if (groups.length === 0) return null;
  const [gold, silver, bronze] = groups;
  return (
    <div
      className="stagger"
      style={{ display: 'grid', gridTemplateColumns: '1fr 1.15fr 1fr', gap: 'calc(10px * var(--sp))', alignItems: 'end' }}
    >
      <Step group={silver} rank={silver?.rank ?? 2} first={false} barHeight={40} />
      <Step group={gold} rank={gold?.rank ?? 1} first barHeight={55} />
      <Step group={bronze} rank={bronze?.rank ?? 3} first={false} barHeight={32} />
    </div>
  );
}
