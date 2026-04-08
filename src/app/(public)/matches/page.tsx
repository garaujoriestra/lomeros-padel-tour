import { db } from '@/lib/db';
import { matches, matchSets, players } from '@/lib/db/schema';
import { desc } from 'drizzle-orm';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function MatchesPage() {
  const allMatches = await db.select().from(matches).orderBy(desc(matches.date));
  const allSets = await db.select().from(matchSets);
  const allPlayers = await db.select().from(players);
  const playerMap = Object.fromEntries(allPlayers.map((p) => [p.id, p]));

  const setsMap: Record<string, typeof allSets> = {};
  for (const set of allSets) {
    if (!setsMap[set.matchId]) setsMap[set.matchId] = [];
    setsMap[set.matchId].push(set);
    setsMap[set.matchId].sort((a, b) => a.setNumber - b.setNumber);
  }

  const upcoming = allMatches.filter((m) => m.status === 'scheduled');
  const completed = allMatches.filter((m) => m.status === 'completed');

  return (
    <div className="space-y-8">

      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-green-950 to-emerald-900 p-8 text-white shadow-xl">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_80%_50%,rgba(74,222,128,0.08)_0%,transparent_70%)]" />
        <div className="relative flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-4xl font-black tracking-tight">⚡ PARTIDOS</h1>
            <p className="text-green-200 mt-1 font-medium">
              {completed.length} resultado{completed.length !== 1 ? 's' : ''}
              {upcoming.length > 0 && ` · ${upcoming.length} próximo${upcoming.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          {upcoming.length > 0 && (
            <span className="px-4 py-2 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-200 text-sm font-bold">
              📅 {upcoming.length} pendiente{upcoming.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {allMatches.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-6xl mb-4">🎾</p>
          <p className="text-xl font-semibold">Aún no hay partidos registrados</p>
        </div>
      ) : (
        <>
          {/* Upcoming matches */}
          {upcoming.length > 0 && (
            <section className="space-y-4">
              <h2 className="text-xl font-black text-gray-800 flex items-center gap-2">
                📅 <span>Próximos partidos</span>
              </h2>
              {upcoming.map((match) => {
                const t1p1 = playerMap[match.team1Player1Id];
                const t1p2 = playerMap[match.team1Player2Id];
                const t2p1 = playerMap[match.team2Player1Id];
                const t2p2 = playerMap[match.team2Player2Id];
                return (
                  <Link key={match.id} href={`/matches/${match.id}`} className="block">
                    <div className="bg-white rounded-2xl shadow-md border border-blue-100 overflow-hidden hover:shadow-lg hover:border-blue-200 transition-all">
                      <div className="px-5 py-2.5 bg-blue-50/80 border-b border-blue-100 flex justify-between items-center text-xs">
                        <span className="font-semibold text-blue-700">📅 {match.date}</span>
                        {match.location && <span className="font-medium text-blue-500">📍 {match.location}</span>}
                      </div>
                      <div className="grid grid-cols-[1fr_auto_1fr] p-6 gap-4 items-center">
                        <div className="space-y-1.5">
                          {[t1p1, t1p2].map((p, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-blue-300 shrink-0" />
                              <p className="font-bold text-gray-700 truncate">{p?.name ?? '?'}</p>
                            </div>
                          ))}
                        </div>
                        <div className="flex flex-col items-center gap-1 min-w-[80px]">
                          <span className="text-2xl font-black text-blue-500">VS</span>
                          <span className="text-xs font-bold text-blue-400 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">Pendiente</span>
                          <span className="text-xs text-blue-400 font-medium mt-1">Ver parejas recomendadas →</span>
                        </div>
                        <div className="space-y-1.5 text-right">
                          {[t2p1, t2p2].map((p, i) => (
                            <div key={i} className="flex items-center justify-end gap-2">
                              <p className="font-bold text-gray-700 truncate">{p?.name ?? '?'}</p>
                              <div className="w-2 h-2 rounded-full bg-red-300 shrink-0" />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </section>
          )}

          {/* Completed matches */}
          {completed.length > 0 && (
            <section className="space-y-4">
              {upcoming.length > 0 && (
                <h2 className="text-xl font-black text-gray-800">✅ Últimos resultados</h2>
              )}
              {completed.map((match) => {
                const sets = setsMap[match.id] || [];
                const t1p1 = playerMap[match.team1Player1Id];
                const t1p2 = playerMap[match.team1Player2Id];
                const t2p1 = playerMap[match.team2Player1Id];
                const t2p2 = playerMap[match.team2Player2Id];
                const t1Sets = sets.filter((s) => s.team1Games > s.team2Games).length;
                const t2Sets = sets.filter((s) => s.team2Games > s.team1Games).length;

                return (
                  <Link key={match.id} href={`/matches/${match.id}`} className="block">
                    <div className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden hover:shadow-lg transition-shadow">
                      <div className="px-5 py-2.5 bg-gray-50/80 border-b border-gray-100 flex justify-between items-center text-xs text-gray-400">
                        <span className="font-semibold">📅 {match.date}</span>
                        {match.location && <span className="font-medium">📍 {match.location}</span>}
                      </div>
                      <div className="grid grid-cols-[1fr_auto_1fr] p-6 gap-4 items-center">
                        <div className={match.winnerTeam === 2 ? 'opacity-35' : ''}>
                          <div className="space-y-2">
                            {[t1p1, t1p2].map((p, i) => (
                              <div key={i} className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full shrink-0 ${match.winnerTeam === 1 ? 'bg-green-500' : 'bg-gray-200'}`} />
                                <p className={`font-bold truncate ${match.winnerTeam === 1 ? 'text-green-700' : 'text-gray-700'}`}>{p?.name ?? '?'}</p>
                              </div>
                            ))}
                            {match.winnerTeam === 1 && (
                              <span className="inline-flex items-center gap-1 text-xs font-black text-green-600 bg-green-50 border border-green-200 rounded-full px-3 py-1">✓ GANADOR</span>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col items-center gap-3 min-w-[80px]">
                          <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-4 py-2">
                            <span className={`text-2xl font-black tabular-nums ${match.winnerTeam === 1 ? 'text-green-600' : 'text-gray-300'}`}>{t1Sets}</span>
                            <span className="text-gray-200 font-black">—</span>
                            <span className={`text-2xl font-black tabular-nums ${match.winnerTeam === 2 ? 'text-green-600' : 'text-gray-300'}`}>{t2Sets}</span>
                          </div>
                          <div className="flex gap-2">
                            {sets.map((s) => (
                              <div key={s.setNumber} className="flex flex-col items-center">
                                <span className="text-xs text-gray-300 mb-0.5">S{s.setNumber}</span>
                                <div className="flex items-center gap-1 font-mono text-sm bg-white border border-gray-100 rounded-lg px-2 py-1 shadow-sm">
                                  <span className={s.team1Games > s.team2Games ? 'font-black text-gray-800' : 'text-gray-300'}>{s.team1Games}</span>
                                  <span className="text-gray-200 text-xs">–</span>
                                  <span className={s.team2Games > s.team1Games ? 'font-black text-gray-800' : 'text-gray-300'}>{s.team2Games}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className={`text-right ${match.winnerTeam === 1 ? 'opacity-35' : ''}`}>
                          <div className="space-y-2">
                            {[t2p1, t2p2].map((p, i) => (
                              <div key={i} className="flex items-center justify-end gap-2">
                                <p className={`font-bold truncate ${match.winnerTeam === 2 ? 'text-green-700' : 'text-gray-700'}`}>{p?.name ?? '?'}</p>
                                <div className={`w-2 h-2 rounded-full shrink-0 ${match.winnerTeam === 2 ? 'bg-green-500' : 'bg-gray-200'}`} />
                              </div>
                            ))}
                            {match.winnerTeam === 2 && (
                              <div className="flex justify-end">
                                <span className="inline-flex items-center gap-1 text-xs font-black text-green-600 bg-green-50 border border-green-200 rounded-full px-3 py-1">✓ GANADOR</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </section>
          )}
        </>
      )}
    </div>
  );
}
