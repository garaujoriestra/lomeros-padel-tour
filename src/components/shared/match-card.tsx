import Link from 'next/link';

interface MatchPlayer {
  id: string;
  name: string;
  nickname?: string | null;
}

interface MatchSet {
  setNumber: number;
  team1Games: number;
  team2Games: number;
}

export interface MatchCardData {
  id: string;
  date: string;
  location?: string | null;
  status: string;            // 'scheduled' | 'completed' — stored as text in the DB schema
  winnerTeam?: number | null;
}

interface MatchCardProps {
  match: MatchCardData;
  team1: [MatchPlayer | undefined, MatchPlayer | undefined];
  team2: [MatchPlayer | undefined, MatchPlayer | undefined];
  sets?: MatchSet[];
  href?: string;
}

export function MatchCard({ match, team1, team2, sets = [], href }: MatchCardProps) {
  const isUpcoming = match.status === 'scheduled';
  const t1Sets = sets.filter((s) => s.team1Games > s.team2Games).length;
  const t2Sets = sets.filter((s) => s.team2Games > s.team1Games).length;
  const w1 = match.winnerTeam === 1;
  const w2 = match.winnerTeam === 2;

  const headerColors = isUpcoming
    ? 'bg-blue-50/80 border-blue-100 text-blue-700'
    : 'bg-gray-50/80 border-gray-100 text-gray-400';
  const cardBorder = isUpcoming ? 'border-blue-100 hover:border-blue-200' : 'border-gray-100';

  const card = (
    <div className={`bg-white rounded-2xl shadow-md border ${cardBorder} overflow-hidden hover:shadow-lg transition-all`}>
      {/* Header strip: date + location */}
      <div className={`px-4 sm:px-5 py-2.5 border-b flex justify-between items-center text-xs font-semibold ${headerColors}`}>
        <span>📅 {match.date}</span>
        {match.location && <span>📍 {match.location}</span>}
      </div>

      {/* Mobile (<sm): stacked layout. ≥sm: horizontal grid. */}
      <div className="p-4 sm:p-6">
        {/* Mobile stacked */}
        <div className="sm:hidden space-y-3">
          {/* Team 1 */}
          <TeamRow players={team1} winner={w1} loser={w2} align="left" upcoming={isUpcoming} />
          {/* Score / VS */}
          <div className="flex items-center justify-center gap-3">
            {isUpcoming ? (
              <div className="flex flex-col items-center gap-1">
                <span className="text-xl font-black text-blue-500">VS</span>
                <span className="text-[10px] font-bold text-blue-400 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200 uppercase tracking-wide">
                  Pendiente
                </span>
              </div>
            ) : (
              <ScoreBlock t1Sets={t1Sets} t2Sets={t2Sets} sets={sets} winner1={w1} winner2={w2} compact />
            )}
          </div>
          {/* Team 2 */}
          <TeamRow players={team2} winner={w2} loser={w1} align="right" upcoming={isUpcoming} />
        </div>

        {/* ≥sm horizontal */}
        <div className="hidden sm:grid grid-cols-[1fr_auto_1fr] gap-4 items-center">
          {/* Team 1 */}
          <div className={w2 ? 'opacity-35' : ''}>
            <div className="space-y-2">
              {team1.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${isUpcoming ? 'bg-blue-300' : w1 ? 'bg-green-500' : 'bg-gray-200'}`} />
                  <p className={`font-bold truncate ${w1 ? 'text-green-700' : 'text-gray-700'}`}>{p?.name ?? '?'}</p>
                </div>
              ))}
              {w1 && (
                <span className="inline-flex items-center gap-1 text-xs font-black text-green-600 bg-green-50 border border-green-200 rounded-full px-3 py-1">
                  ✓ GANADOR
                </span>
              )}
            </div>
          </div>

          {/* Score / VS */}
          <div className="flex flex-col items-center gap-2 min-w-[80px]">
            {isUpcoming ? (
              <>
                <span className="text-2xl font-black text-blue-500">VS</span>
                <span className="text-xs font-bold text-blue-400 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">Pendiente</span>
              </>
            ) : (
              <ScoreBlock t1Sets={t1Sets} t2Sets={t2Sets} sets={sets} winner1={w1} winner2={w2} compact={false} />
            )}
          </div>

          {/* Team 2 */}
          <div className={`text-right ${w1 ? 'opacity-35' : ''}`}>
            <div className="space-y-2">
              {team2.map((p, i) => (
                <div key={i} className="flex items-center justify-end gap-2">
                  <p className={`font-bold truncate ${w2 ? 'text-green-700' : 'text-gray-700'}`}>{p?.name ?? '?'}</p>
                  <div className={`w-2 h-2 rounded-full shrink-0 ${isUpcoming ? 'bg-red-300' : w2 ? 'bg-green-500' : 'bg-gray-200'}`} />
                </div>
              ))}
              {w2 && (
                <div className="flex justify-end">
                  <span className="inline-flex items-center gap-1 text-xs font-black text-green-600 bg-green-50 border border-green-200 rounded-full px-3 py-1">
                    ✓ GANADOR
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return href ? (
    <Link href={href} className="block">
      {card}
    </Link>
  ) : (
    card
  );
}

function TeamRow({
  players,
  winner,
  loser,
  align,
  upcoming,
}: {
  players: [MatchPlayer | undefined, MatchPlayer | undefined];
  winner: boolean;
  loser: boolean;
  align: 'left' | 'right';
  upcoming: boolean;
}) {
  const dotColor = upcoming
    ? align === 'left'
      ? 'bg-blue-300'
      : 'bg-red-300'
    : winner
      ? 'bg-green-500'
      : 'bg-gray-200';
  return (
    <div className={`${loser ? 'opacity-35' : ''}`}>
      <div className={`space-y-1.5 ${align === 'right' ? 'text-right' : ''}`}>
        {players.map((p, i) => (
          <div key={i} className={`flex items-center gap-2 ${align === 'right' ? 'justify-end' : ''}`}>
            {align === 'left' && <div className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />}
            <p className={`font-bold truncate ${winner ? 'text-green-700' : 'text-gray-700'}`}>{p?.name ?? '?'}</p>
            {align === 'right' && <div className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />}
          </div>
        ))}
        {winner && (
          <div className={align === 'right' ? 'flex justify-end' : ''}>
            <span className="inline-flex items-center gap-1 text-xs font-black text-green-600 bg-green-50 border border-green-200 rounded-full px-2.5 py-0.5">
              ✓ GANADOR
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function ScoreBlock({
  t1Sets,
  t2Sets,
  sets,
  winner1,
  winner2,
  compact,
}: {
  t1Sets: number;
  t2Sets: number;
  sets: MatchSet[];
  winner1: boolean;
  winner2: boolean;
  compact: boolean;
}) {
  return (
    <div className={`flex flex-col items-center ${compact ? 'gap-1.5' : 'gap-3'}`}>
      <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-1 sm:px-4 sm:py-2">
        <span className={`${compact ? 'text-xl' : 'text-2xl'} font-black tabular-nums ${winner1 ? 'text-green-600' : 'text-gray-300'}`}>
          {t1Sets}
        </span>
        <span className="text-gray-200 font-black">—</span>
        <span className={`${compact ? 'text-xl' : 'text-2xl'} font-black tabular-nums ${winner2 ? 'text-green-600' : 'text-gray-300'}`}>
          {t2Sets}
        </span>
      </div>
      {sets.length > 0 && (
        <div className={`flex ${compact ? 'gap-1.5' : 'gap-2'}`}>
          {sets.map((s) => (
            <div key={s.setNumber} className="flex flex-col items-center">
              <span className="text-[10px] text-gray-300 mb-0.5">S{s.setNumber}</span>
              <div className="flex items-center gap-1 font-mono text-xs sm:text-sm bg-white border border-gray-100 rounded-lg px-1.5 py-0.5 sm:px-2 sm:py-1 shadow-sm">
                <span className={s.team1Games > s.team2Games ? 'font-black text-gray-800' : 'text-gray-300'}>{s.team1Games}</span>
                <span className="text-gray-200 text-[10px]">–</span>
                <span className={s.team2Games > s.team1Games ? 'font-black text-gray-800' : 'text-gray-300'}>{s.team2Games}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
