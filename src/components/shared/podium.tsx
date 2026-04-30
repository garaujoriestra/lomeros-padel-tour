import Link from 'next/link';
import type { RankGroup } from '@/lib/rankings/podium-groups';

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
  /** Up to 3 rank groups in descending order (group[0] = top step). */
  groups: RankGroup<PodiumPlayer>[];
  /**
   * 'home' shows V/D pills inside each card (used on the homepage).
   * 'rankings' shows winrate% · matchesPlayed (used on the rankings page).
   */
  variant: 'home' | 'rankings';
}

type StepTone = 'gold' | 'silver' | 'bronze';

const TONE_STYLES: Record<
  StepTone,
  {
    card: string;
    avatar: string;
    name: string;
    nickname: string;
    elo: string;
    eloLabel: string;
    footer: string;
    bar: string;
    emoji: string;
    medalSize: string;
    cardPadding: string;
    rankFontSize: string;
    rankBarPadding: string;
  }
> = {
  gold: {
    card: 'bg-gradient-to-b from-amber-200 via-amber-400 to-amber-600 ring-2 ring-amber-400/40 shadow-2xl shadow-amber-300/50',
    avatar: 'bg-white/30 border-white/50',
    name: 'text-amber-950',
    nickname: 'text-amber-800',
    elo: 'text-amber-950',
    eloLabel: 'text-amber-700',
    footer: 'text-amber-900',
    bar: 'bg-amber-700',
    emoji: '👑',
    medalSize: 'text-4xl sm:text-5xl drop-shadow-lg',
    cardPadding: 'px-3 sm:px-5 pt-5 sm:pt-7',
    rankFontSize: 'text-xl sm:text-2xl',
    rankBarPadding: 'py-2.5 sm:py-3',
  },
  silver: {
    card: 'bg-gradient-to-b from-slate-200 via-slate-300 to-slate-500 shadow-xl shadow-slate-300/40',
    avatar: 'bg-white/30 border-white/40',
    name: 'text-slate-900',
    nickname: 'text-slate-600',
    elo: 'text-slate-800',
    eloLabel: 'text-slate-500',
    footer: 'text-slate-700',
    bar: 'bg-slate-600',
    emoji: '🥈',
    medalSize: 'text-2xl sm:text-3xl',
    cardPadding: 'px-3 sm:px-4 pt-4 sm:pt-5',
    rankFontSize: 'text-lg sm:text-xl',
    rankBarPadding: 'py-2 sm:py-2.5',
  },
  bronze: {
    card: 'bg-gradient-to-b from-orange-200 via-orange-400 to-orange-600 shadow-xl shadow-orange-200/40',
    avatar: 'bg-white/25 border-white/30',
    name: 'text-orange-950',
    nickname: 'text-orange-700',
    elo: 'text-orange-950',
    eloLabel: 'text-orange-700',
    footer: 'text-orange-900',
    bar: 'bg-orange-700',
    emoji: '🥉',
    medalSize: 'text-xl sm:text-2xl',
    cardPadding: 'px-3 sm:px-4 pt-3 sm:pt-4',
    rankFontSize: 'text-lg sm:text-xl',
    rankBarPadding: 'py-1.5 sm:py-2',
  },
};

const STEP_LAYOUT: Record<StepTone, string> = {
  gold: 'max-w-[215px] -mb-3',
  silver: 'max-w-[185px]',
  bronze: 'max-w-[165px] mt-6 sm:mt-8',
};

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

function SinglePlayerCard({
  player,
  rank,
  tone,
  variant,
}: {
  player: PodiumPlayer;
  rank: number;
  tone: StepTone;
  variant: 'home' | 'rankings';
}) {
  const t = TONE_STYLES[tone];
  const isGold = tone === 'gold';
  const avatarSize = isGold
    ? 'w-14 h-14 sm:w-16 sm:h-16 text-2xl sm:text-3xl'
    : tone === 'silver'
      ? 'w-12 h-12 sm:w-14 sm:h-14 text-xl sm:text-2xl'
      : 'w-10 h-10 sm:w-12 sm:h-12 text-lg sm:text-xl';
  const nameSize = isGold ? 'text-sm sm:text-base' : 'text-xs sm:text-sm';
  const eloSize = isGold
    ? 'text-3xl sm:text-4xl'
    : tone === 'silver'
      ? 'text-2xl sm:text-3xl'
      : 'text-xl sm:text-2xl';
  return (
    <Link href={`/players/${player.id}`} className={`flex-1 min-w-0 group ${STEP_LAYOUT[tone]}`}>
      <div className={`${t.card} rounded-2xl ${t.cardPadding} pb-0 flex flex-col items-center gap-1.5 sm:gap-2 group-hover:scale-105 transition-transform`}>
        <span className={t.medalSize}>{t.emoji}</span>
        <div className={`${avatarSize} rounded-full ${t.avatar} flex items-center justify-center font-black border-2`}>
          {player.name.charAt(0)}
        </div>
        <p className={`font-black ${nameSize} text-center ${t.name} leading-tight w-full truncate`}>{player.name}</p>
        {player.nickname && <p className={`${t.nickname} text-xs truncate w-full text-center`}>{player.nickname}</p>}
        <p className={`${eloSize} font-black ${t.elo} tabular-nums`}>{Math.round(player.eloRating)}</p>
        <p className={`${t.eloLabel} text-xs uppercase tracking-widest -mt-1`}>ELO</p>
        <div className={t.footer}>{renderFooter(player, variant)}</div>
        <div className={`w-full ${t.bar} rounded-b-xl ${t.rankBarPadding} text-center font-black ${t.rankFontSize} text-white`}>
          {rank}
        </div>
      </div>
    </Link>
  );
}

function TiedPlayersCard({
  players,
  rank,
  tone,
  variant,
}: {
  players: PodiumPlayer[];
  rank: number;
  tone: StepTone;
  variant: 'home' | 'rankings';
}) {
  const t = TONE_STYLES[tone];
  const isGold = tone === 'gold';
  const isSilver = tone === 'silver';
  const sharedElo = Math.round(players[0].eloRating);

  // Slightly smaller avatars than the single-player card so two fit nicely.
  const avatarSize = isGold
    ? 'w-12 h-12 sm:w-14 sm:h-14 text-xl sm:text-2xl'
    : isSilver
      ? 'w-10 h-10 sm:w-12 sm:h-12 text-lg sm:text-xl'
      : 'w-9 h-9 sm:w-10 sm:h-10 text-base sm:text-lg';
  const eloSize = isGold
    ? 'text-3xl sm:text-4xl'
    : isSilver
      ? 'text-2xl sm:text-3xl'
      : 'text-xl sm:text-2xl';
  const nameSize = isGold ? 'text-sm sm:text-base' : 'text-xs sm:text-sm';

  return (
    <div className={`flex-1 min-w-0 ${STEP_LAYOUT[tone]}`}>
      <div className={`${t.card} rounded-2xl ${t.cardPadding} pb-0 flex flex-col items-center gap-1.5 sm:gap-2`}>
        <span className={t.medalSize}>{t.emoji}</span>

        {/* Side-by-side avatars (each is its own link) */}
        <div className="flex items-center justify-center gap-1.5 sm:gap-2">
          {players.map((player) => (
            <Link key={player.id} href={`/players/${player.id}`} className="shrink-0">
              <div
                className={`${avatarSize} rounded-full ${t.avatar} flex items-center justify-center font-black border-2 hover:scale-105 transition-transform`}
              >
                {player.name.charAt(0)}
              </div>
            </Link>
          ))}
        </div>

        {/* Shared ELO (the whole point of the tie) */}
        <p className={`${eloSize} font-black ${t.elo} tabular-nums`}>{sharedElo}</p>
        <p className={`${t.eloLabel} text-[10px] sm:text-xs uppercase tracking-widest -mt-1`}>
          ELO · Empate
        </p>

        {/* Player names + per-player stats, full width, clean and readable */}
        <div className="w-full flex flex-col gap-0.5 pb-2">
          {players.map((player) => {
            const winRate = player.matchesPlayed > 0
              ? Math.round((player.wins / player.matchesPlayed) * 100)
              : 0;
            const stats = variant === 'home'
              ? `${player.wins}V · ${player.losses}D`
              : `${winRate}% · ${player.matchesPlayed}P`;
            return (
              <Link
                key={player.id}
                href={`/players/${player.id}`}
                className="block hover:opacity-80 transition-opacity text-center"
              >
                <p className={`${nameSize} font-black ${t.name} leading-tight truncate`}>
                  {player.name}
                </p>
                <p className={`${t.footer} text-[10px] sm:text-xs font-semibold leading-tight`}>
                  {stats}
                </p>
              </Link>
            );
          })}
        </div>

        <div className={`w-full ${t.bar} rounded-b-xl ${t.rankBarPadding} text-center font-black ${t.rankFontSize} text-white`}>
          {rank}
        </div>
      </div>
    </div>
  );
}

function Step({
  group,
  tone,
  variant,
}: {
  group: RankGroup<PodiumPlayer> | undefined;
  tone: StepTone;
  variant: 'home' | 'rankings';
}) {
  if (!group || group.players.length === 0) return <div className={`flex-1 min-w-0 ${STEP_LAYOUT[tone]}`} />;
  if (group.players.length === 1) {
    return <SinglePlayerCard player={group.players[0]} rank={group.rank} tone={tone} variant={variant} />;
  }
  return <TiedPlayersCard players={group.players} rank={group.rank} tone={tone} variant={variant} />;
}

export function Podium({ groups, variant }: PodiumProps) {
  if (groups.length === 0) return null;
  const [gold, silver, bronze] = groups;
  return (
    <div className="flex items-end justify-center gap-2 sm:gap-3 md:gap-6">
      <Step group={silver} tone="silver" variant={variant} />
      <Step group={gold} tone="gold" variant={variant} />
      <Step group={bronze} tone="bronze" variant={variant} />
    </div>
  );
}
