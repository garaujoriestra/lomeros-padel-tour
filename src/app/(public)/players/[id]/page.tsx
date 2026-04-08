import { db } from '@/lib/db';
import { players, matches, ratingHistory, pairStats } from '@/lib/db/schema';
import { eq, or, desc, sql } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { EloChart } from '@/components/charts/elo-chart';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function PlayerProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [player] = await db.select().from(players).where(eq(players.id, id));
  if (!player) notFound();

  const playerMatches = await db
    .select()
    .from(matches)
    .where(
      or(
        eq(matches.team1Player1Id, id),
        eq(matches.team1Player2Id, id),
        eq(matches.team2Player1Id, id),
        eq(matches.team2Player2Id, id)
      )
    )
    .orderBy(desc(matches.date));

  const completedMatches = playerMatches.filter((m) => m.status === 'completed');

  const history = await db
    .select()
    .from(ratingHistory)
    .where(eq(ratingHistory.playerId, id))
    .orderBy(ratingHistory.recordedAt);

  const pairs = await db
    .select()
    .from(pairStats)
    .where(or(eq(pairStats.player1Id, id), eq(pairStats.player2Id, id)))
    .orderBy(desc(pairStats.wins));

  const allPlayers = await db.select().from(players);
  const playerMap = Object.fromEntries(allPlayers.map((p) => [p.id, p]));

  const recentForm = completedMatches.slice(0, 8).map((m) => {
    const isTeam1 = m.team1Player1Id === id || m.team1Player2Id === id;
    return (isTeam1 && m.winnerTeam === 1) || (!isTeam1 && m.winnerTeam === 2) ? 'W' : 'L';
  });

  const winRate = player.matchesPlayed > 0
    ? Math.round((player.wins / player.matchesPlayed) * 100)
    : 0;

  const bestPartner = pairs
    .filter((p) => p.matchesPlayed >= 2)
    .sort((a, b) => (b.wins / b.matchesPlayed) - (a.wins / a.matchesPlayed))[0];
  const bestPartnerPlayer = bestPartner
    ? playerMap[bestPartner.player1Id === id ? bestPartner.player2Id : bestPartner.player1Id]
    : null;

  const chartData = history.map((h, i) => ({ partido: i + 1, elo: Math.round(h.eloAfter) }));
  const eloChange = Math.round(player.eloRating - 1500);
  const streak = (() => {
    let count = 0;
    const first = recentForm[0];
    if (!first) return { type: '-', count: 0 };
    for (const r of recentForm) {
      if (r === first) count++; else break;
    }
    return { type: first, count };
  })();

  return (
    <div className="space-y-6">

      {/* ── PROFILE HEADER ── */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-green-950 via-green-900 to-emerald-800 text-white shadow-2xl">
        <div className="absolute top-0 right-0 w-80 h-80 bg-green-400/10 rounded-full -translate-y-1/2 translate-x-1/3 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-60 h-60 bg-emerald-400/10 rounded-full translate-y-1/2 -translate-x-1/4 blur-3xl" />
        <div className="relative p-8 md:p-10">
          <div className="flex items-center gap-6">
            {/* Avatar */}
            <div className="w-24 h-24 rounded-2xl bg-white/10 border-2 border-white/20 flex items-center justify-center text-5xl font-black text-white shadow-xl shrink-0">
              {player.name.charAt(0)}
            </div>
            {/* Info */}
            <div className="flex-1 min-w-0">
              <h1 className="text-3xl md:text-4xl font-black tracking-tight truncate">{player.name}</h1>
              {player.nickname && (
                <p className="text-green-300 text-lg font-medium mt-0.5">&ldquo;{player.nickname}&rdquo;</p>
              )}
              <div className="flex flex-wrap gap-2 mt-3">
                <span className="px-3 py-1 rounded-full bg-white/10 border border-white/20 text-sm font-bold">
                  ELO {Math.round(player.eloRating)}
                  <span className={`ml-1.5 text-xs font-black ${eloChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {eloChange >= 0 ? '+' : ''}{eloChange}
                  </span>
                </span>
                {streak.count > 1 && (
                  <span className={`px-3 py-1 rounded-full text-sm font-bold ${streak.type === 'W' ? 'bg-green-500/20 border border-green-400/40 text-green-300' : 'bg-red-500/20 border border-red-400/40 text-red-300'}`}>
                    {streak.type === 'W' ? '🔥' : '❄️'} Racha {streak.count} {streak.type === 'W' ? 'victorias' : 'derrotas'}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-4 gap-4 mt-8 pt-8 border-t border-white/10">
            <div className="text-center">
              <p className="text-3xl md:text-4xl font-black text-white tabular-nums">{Math.round(player.eloRating)}</p>
              <p className="text-green-300 text-xs uppercase tracking-widest mt-1">ELO</p>
            </div>
            <div className="text-center">
              <p className="text-3xl md:text-4xl font-black text-white tabular-nums">{player.matchesPlayed}</p>
              <p className="text-green-300 text-xs uppercase tracking-widest mt-1">Partidos</p>
            </div>
            <div className="text-center">
              <p className="text-3xl md:text-4xl font-black text-green-400 tabular-nums">{player.wins}</p>
              <p className="text-green-300 text-xs uppercase tracking-widest mt-1">Victorias</p>
            </div>
            <div className="text-center">
              <p className="text-3xl md:text-4xl font-black text-red-400 tabular-nums">{player.losses}</p>
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
          <EloChart data={chartData} />
        </div>
      )}

      {/* Best partner */}
      {bestPartnerPlayer && (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <p className="text-xs font-black text-gray-500 uppercase tracking-widest mb-4">🤝 Mejor compañero</p>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white text-xl font-black shadow-sm">
                {bestPartnerPlayer.name.charAt(0)}
              </div>
              <div>
                <p className="font-black text-gray-800">{bestPartnerPlayer.name}</p>
                <p className="text-xs text-gray-400">{bestPartner.matchesPlayed} partidos juntos</p>
              </div>
            </div>
            <div className="text-right">
              <p className={`text-2xl font-black tabular-nums ${Math.round((bestPartner.wins / bestPartner.matchesPlayed) * 100) >= 60 ? 'text-green-600' : 'text-gray-700'}`}>
                {Math.round((bestPartner.wins / bestPartner.matchesPlayed) * 100)}%
              </p>
              <p className="text-xs text-gray-400">{bestPartner.wins}V · {bestPartner.losses}D</p>
            </div>
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
              const opponents = isTeam1
                ? [playerMap[match.team2Player1Id], playerMap[match.team2Player2Id]]
                : [playerMap[match.team1Player1Id], playerMap[match.team1Player2Id]];
              return (
                <div key={match.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black text-white shadow-sm ${won ? 'bg-gradient-to-br from-green-400 to-green-600' : 'bg-gradient-to-br from-red-400 to-red-500'}`}>
                      {won ? 'V' : 'D'}
                    </div>
                    <span className="text-xs text-gray-400 font-medium">{match.date}</span>
                  </div>
                  <span className="text-sm text-gray-600 font-medium">
                    vs {opponents.map((p) => p?.name ?? '?').join(' & ')}
                  </span>
                </div>
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
