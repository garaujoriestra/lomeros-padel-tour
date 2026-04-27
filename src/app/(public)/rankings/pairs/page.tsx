import { db } from '@/lib/db';
import { pairStats, players } from '@/lib/db/schema';
import { desc, sql } from 'drizzle-orm';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function PairsRankingPage() {
  const pairs = await db
    .select()
    .from(pairStats)
    .where(sql`${pairStats.matchesPlayed} >= 1`)
    .orderBy(desc(pairStats.pairElo));

  const allPlayers = await db.select().from(players);
  const playerMap = Object.fromEntries(allPlayers.map((p) => [p.id, p]));

  return (
    <div className="space-y-8">

      {/* Header */}
      <div className="relative overflow-hidden rounded-xl sm:rounded-2xl bg-gradient-to-r from-green-950 to-emerald-900 p-5 sm:p-7 md:p-10 text-white shadow-xl">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_80%_50%,rgba(74,222,128,0.08)_0%,transparent_70%)]" />
        <div className="absolute top-0 right-0 w-64 h-64 bg-green-400/10 rounded-full -translate-y-1/2 translate-x-1/3 blur-3xl" />
        <div className="relative">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight">👥 RANKING PAREJAS</h1>
          <p className="text-green-200 mt-1 font-medium text-sm sm:text-base">Mejores combinaciones ordenadas por Elo de pareja</p>
        </div>
      </div>

      {pairs.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-6xl mb-4">👥</p>
          <p className="text-xl font-semibold">Aún no hay datos de parejas</p>
          <p className="text-sm mt-2">Registra partidos para ver las estadísticas de pareja</p>
        </div>
      ) : (
        <>
          {/* Top 3 pair cards */}
          {pairs.length >= 2 && (
            <div className="space-y-3">
              <p className="text-xs font-black text-gray-400 uppercase tracking-widest text-center">Mejores parejas</p>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {pairs.slice(0, 3).map((pair, idx) => {
                  const p1 = playerMap[pair.player1Id];
                  const p2 = playerMap[pair.player2Id];
                  const winRate = pair.matchesPlayed > 0
                    ? Math.round((pair.wins / pair.matchesPlayed) * 100)
                    : 0;
                  const synergy = pair.synergyScore;
                  const medals = ['🥇', '🥈', '🥉'];
                  const gradients = [
                    'from-amber-50 via-amber-100 to-amber-50 border-amber-200 shadow-amber-100',
                    'from-slate-50 via-slate-100 to-slate-50 border-slate-200 shadow-slate-100',
                    'from-orange-50 via-orange-100 to-orange-50 border-orange-200 shadow-orange-100',
                  ];
                  const eloColors = ['text-amber-700', 'text-slate-600', 'text-orange-700'];

                  return (
                    <div
                      key={pair.id}
                      className={`bg-gradient-to-br ${gradients[idx] ?? 'from-gray-50 to-gray-50 border-gray-200'} border rounded-2xl p-5 shadow-md hover:shadow-lg transition-shadow`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <span className="text-3xl">{medals[idx] ?? `#${idx + 1}`}</span>
                        <div className="text-right">
                          <p className={`text-3xl font-black tabular-nums ${eloColors[idx] ?? 'text-gray-700'}`}>
                            {Math.round(pair.pairElo)}
                          </p>
                          <p className="text-xs text-gray-400 uppercase tracking-wide">ELO pareja</p>
                        </div>
                      </div>

                      {/* Players */}
                      <div className="space-y-2 mb-4">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white text-xs font-black shrink-0">
                            {p1?.name.charAt(0) ?? '?'}
                          </div>
                          <Link href={`/players/${pair.player1Id}`} className="font-bold text-gray-800 hover:text-green-700 transition-colors text-sm">
                            {p1?.name ?? '?'}
                          </Link>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white text-xs font-black shrink-0">
                            {p2?.name.charAt(0) ?? '?'}
                          </div>
                          <Link href={`/players/${pair.player2Id}`} className="font-bold text-gray-800 hover:text-green-700 transition-colors text-sm">
                            {p2?.name ?? '?'}
                          </Link>
                        </div>
                      </div>

                      {/* Stats row */}
                      <div className="flex items-center justify-between pt-3 border-t border-black/5">
                        <div className="text-center">
                          <p className="text-lg font-black text-gray-800 tabular-nums">{pair.matchesPlayed}</p>
                          <p className="text-xs text-gray-400">Partidos</p>
                        </div>
                        <div className="text-center">
                          <p className="text-lg font-black text-green-600 tabular-nums">{pair.wins}</p>
                          <p className="text-xs text-gray-400">Victorias</p>
                        </div>
                        <div className="text-center">
                          <p className={`text-xl font-black tabular-nums ${winRate >= 60 ? 'text-green-600' : winRate >= 40 ? 'text-yellow-600' : 'text-red-500'}`}>
                            {winRate}%
                          </p>
                          <p className="text-xs text-gray-400">Win rate</p>
                        </div>
                        <div className="text-center">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-black ${
                            synergy > 0.05 ? 'bg-green-100 text-green-700' :
                            synergy < -0.05 ? 'bg-red-100 text-red-600' :
                            'bg-gray-100 text-gray-500'
                          }`}>
                            {synergy > 0 ? '+' : ''}{(synergy * 100).toFixed(0)}%
                          </span>
                          <p className="text-xs text-gray-400 mt-0.5">Sinergia</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Full table */}
          <Card className="shadow-sm overflow-hidden border-0 shadow-md">
            <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-white border-b">
              <h2 className="font-black text-gray-600 text-xs uppercase tracking-widest">
                Clasificación completa · {pairs.length} pareja{pairs.length !== 1 ? 's' : ''}
              </h2>
            </div>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/60 hover:bg-gray-50/60">
                    <TableHead className="w-12 pl-6 font-black text-gray-500 text-xs uppercase tracking-wider">#</TableHead>
                    <TableHead className="font-black text-gray-500 text-xs uppercase tracking-wider">Pareja</TableHead>
                    <TableHead className="text-center font-black text-gray-500 text-xs uppercase tracking-wider">ELO</TableHead>
                    <TableHead className="text-center font-black text-gray-500 text-xs uppercase tracking-wider hidden sm:table-cell">P</TableHead>
                    <TableHead className="text-center font-black text-gray-500 text-xs uppercase tracking-wider hidden sm:table-cell">V</TableHead>
                    <TableHead className="text-center font-black text-gray-500 text-xs uppercase tracking-wider hidden sm:table-cell">D</TableHead>
                    <TableHead className="text-center font-black text-gray-500 text-xs uppercase tracking-wider">Win%</TableHead>
                    <TableHead className="text-center font-black text-gray-500 text-xs uppercase tracking-wider pr-6 hidden md:table-cell">Sinergia</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pairs.map((pair, idx) => {
                    const p1 = playerMap[pair.player1Id];
                    const p2 = playerMap[pair.player2Id];
                    const winRate = pair.matchesPlayed > 0
                      ? Math.round((pair.wins / pair.matchesPlayed) * 100)
                      : 0;
                    const synergy = pair.synergyScore;

                    return (
                      <TableRow key={pair.id} className={idx < 3 ? 'bg-green-50/20' : 'hover:bg-gray-50/50'}>
                        <TableCell className="pl-6 w-12">
                          {idx === 0 ? <span className="text-xl">🥇</span>
                            : idx === 1 ? <span className="text-xl">🥈</span>
                            : idx === 2 ? <span className="text-xl">🥉</span>
                            : <span className="text-gray-400 font-bold text-sm">{idx + 1}</span>}
                        </TableCell>
                        <TableCell>
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5">
                              <div className="w-5 h-5 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white text-xs font-black shrink-0">
                                {p1?.name.charAt(0) ?? '?'}
                              </div>
                              <Link href={`/players/${pair.player1Id}`} className="font-bold text-gray-800 hover:text-green-700 transition-colors text-sm">
                                {p1?.name ?? '?'}
                              </Link>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <div className="w-5 h-5 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white text-xs font-black shrink-0">
                                {p2?.name.charAt(0) ?? '?'}
                              </div>
                              <Link href={`/players/${pair.player2Id}`} className="font-bold text-gray-800 hover:text-green-700 transition-colors text-sm">
                                {p2?.name ?? '?'}
                              </Link>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="font-black text-base tabular-nums">{Math.round(pair.pairElo)}</span>
                        </TableCell>
                        <TableCell className="text-center text-sm hidden sm:table-cell text-gray-600">{pair.matchesPlayed}</TableCell>
                        <TableCell className="text-center text-sm font-bold text-green-600 hidden sm:table-cell">{pair.wins}</TableCell>
                        <TableCell className="text-center text-sm font-bold text-red-400 hidden sm:table-cell">{pair.losses}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <div className="w-12 h-1.5 rounded-full bg-gray-100 overflow-hidden hidden sm:block">
                              <div
                                className={`h-full rounded-full ${winRate >= 60 ? 'bg-green-500' : winRate >= 40 ? 'bg-yellow-400' : 'bg-red-400'}`}
                                style={{ width: `${winRate}%` }}
                              />
                            </div>
                            <span className={`text-sm font-black tabular-nums ${winRate >= 60 ? 'text-green-600' : winRate >= 40 ? 'text-yellow-600' : 'text-red-500'}`}>
                              {winRate}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center pr-6 hidden md:table-cell">
                          <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-black ${
                            synergy > 0.05 ? 'bg-green-100 text-green-700' :
                            synergy < -0.05 ? 'bg-red-100 text-red-600' :
                            'bg-gray-100 text-gray-500'
                          }`}>
                            {synergy > 0 ? '+' : ''}{(synergy * 100).toFixed(0)}%
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Legend */}
          <div className="bg-white/60 rounded-2xl p-5 border border-dashed border-gray-200">
            <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2">ℹ️ ¿Qué es la sinergia?</p>
            <p className="text-sm text-gray-500 leading-relaxed">
              La sinergia mide si una pareja rinde <strong>mejor o peor de lo esperado</strong> según sus estadísticas individuales.
              <span className="text-green-600 font-semibold"> Positivo</span> = rinden mejor juntos.
              <span className="text-red-500 font-semibold"> Negativo</span> = rinden peor juntos.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

