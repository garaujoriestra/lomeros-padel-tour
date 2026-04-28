import { db } from '@/lib/db';
import { players, matches, matchSets } from '@/lib/db/schema';
import { desc, sql, eq, inArray } from 'drizzle-orm';
import Link from 'next/link';
import { Podium } from '@/components/shared/podium';
import { MatchCard } from '@/components/shared/match-card';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const [topPlayers, recentMatches, upcomingMatches, [totalMatchesRow], [totalPlayersRow]] = await Promise.all([
    db.select().from(players)
      .where(sql`${players.matchesPlayed} > 0`)
      .orderBy(desc(players.eloRating))
      .limit(5),
    db.select().from(matches).where(eq(matches.status, 'completed')).orderBy(desc(matches.date)).limit(4),
    db.select().from(matches).where(eq(matches.status, 'scheduled')).orderBy(matches.date).limit(3),
    db.select({ count: sql<number>`count(*)` }).from(matches),
    db.select({ count: sql<number>`count(*)` }).from(players).where(sql`${players.matchesPlayed} > 0`),
  ]);

  const totalMatches = totalMatchesRow.count;
  const totalPlayers = totalPlayersRow.count;

  const recentMatchIds = recentMatches.map((m) => m.id);
  const allSets = recentMatchIds.length > 0
    ? await db.select().from(matchSets).where(inArray(matchSets.matchId, recentMatchIds))
    : [];
  const allPlayers = await db.select().from(players);
  const playerMap = Object.fromEntries(allPlayers.map((p) => [p.id, p]));
  const setsMap: Record<string, typeof allSets> = {};
  for (const set of allSets) {
    if (!setsMap[set.matchId]) setsMap[set.matchId] = [];
    setsMap[set.matchId].push(set);
    setsMap[set.matchId].sort((a, b) => a.setNumber - b.setNumber);
  }

  return (
    <div className="space-y-10">

      {/* ── HERO ── */}
      <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-br from-green-950 via-green-900 to-emerald-800 p-5 sm:p-8 md:p-14 text-white shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-green-400/10 rounded-full -translate-y-1/2 translate-x-1/3 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-72 h-72 bg-emerald-400/10 rounded-full translate-y-1/2 -translate-x-1/4 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_30%,rgba(74,222,128,0.07)_0%,transparent_60%)]" />
        <div className="relative text-center space-y-3">
          <div className="text-5xl sm:text-6xl md:text-8xl mb-2 drop-shadow-2xl">🎾</div>
          <h1 className="text-3xl sm:text-4xl md:text-6xl font-black tracking-tight">
            LOMEROS <span className="text-green-400">PADEL TOUR</span>
          </h1>
          <p className="text-green-200 text-sm sm:text-base md:text-lg font-medium tracking-widest uppercase">
            El ranking oficial del grupo · LPT
          </p>
          <div className="flex justify-center gap-4 sm:gap-6 md:gap-16 mt-6 sm:mt-8 pt-6 sm:pt-8 border-t border-white/10">
            <div className="text-center">
              <p className="text-2xl sm:text-3xl md:text-5xl font-black text-green-400 tabular-nums">{totalMatches}</p>
              <p className="text-green-300 text-[10px] sm:text-xs md:text-sm mt-1 uppercase tracking-widest">Partidos</p>
            </div>
            <div className="w-px bg-white/10" />
            <div className="text-center">
              <p className="text-2xl sm:text-3xl md:text-5xl font-black text-green-400 tabular-nums">{totalPlayers}</p>
              <p className="text-green-300 text-[10px] sm:text-xs md:text-sm mt-1 uppercase tracking-widest">Jugadores</p>
            </div>
            <div className="w-px bg-white/10" />
            <div className="text-center">
              <p className="text-2xl sm:text-3xl md:text-5xl font-black text-green-400 tabular-nums">
                {topPlayers[0] ? Math.round(topPlayers[0].eloRating) : '—'}
              </p>
              <p className="text-green-300 text-[10px] sm:text-xs md:text-sm mt-1 uppercase tracking-widest">Elo #1</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── PODIUM ── */}
      {topPlayers.length > 0 && (
        <section className="space-y-6">
          <div className="flex items-center gap-4">
            <h2 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">🏆 CLASIFICACIÓN</h2>
            <div className="flex-1 h-px bg-gradient-to-r from-green-300/60 to-transparent" />
            <Link href="/rankings" className="text-sm font-bold text-green-700 hover:text-green-900 transition-colors">
              Ver completa →
            </Link>
          </div>

          {topPlayers.length >= 3 ? (
            <Podium players={topPlayers} variant="home" />
          ) : (
            <div className="grid gap-3">
              {topPlayers.map((player, idx) => {
                const winRate = player.matchesPlayed > 0 ? Math.round((player.wins / player.matchesPlayed) * 100) : 0;
                const gradients = [
                  'bg-gradient-to-r from-amber-50 to-amber-100 border-amber-200',
                  'bg-gradient-to-r from-slate-50 to-slate-100 border-slate-200',
                ];
                return (
                  <Link key={player.id} href={`/players/${player.id}`}>
                    <div className={`flex items-center justify-between rounded-xl p-4 border shadow-sm hover:shadow-md transition-shadow ${gradients[idx] ?? 'bg-white border-gray-100'}`}>
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{idx === 0 ? '🥇' : idx === 1 ? '🥈' : (idx + 1)}</span>
                        <div>
                          <p className="font-bold">{player.name}</p>
                          {player.nickname && <p className="text-xs text-gray-400">{player.nickname}</p>}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-black text-green-700 tabular-nums">{Math.round(player.eloRating)}</p>
                        <p className="text-xs text-gray-400">ELO · {winRate}% win</p>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* ── UPCOMING MATCHES ── */}
      {upcomingMatches.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-4">
            <h2 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">📅 PRÓXIMOS PARTIDOS</h2>
            <div className="flex-1 h-px bg-gradient-to-r from-blue-300/60 to-transparent" />
            <Link href="/matches" className="text-sm font-bold text-blue-700 hover:text-blue-900 transition-colors">
              Ver todos →
            </Link>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            {upcomingMatches.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                team1={[playerMap[match.team1Player1Id], playerMap[match.team1Player2Id]]}
                team2={[playerMap[match.team2Player1Id], playerMap[match.team2Player2Id]]}
                href={`/matches/${match.id}`}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── RECENT MATCHES ── */}
      {recentMatches.length > 0 && (
        <section className="space-y-5">
          <div className="flex items-center gap-4">
            <h2 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">⚡ ÚLTIMOS PARTIDOS</h2>
            <div className="flex-1 h-px bg-gradient-to-r from-green-300/60 to-transparent" />
            <Link href="/matches" className="text-sm font-bold text-green-700 hover:text-green-900 transition-colors">
              Ver todos →
            </Link>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {recentMatches.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                team1={[playerMap[match.team1Player1Id], playerMap[match.team1Player2Id]]}
                team2={[playerMap[match.team2Player1Id], playerMap[match.team2Player2Id]]}
                sets={setsMap[match.id] ?? []}
              />
            ))}
          </div>
        </section>
      )}

      {/* Empty state */}
      {totalMatches === 0 && (
        <div className="text-center py-10 text-gray-400">
          <p className="text-xl font-medium">Aún no hay partidos registrados.</p>
          <p className="text-sm mt-2">
            <Link href="/login" className="text-green-700 font-bold hover:underline">Entra como admin</Link> para añadir jugadores y el primer partido.
          </p>
        </div>
      )}
    </div>
  );
}

