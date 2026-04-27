import Link from 'next/link';

interface PodiumPlayer {
  id: string;
  name: string;
  nickname?: string | null;
  eloRating: number;
  wins: number;
  losses: number;
  matchesPlayed: number;
}

interface PodiumProps {
  /** Expected: at least 3 players (index 0 = gold, 1 = silver, 2 = bronze). Renders nothing if fewer. */
  players: PodiumPlayer[];
  /**
   * 'home' shows V/D pills inside each card (used on the homepage).
   * 'rankings' shows winrate% · matchesPlayed (used on the rankings page).
   */
  variant: 'home' | 'rankings';
}

function renderFooter(p: PodiumPlayer, variant: 'home' | 'rankings') {
  if (variant === 'home') {
    return (
      <div className="text-xs flex gap-2 sm:gap-3 pb-3 font-semibold">
        <span>✅ {p.wins}V</span>
        <span>❌ {p.losses}D</span>
      </div>
    );
  }
  const winRate = p.matchesPlayed > 0 ? Math.round((p.wins / p.matchesPlayed) * 100) : 0;
  return (
    <p className="text-xs pb-3 font-semibold">
      {winRate}% · {p.matchesPlayed}P
    </p>
  );
}

export function Podium({ players, variant }: PodiumProps) {
  const [first, second, third] = players;
  if (!first || !second || !third) return null;

  return (
    <div className="flex items-end justify-center gap-2 sm:gap-3 md:gap-6">
      {/* #2 Silver */}
      <Link href={`/players/${second.id}`} className="flex-1 max-w-[185px] min-w-0 group">
        <div className="bg-gradient-to-b from-slate-200 via-slate-300 to-slate-500 rounded-2xl px-3 sm:px-4 pt-4 sm:pt-5 pb-0 shadow-xl shadow-slate-300/40 flex flex-col items-center gap-1.5 sm:gap-2 group-hover:scale-105 transition-transform">
          <span className="text-2xl sm:text-3xl">🥈</span>
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-white/30 flex items-center justify-center text-xl sm:text-2xl font-black border-2 border-white/40">
            {second.name.charAt(0)}
          </div>
          <p className="font-black text-xs sm:text-sm text-center text-slate-900 leading-tight w-full truncate">{second.name}</p>
          {second.nickname && <p className="text-slate-600 text-xs truncate w-full text-center">{second.nickname}</p>}
          <p className="text-2xl sm:text-3xl font-black text-slate-800 tabular-nums">{Math.round(second.eloRating)}</p>
          <p className="text-slate-500 text-xs uppercase tracking-widest -mt-1">ELO</p>
          <div className="text-slate-700">
            {renderFooter(second, variant)}
          </div>
          <div className="w-full bg-slate-600 rounded-b-xl py-2 sm:py-2.5 text-center font-black text-lg sm:text-xl text-white">2</div>
        </div>
      </Link>

      {/* #1 Gold (taller) */}
      <Link href={`/players/${first.id}`} className="flex-1 max-w-[215px] min-w-0 group -mb-3">
        <div className="bg-gradient-to-b from-amber-200 via-amber-400 to-amber-600 rounded-2xl px-3 sm:px-5 pt-5 sm:pt-7 pb-0 shadow-2xl shadow-amber-300/50 flex flex-col items-center gap-1.5 sm:gap-2 ring-2 ring-amber-400/40 group-hover:scale-105 transition-transform">
          <span className="text-4xl sm:text-5xl drop-shadow-lg">👑</span>
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-white/30 flex items-center justify-center text-2xl sm:text-3xl font-black border-2 border-white/50">
            {first.name.charAt(0)}
          </div>
          <p className="font-black text-sm sm:text-base text-center text-amber-950 leading-tight w-full truncate">{first.name}</p>
          {first.nickname && <p className="text-amber-800 text-xs truncate w-full text-center">{first.nickname}</p>}
          <p className="text-3xl sm:text-4xl font-black text-amber-950 tabular-nums">{Math.round(first.eloRating)}</p>
          <p className="text-amber-700 text-xs uppercase tracking-widest -mt-1">ELO</p>
          <div className="text-amber-900">
            {renderFooter(first, variant)}
          </div>
          <div className="w-full bg-amber-700 rounded-b-xl py-2.5 sm:py-3 text-center font-black text-xl sm:text-2xl text-white">1</div>
        </div>
      </Link>

      {/* #3 Bronze */}
      <Link href={`/players/${third.id}`} className="flex-1 max-w-[165px] min-w-0 group">
        <div className="bg-gradient-to-b from-orange-200 via-orange-400 to-orange-600 rounded-2xl px-3 sm:px-4 pt-3 sm:pt-4 pb-0 shadow-xl shadow-orange-200/40 flex flex-col items-center gap-1 sm:gap-1.5 group-hover:scale-105 transition-transform mt-6 sm:mt-8">
          <span className="text-xl sm:text-2xl">🥉</span>
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white/25 flex items-center justify-center text-lg sm:text-xl font-black border-2 border-white/30">
            {third.name.charAt(0)}
          </div>
          <p className="font-black text-xs sm:text-sm text-center text-orange-950 leading-tight w-full truncate">{third.name}</p>
          {third.nickname && <p className="text-orange-700 text-xs truncate w-full text-center">{third.nickname}</p>}
          <p className="text-xl sm:text-2xl font-black text-orange-950 tabular-nums">{Math.round(third.eloRating)}</p>
          <p className="text-orange-700 text-xs uppercase tracking-widest -mt-1">ELO</p>
          <div className="text-orange-900">
            {renderFooter(third, variant)}
          </div>
          <div className="w-full bg-orange-700 rounded-b-xl py-1.5 sm:py-2 text-center font-black text-lg sm:text-xl text-white">3</div>
        </div>
      </Link>
    </div>
  );
}
