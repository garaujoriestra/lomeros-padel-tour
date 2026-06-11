import Link from 'next/link';
import { EloChart } from '@/components/charts/elo-chart';
import { EloSparkline } from '@/components/charts/elo-sparkline';
import { PartnerCard } from '@/components/shared/partner-card';
import { UnplayedPartnersCard } from '@/components/shared/unplayed-partners-card';
import { AchievementsCard } from '@/components/shared/achievements-card';
import { PlayerAvatar } from '@/components/shared/player-avatar';
import type { RivalryStats } from '@/lib/rating/head-to-head';
import type { PlayerProfileData } from '@/lib/players/profile-data';

export function PlayerProfileView({ data, editable = false }: { data: PlayerProfileData; editable?: boolean }) {
  const {
    player,
    completedMatches,
    playerMap,
    playerRankEvents,
    recentForm,
    winRate,
    bestPartner,
    bestPartnerPlayer,
    worstPartner,
    worstPartnerPlayer,
    showWorstCard,
    unplayed,
    totalCandidates,
    earnedGrants,
    sideStats,
    hasSideData,
    driveBetter,
    rivalries,
    chartData,
    eloChange,
    eloChangeByMatch,
    streak,
  } = data;
  const id = player.id;

  return (
    <div className="space-y-6">

      {editable && (
        <div className="flex justify-end">
          <Link
            href="/me/edit"
            className="inline-flex items-center min-h-[40px] px-4 rounded-full text-sm font-semibold bg-green-600 text-white hover:bg-green-700 transition-colors"
          >
            ✏️ Editar perfil
          </Link>
        </div>
      )}

      {/* ── PROFILE HEADER ── */}
      <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-br from-green-950 via-green-900 to-emerald-800 text-white shadow-2xl">
        <div className="absolute top-0 right-0 w-80 h-80 bg-green-400/10 rounded-full -translate-y-1/2 translate-x-1/3 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-60 h-60 bg-emerald-400/10 rounded-full translate-y-1/2 -translate-x-1/4 blur-3xl" />
        <div className="relative p-5 sm:p-8 md:p-10">
          <div className="flex flex-col sm:flex-row items-center sm:items-start text-center sm:text-left gap-4 sm:gap-6">
            {/* Avatar */}
            <PlayerAvatar
              name={player.name}
              avatarUrl={player.avatarUrl}
              className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl shadow-xl"
              fallbackClassName="bg-white/10 border-2 border-white/20 text-4xl sm:text-5xl font-black text-white"
              sizes="96px"
            />
            {/* Info */}
            <div className="flex-1 min-w-0 w-full">
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight sm:truncate">{player.name}</h1>
              {player.nickname && (
                <p className="text-green-300 text-base sm:text-lg font-medium mt-0.5">&ldquo;{player.nickname}&rdquo;</p>
              )}
              <div className="flex flex-wrap gap-2 mt-3 justify-center sm:justify-start">
                <span className="px-3 py-1 rounded-full bg-white/10 border border-white/20 text-sm font-bold">
                  ELO {Math.round(player.eloRating)}
                  <span className={`ml-1.5 text-xs font-black ${eloChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {eloChange >= 0 ? '+' : ''}{eloChange}
                  </span>
                </span>
                {player.isLeftHanded && (
                  <span className="px-3 py-1 rounded-full bg-blue-500/20 border border-blue-400/40 text-blue-300 text-sm font-bold">
                    🤚 Zurdo
                  </span>
                )}
                {streak.count > 1 && (
                  <span className={`px-3 py-1 rounded-full text-sm font-bold ${streak.type === 'W' ? 'bg-green-500/20 border border-green-400/40 text-green-300' : 'bg-red-500/20 border border-red-400/40 text-red-300'}`}>
                    {streak.type === 'W' ? '🔥' : '❄️'} Racha {streak.count} {streak.type === 'W' ? 'victorias' : 'derrotas'}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Stats row — 2x2 on mobile, 4 cols ≥sm */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mt-6 sm:mt-8 pt-6 sm:pt-8 border-t border-white/10">
            <div className="text-center">
              <div className="flex items-center justify-center gap-2">
                <p className="text-2xl sm:text-3xl md:text-4xl font-black text-white tabular-nums">{Math.round(player.eloRating)}</p>
                {chartData.length >= 2 && <EloSparkline data={chartData} />}
              </div>
              <p className="text-green-300 text-xs uppercase tracking-widest mt-1">ELO</p>
            </div>
            <div className="text-center">
              <p className="text-2xl sm:text-3xl md:text-4xl font-black text-white tabular-nums">{player.matchesPlayed}</p>
              <p className="text-green-300 text-xs uppercase tracking-widest mt-1">Partidos</p>
            </div>
            <div className="text-center">
              <p className="text-2xl sm:text-3xl md:text-4xl font-black text-green-400 tabular-nums">{player.wins}</p>
              <p className="text-green-300 text-xs uppercase tracking-widest mt-1">Victorias</p>
            </div>
            <div className="text-center">
              <p className="text-2xl sm:text-3xl md:text-4xl font-black text-red-400 tabular-nums">{player.losses}</p>
              <p className="text-green-300 text-xs uppercase tracking-widest mt-1">Derrotas</p>
            </div>
          </div>
        </div>
      </div>

      {/* Win% bar */}
      {player.matchesPlayed > 0 && (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div className="flex justify-between items-center mb-3">
            <span className="text-sm font-black text-gray-600 uppercase tracking-wider">Win Rate</span>
            <span className={`text-2xl font-black tabular-nums ${winRate >= 60 ? 'text-green-600' : winRate >= 40 ? 'text-yellow-600' : 'text-red-500'}`}>
              {winRate}%
            </span>
          </div>
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${winRate >= 60 ? 'bg-gradient-to-r from-green-400 to-green-600' : winRate >= 40 ? 'bg-gradient-to-r from-yellow-400 to-yellow-500' : 'bg-gradient-to-r from-red-400 to-red-500'}`}
              style={{ width: `${winRate}%` }}
            />
          </div>
          <div className="flex justify-between mt-1.5 text-xs text-gray-400 font-medium">
            <span>{player.wins}V</span>
            <span>{player.losses}D</span>
          </div>
        </div>
      )}

      {/* Recent form */}
      {recentForm.length > 0 && (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <p className="text-xs font-black text-gray-500 uppercase tracking-widest mb-4">Forma reciente</p>
          <div className="flex gap-2 flex-wrap">
            {recentForm.map((result, i) => (
              <div
                key={i}
                className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black text-white shadow-sm ${
                  result === 'W'
                    ? 'bg-gradient-to-br from-green-400 to-green-600 shadow-green-200'
                    : 'bg-gradient-to-br from-red-400 to-red-500 shadow-red-200'
                }`}
              >
                {result}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Elo chart */}
      {chartData.length > 1 && (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-black text-gray-500 uppercase tracking-widest">📈 Evolución del Rating</p>
            <span className={`text-sm font-black ${eloChange >= 0 ? 'text-green-500' : 'text-red-400'}`}>
              {eloChange >= 0 ? '↗' : '↘'} {eloChange >= 0 ? '+' : ''}{eloChange} desde inicial
            </span>
          </div>
          <EloChart data={chartData} rankEvents={playerRankEvents} />
        </div>
      )}

      {/* Best partner + (optional) Worst partner */}
      {bestPartnerPlayer && bestPartner && (
        <div className={`grid gap-4 ${showWorstCard ? 'sm:grid-cols-2' : ''}`}>
          <PartnerCard variant="best" partner={bestPartnerPlayer} pairStat={bestPartner} />
          {showWorstCard && worstPartner && worstPartnerPlayer && (
            <PartnerCard variant="worst" partner={worstPartnerPlayer} pairStat={worstPartner} />
          )}
        </div>
      )}

      <UnplayedPartnersCard unplayed={unplayed} totalCandidates={totalCandidates} />

      <AchievementsCard
        earned={earnedGrants.map((g) => ({ achievementId: g.achievementId, earnedAt: g.earnedAt }))}
      />

      {/* Court side stats */}
      {hasSideData && (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <p className="text-xs font-black text-gray-500 uppercase tracking-widest mb-4">🎾 Lado de pista</p>
          <div className="grid grid-cols-2 gap-4">
            <SideStatBlock label="Drive" emoji="🟦" stats={sideStats.drive} highlight={driveBetter && sideStats.drive.matches > 0} />
            <SideStatBlock label="Revés" emoji="🟪" stats={sideStats.reves} highlight={!driveBetter && sideStats.reves.matches > 0} />
          </div>
        </div>
      )}

      {/* Head-to-head per rival */}
      {rivalries.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50">
            <p className="text-xs font-black text-gray-500 uppercase tracking-widest">🤜 Head-to-head</p>
          </div>
          <div className="divide-y divide-gray-50">
            {rivalries.map((r) => (
              <RivalryRow key={r.opponentId} rivalry={r} />
            ))}
          </div>
        </div>
      )}

      {/* Match history */}
      {completedMatches.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50">
            <p className="text-xs font-black text-gray-500 uppercase tracking-widest">Historial de partidos</p>
          </div>
          <div className="divide-y divide-gray-50">
            {completedMatches.slice(0, 10).map((match) => {
              const isTeam1 = match.team1Player1Id === id || match.team1Player2Id === id;
              const won = (isTeam1 && match.winnerTeam === 1) || (!isTeam1 && match.winnerTeam === 2);
              const partnerId = isTeam1
                ? (match.team1Player1Id === id ? match.team1Player2Id : match.team1Player1Id)
                : (match.team2Player1Id === id ? match.team2Player2Id : match.team2Player1Id);
              const partner = playerMap[partnerId];
              const opponents = isTeam1
                ? [playerMap[match.team2Player1Id], playerMap[match.team2Player2Id]]
                : [playerMap[match.team1Player1Id], playerMap[match.team1Player2Id]];
              const delta = eloChangeByMatch[match.id];
              return (
                <Link
                  key={match.id}
                  href={`/matches/${match.id}`}
                  className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 hover:bg-gray-50/50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black text-white shadow-sm shrink-0 ${won ? 'bg-gradient-to-br from-green-400 to-green-600' : 'bg-gradient-to-br from-red-400 to-red-500'}`}>
                      {won ? 'V' : 'D'}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm text-gray-700 font-medium truncate">
                        <span className="text-gray-400">con</span> {partner?.name ?? '?'}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        <span className="text-gray-400">vs</span> {opponents.map((p) => p?.name ?? '?').join(' & ')}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end shrink-0">
                    {delta != null && (
                      <span className={`text-sm font-black tabular-nums ${delta >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {delta >= 0 ? '+' : ''}{delta}
                      </span>
                    )}
                    <span className="text-xs text-gray-400 font-medium">{match.date}</span>
                  </div>
                </Link>
              );
            })}
          </div>
          {completedMatches.length > 10 && (
            <div className="px-5 py-3 border-t border-gray-50 text-center">
              <Link href="/matches" className="text-xs font-bold text-green-700 hover:text-green-900 transition-colors">
                Ver todos los partidos →
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SideStatBlock({ label, emoji, stats, highlight }: {
  label: string;
  emoji: string;
  stats: { matches: number; wins: number; losses: number; winRate: number };
  highlight: boolean;
}) {
  if (stats.matches === 0) {
    return (
      <div className="rounded-xl border border-gray-100 p-4 text-center text-gray-400">
        <p className="text-2xl mb-1">{emoji}</p>
        <p className="font-black text-xs uppercase tracking-wider mb-1">{label}</p>
        <p className="text-sm">Sin datos</p>
      </div>
    );
  }
  const winPct = Math.round(stats.winRate * 100);
  const colorClass = winPct >= 60 ? 'text-green-600' : winPct >= 40 ? 'text-yellow-600' : 'text-red-500';
  return (
    <div className={`rounded-xl p-4 text-center ${highlight ? 'border-2 border-green-300 bg-green-50/30' : 'border border-gray-100'}`}>
      <p className="text-2xl mb-1">{emoji}</p>
      <p className="font-black text-xs uppercase tracking-wider mb-1 text-gray-600">{label}</p>
      <p className={`text-2xl font-black tabular-nums ${colorClass}`}>{winPct}%</p>
      <p className="text-xs text-gray-400 mt-0.5">{stats.matches}P · {stats.wins}V {stats.losses}D</p>
      {highlight && <p className="text-[10px] text-green-700 font-bold mt-1">↑ Tu mejor lado</p>}
    </div>
  );
}

function RivalryRow({ rivalry }: { rivalry: RivalryStats }) {
  const winPct = Math.round(rivalry.winRate * 100);
  const colorClass = winPct >= 60 ? 'text-green-600' : winPct >= 40 ? 'text-yellow-600' : 'text-red-500';
  return (
    <Link href={`/players/${rivalry.opponentId}`} className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 hover:bg-gray-50/50 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <PlayerAvatar
          name={rivalry.opponentName}
          avatarUrl={rivalry.opponentAvatarUrl}
          className="w-8 h-8 rounded-full"
          fallbackClassName="bg-gradient-to-br from-gray-300 to-gray-400 text-white text-sm font-black"
          sizes="32px"
        />
        <span className="text-sm font-bold text-gray-800 truncate">{rivalry.opponentName}</span>
      </div>
      <div className="flex items-center gap-3 sm:gap-4 shrink-0">
        <span className="text-xs text-gray-400 tabular-nums">{rivalry.matches}P</span>
        <span className="text-xs font-bold text-green-600 tabular-nums">{rivalry.wins}V</span>
        <span className="text-xs font-bold text-red-400 tabular-nums">{rivalry.losses}D</span>
        <span className={`text-sm font-black tabular-nums w-12 text-right ${colorClass}`}>{winPct}%</span>
      </div>
    </Link>
  );
}
