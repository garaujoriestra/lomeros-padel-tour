import Link from 'next/link';
import type { Player } from '@/lib/db/schema';
import { LptAvatar, displayName } from '@/components/lpt/ui';

interface PartnerCardProps {
  variant: 'best' | 'worst';
  partner: Player;
  pairStat: {
    matchesPlayed: number;
    wins: number;
    losses: number;
    synergyScore?: number;
  };
  basePath?: string;
}

export function PartnerCard({ variant, partner, pairStat, basePath = '' }: PartnerCardProps) {
  const winRate = Math.round((pairStat.wins / pairStat.matchesPlayed) * 100);
  const isBest = variant === 'best';
  const tone = isBest ? 'var(--win)' : 'var(--loss)';
  const synergyPct = pairStat.synergyScore != null ? Math.round(pairStat.synergyScore * 100) : null;

  return (
    <Link href={`${basePath}/players/${partner.id}`} className="lpt-card card-pad clickable" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <LptAvatar player={partner} size={40} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="kicker" style={{ fontSize: 9.5, color: tone }}>
          {isBest ? 'Mejor compañero' : 'Peor compañero'}
        </div>
        <div style={{ fontWeight: 700, marginTop: 2 }}>{displayName(partner)}</div>
        <div className="small muted" style={{ fontSize: 11.5 }}>
          {pairStat.matchesPlayed} juntos · {pairStat.wins}V {pairStat.losses}D
          {synergyPct != null && <> · sinergia {synergyPct >= 0 ? '+' : ''}{synergyPct}%</>}
        </div>
      </div>
      <span className="elo-num num" style={{ color: tone }}>{winRate}%</span>
    </Link>
  );
}
