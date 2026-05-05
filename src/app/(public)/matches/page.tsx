import { db } from '@/lib/db';
import { matches, matchSets, players } from '@/lib/db/schema';
import { desc } from 'drizzle-orm';
import { MatchCard } from '@/components/shared/match-card';

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
  const completed = allMatches.filter((m) => m.status === 'completed' || m.status === 'injury_aborted');

  return (
    <div className="space-y-8">

      {/* Header */}
      <div className="relative overflow-hidden rounded-xl sm:rounded-2xl bg-gradient-to-r from-green-950 to-emerald-900 p-5 sm:p-7 md:p-10 text-white shadow-xl">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_80%_50%,rgba(74,222,128,0.08)_0%,transparent_70%)]" />
        <div className="relative flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight">⚡ PARTIDOS</h1>
            <p className="text-green-200 mt-1 font-medium text-sm sm:text-base">
              {completed.length} resultado{completed.length !== 1 ? 's' : ''}
              {upcoming.length > 0 && ` · ${upcoming.length} próximo${upcoming.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          {upcoming.length > 0 && (
            <span className="px-3 py-1.5 sm:px-4 sm:py-2 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-200 text-xs sm:text-sm font-bold">
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
              {upcoming.map((match) => (
                <MatchCard
                  key={match.id}
                  match={match}
                  team1={[playerMap[match.team1Player1Id], playerMap[match.team1Player2Id]]}
                  team2={[playerMap[match.team2Player1Id], playerMap[match.team2Player2Id]]}
                  href={`/matches/${match.id}`}
                />
              ))}
            </section>
          )}

          {/* Completed matches */}
          {completed.length > 0 && (
            <section className="space-y-4">
              {upcoming.length > 0 && (
                <h2 className="text-xl font-black text-gray-800">✅ Últimos resultados</h2>
              )}
              {completed.map((match) => (
                <MatchCard
                  key={match.id}
                  match={match}
                  team1={[playerMap[match.team1Player1Id], playerMap[match.team1Player2Id]]}
                  team2={[playerMap[match.team2Player1Id], playerMap[match.team2Player2Id]]}
                  sets={setsMap[match.id] ?? []}
                  href={`/matches/${match.id}`}
                />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
