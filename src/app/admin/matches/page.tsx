import { db } from '@/lib/db';
import { matches, matchSets, players } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DeleteMatchButton } from './delete-match-button';

export const dynamic = 'force-dynamic';

export default async function MatchesAdminPage() {
  const allMatches = await db
    .select()
    .from(matches)
    .orderBy(desc(matches.date));

  const allSets = await db.select().from(matchSets);
  const allPlayers = await db.select().from(players);

  const playerMap = Object.fromEntries(allPlayers.map((p) => [p.id, p]));
  const setsMap: Record<string, typeof allSets> = {};
  for (const set of allSets) {
    if (!setsMap[set.matchId]) setsMap[set.matchId] = [];
    setsMap[set.matchId].push(set);
    setsMap[set.matchId].sort((a, b) => a.setNumber - b.setNumber);
  }

  const scheduled = allMatches.filter((m) => m.status === 'scheduled');
  const completed = allMatches.filter((m) => m.status === 'completed');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Partidos</h1>
          <p className="text-gray-500 text-sm">
            {scheduled.length > 0 && <span className="text-blue-600 font-medium">{scheduled.length} pendiente{scheduled.length !== 1 ? 's' : ''} · </span>}
            {completed.length} completado{completed.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Link href="/admin/matches/new">
          <Button>+ Partido</Button>
        </Link>
      </div>

      {allMatches.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-4xl mb-2">🎾</p>
          <p>No hay partidos todavía.</p>
          <Link href="/admin/matches/new">
            <Button className="mt-4">Registrar el primero</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Scheduled */}
          {scheduled.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-black text-gray-400 uppercase tracking-widest">📅 Próximos partidos</p>
              {scheduled.map((match) => {
                const t1p1 = playerMap[match.team1Player1Id];
                const t1p2 = playerMap[match.team1Player2Id];
                const t2p1 = playerMap[match.team2Player1Id];
                const t2p2 = playerMap[match.team2Player2Id];
                return (
                  <div key={match.id} className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="outline" className="text-blue-600 border-blue-300 bg-white text-xs">📅 Programado</Badge>
                          <span className="text-xs text-gray-400">{match.date}</span>
                          {match.location && <span className="text-xs text-gray-400">· {match.location}</span>}
                        </div>
                        <div className="flex items-center gap-3 text-sm">
                          <span className="text-blue-700 font-semibold">🔵 {t1p1?.name ?? '?'} / {t1p2?.name ?? '?'}</span>
                          <span className="text-gray-400 font-black">vs</span>
                          <span className="text-red-700 font-semibold">🔴 {t2p1?.name ?? '?'} / {t2p2?.name ?? '?'}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Link href={`/admin/matches/${match.id}/result`}>
                          <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white text-xs">
                            + Resultado
                          </Button>
                        </Link>
                        <DeleteMatchButton id={match.id} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Completed */}
          {completed.length > 0 && (
            <div className="space-y-3">
              {scheduled.length > 0 && (
                <p className="text-xs font-black text-gray-400 uppercase tracking-widest">✅ Partidos completados</p>
              )}
              {completed.map((match) => {
                const sets = setsMap[match.id] || [];
                const t1p1 = playerMap[match.team1Player1Id];
                const t1p2 = playerMap[match.team1Player2Id];
                const t2p1 = playerMap[match.team2Player1Id];
                const t2p2 = playerMap[match.team2Player2Id];

                return (
                  <div key={match.id} className="bg-white border rounded-lg p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs text-gray-400">{match.date}</span>
                          {match.location && (
                            <span className="text-xs text-gray-400">· {match.location}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-sm">
                          <div className={`flex-1 ${match.winnerTeam === 1 ? 'font-bold text-green-700' : 'text-gray-600'}`}>
                            <span>🔵 {t1p1?.name ?? '?'} / {t1p2?.name ?? '?'}</span>
                            {match.winnerTeam === 1 && <Badge className="ml-2 text-xs" variant="default">Ganador</Badge>}
                          </div>
                          <div className="flex gap-1 items-center">
                            {sets.map((set) => (
                              <div key={set.setNumber} className="text-center">
                                <span className={`font-mono text-sm ${set.team1Games > set.team2Games ? 'font-bold' : ''}`}>{set.team1Games}</span>
                                <span className="text-gray-300 mx-0.5">-</span>
                                <span className={`font-mono text-sm ${set.team2Games > set.team1Games ? 'font-bold' : ''}`}>{set.team2Games}</span>
                              </div>
                            ))}
                          </div>
                          <div className={`flex-1 text-right ${match.winnerTeam === 2 ? 'font-bold text-green-700' : 'text-gray-600'}`}>
                            {match.winnerTeam === 2 && <Badge className="mr-2 text-xs" variant="default">Ganador</Badge>}
                            <span>{t2p1?.name ?? '?'} / {t2p2?.name ?? '?'} 🔴</span>
                          </div>
                        </div>
                      </div>
                      <DeleteMatchButton id={match.id} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
