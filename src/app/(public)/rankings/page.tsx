import { db } from '@/lib/db';
import { players } from '@/lib/db/schema';
import { desc, sql } from 'drizzle-orm';
import Link from 'next/link';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { Podium } from '@/components/shared/podium';
import { buildPodiumGroups, assignCompetitionRanks } from '@/lib/rankings/podium-groups';

export const dynamic = 'force-dynamic';

export default async function RankingsPage() {
  const ranked = await db
    .select()
    .from(players)
    .where(sql`${players.matchesPlayed} > 0`)
    .orderBy(desc(players.eloRating));

  const unranked = await db
    .select()
    .from(players)
    .where(sql`${players.matchesPlayed} = 0`)
    .orderBy(players.name);

  const podiumGroups = buildPodiumGroups(ranked);
  const rankedWithRanks = assignCompetitionRanks(ranked);

  return (
    <div className="space-y-8">

      {/* Header */}
      <div className="relative overflow-hidden rounded-xl sm:rounded-2xl bg-gradient-to-r from-green-950 to-emerald-900 p-5 sm:p-7 md:p-10 text-white shadow-xl">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_80%_50%,rgba(74,222,128,0.08)_0%,transparent_70%)]" />
        <div className="relative">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight">🏆 CLASIFICACIÓN</h1>
          <p className="text-green-200 mt-1 font-medium text-sm sm:text-base">Ranking individual ordenado por Elo · {ranked.length} jugadores clasificados</p>
        </div>
      </div>

      {ranked.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-6xl mb-4">🏆</p>
          <p className="text-xl font-semibold">Aún no hay partidos registrados</p>
        </div>
      ) : (
        <>
          {/* Podium top 3 */}
          {podiumGroups.length >= 3 && (
            <div className="space-y-3">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest text-center">Podio</p>
              <Podium groups={podiumGroups} variant="rankings" />
            </div>
          )}

          {/* Full table */}
          <Card className="shadow-sm overflow-hidden border-0 shadow-md">
            <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-white border-b">
              <h2 className="font-black text-gray-600 text-xs uppercase tracking-widest">Clasificación completa · {ranked.length} jugadores</h2>
            </div>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/60 hover:bg-gray-50/60">
                    <TableHead className="w-12 sm:w-14 pl-3 sm:pl-6 font-black text-gray-500 text-xs uppercase tracking-wider">#</TableHead>
                    <TableHead className="font-black text-gray-500 text-xs uppercase tracking-wider">Jugador</TableHead>
                    <TableHead className="text-center font-black text-gray-500 text-xs uppercase tracking-wider">ELO</TableHead>
                    <TableHead className="text-center font-black text-gray-500 text-xs uppercase tracking-wider hidden sm:table-cell">P</TableHead>
                    <TableHead className="text-center font-black text-gray-500 text-xs uppercase tracking-wider hidden sm:table-cell">V</TableHead>
                    <TableHead className="text-center font-black text-gray-500 text-xs uppercase tracking-wider hidden sm:table-cell">D</TableHead>
                    <TableHead className="text-center font-black text-gray-500 text-xs uppercase tracking-wider pr-3 sm:pr-6">Win%</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rankedWithRanks.map((player) => {
                    const winRate = Math.round((player.wins / player.matchesPlayed) * 100);
                    const eloChange = Math.round(player.eloRating - 1500);
                    return (
                      <TableRow key={player.id} className={player.rank <= 3 ? 'bg-green-50/20' : 'hover:bg-gray-50/50'}>
                        <TableCell className="pl-3 sm:pl-6 w-12 sm:w-14">
                          {player.rank === 1 ? <span className="text-xl">🥇</span>
                            : player.rank === 2 ? <span className="text-xl">🥈</span>
                            : player.rank === 3 ? <span className="text-xl">🥉</span>
                            : <span className="text-gray-400 font-bold text-sm w-6 inline-block text-center">{player.rank}</span>}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white text-sm font-black shrink-0 shadow-sm">
                              {player.name.charAt(0)}
                            </div>
                            <div>
                              <Link href={`/players/${player.id}`} className="font-bold text-gray-800 hover:text-green-700 transition-colors">
                                {player.name}
                              </Link>
                              {player.nickname && <p className="text-xs text-gray-400">{player.nickname}</p>}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex flex-col items-center">
                            <span className="font-black text-sm sm:text-base tabular-nums">{Math.round(player.eloRating)}</span>
                            <span className={`text-xs font-bold tabular-nums ${eloChange >= 0 ? 'text-green-500' : 'text-red-400'}`}>
                              {eloChange >= 0 ? '+' : ''}{eloChange}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center text-sm hidden sm:table-cell text-gray-600">{player.matchesPlayed}</TableCell>
                        <TableCell className="text-center text-sm font-bold text-green-600 hidden sm:table-cell">{player.wins}</TableCell>
                        <TableCell className="text-center text-sm font-bold text-red-400 hidden sm:table-cell">{player.losses}</TableCell>
                        <TableCell className="text-center pr-3 sm:pr-6">
                          <div className="flex items-center justify-center gap-2">
                            <div className="w-14 h-1.5 rounded-full bg-gray-100 overflow-hidden hidden sm:block">
                              <div
                                className={`h-full rounded-full transition-all ${winRate >= 60 ? 'bg-green-500' : winRate >= 40 ? 'bg-yellow-400' : 'bg-red-400'}`}
                                style={{ width: `${winRate}%` }}
                              />
                            </div>
                            <span className={`text-sm font-black tabular-nums ${winRate >= 60 ? 'text-green-600' : winRate >= 40 ? 'text-yellow-600' : 'text-red-500'}`}>
                              {winRate}%
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      {/* Unranked */}
      {unranked.length > 0 && (
        <div className="bg-white/60 rounded-2xl p-5 border border-dashed border-gray-200">
          <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Sin clasificar · 0 partidos</p>
          <div className="flex flex-wrap gap-2">
            {unranked.map((player) => (
              <Link key={player.id} href={`/players/${player.id}`}>
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-gray-200 text-sm text-gray-600 hover:border-green-300 hover:text-green-700 transition-all shadow-sm">
                  <span className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold">{player.name.charAt(0)}</span>
                  {player.name}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

