import Link from 'next/link';
import type { Player } from '@/lib/db/schema';

interface PartnerCardProps {
  variant: 'best' | 'worst';
  partner: Player;
  pairStat: {
    matchesPlayed: number;
    wins: number;
    losses: number;
  };
}

export function PartnerCard({ variant, partner, pairStat }: PartnerCardProps) {
  const winRate = Math.round((pairStat.wins / pairStat.matchesPlayed) * 100);
  const isBest = variant === 'best';
  const headline = isBest ? '🤝 Mejor compañero' : '😬 Peor compañero';
  const avatarGradient = isBest
    ? 'from-green-400 to-green-600'
    : 'from-red-400 to-red-500';
  const winRateColor = isBest
    ? winRate >= 60 ? 'text-green-600' : 'text-gray-700'
    : winRate < 40 ? 'text-red-500' : 'text-gray-700';

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <p className="text-xs font-black text-gray-500 uppercase tracking-widest mb-4">{headline}</p>
      <Link href={`/players/${partner.id}`} className="flex items-center justify-between hover:opacity-80 transition-opacity">
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${avatarGradient} flex items-center justify-center text-white text-xl font-black shadow-sm`}>
            {partner.name.charAt(0)}
          </div>
          <div>
            <p className="font-black text-gray-800">{partner.name}</p>
            <p className="text-xs text-gray-400">{pairStat.matchesPlayed} partidos juntos</p>
          </div>
        </div>
        <div className="text-right">
          <p className={`text-2xl font-black tabular-nums ${winRateColor}`}>{winRate}%</p>
          <p className="text-xs text-gray-400">{pairStat.wins}V · {pairStat.losses}D</p>
        </div>
      </Link>
    </div>
  );
}
