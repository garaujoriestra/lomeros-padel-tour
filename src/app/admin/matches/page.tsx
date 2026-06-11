import { db } from '@/lib/db';
import { matches, matchSets, players } from '@/lib/db/schema';
import { desc } from 'drizzle-orm';
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
  const completed = allMatches.filter((m) => m.status === 'completed' || m.status === 'injury_aborted');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Partidos</h1>
          <p className="text-ink-3 text-sm">
            {scheduled.length > 0 && <span className="text-acc-text font-medium">{scheduled.length} pendiente{scheduled.length !== 1 ? 's' : ''} · </span>}
            {completed.length} completado{completed.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Link href="/admin/matches/new">
          <Button>+ Partido</Button>
        </Link>
      </div>

      {allMatches.length === 0 ? (
        <div className="text-center py-12 text-ink-3">
          <p className="text-4xl mb-2">🎾</p>
          <p>No hay partidos todavía.</p>
          <Link href="/admin/matches/new">
            <Button className="mt-4">Registrar el primero</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-6 overflow-x-auto">
          {/* Scheduled */}
          {scheduled.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-black text-ink-3 uppercase tracking-widest">📅 Próximos partidos</p>
              {scheduled.map((match) => {
                const t1p1 = playerMap[match.team1Player1Id];
                const t1p2 = playerMap[match.team1Player2Id];
                const t2p1 = playerMap[match.team2Player1Id];
                const t2p2 = playerMap[match.team2Player2Id];
                return (
                  <div key={match.id} className="bg-acc/10 border border-acc/30 rounded-lg p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="outline" className="text-acc-text border-acc/30 bg-card text-xs">📅 Programado</Badge>
                          <span className="text-xs text-ink-3">{match.date}</span>
                          {match.location && <span className="text-xs text-ink-3">· {match.location}</span>}
                        </div>
                        <div className="flex items-center gap-3 text-sm">
                          <span className="text-acc-text font-semibold">🔵 {t1p1?.name ?? '?'} / {t1p2?.name ?? '?'}</span>
                          <span className="text-ink-3 font-black">vs</span>
                          <span className="text-loss font-semibold">🔴 {t2p1?.name ?? '?'} / {t2p2?.name ?? '?'}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Link href={`/admin/matches/${match.id}/result`}>
                          <Button size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs">
                            + Resultado
                          </Button>
                        </Link>
                        <Link href={`/admin/matches/${match.id}/sides`}>
                          <Button variant="outline" className="min-h-[40px] px-3 text-xs">🎾 Lados</Button>
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
                <p className="text-xs font-black text-ink-3 uppercase tracking-widest">✅ Partidos completados</p>
              )}
              {completed.map((match) => {
                const sets = setsMap[match.id] || [];
                const t1p1 = playerMap[match.team1Player1Id];
                const t1p2 = playerMap[match.team1Player2Id];
                const t2p1 = playerMap[match.team2Player1Id];
                const t2p2 = playerMap[match.team2Player2Id];
                const isInjury = match.status === 'injury_aborted';
                const injured = match.injuredPlayerId ? playerMap[match.injuredPlayerId] : null;

                return (
                  <div key={match.id} className={`border rounded-lg p-4 ${isInjury ? 'bg-loss/10 border-loss/30' : 'bg-card'}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs text-ink-3">{match.date}</span>
                          {match.location && (
                            <span className="text-xs text-ink-3">· {match.location}</span>
                          )}
                          {isInjury && (
                            <Badge variant="outline" className="text-loss border-loss/30 bg-card text-xs">
                              🤕 Lesión {injured ? `· ${injured.name}` : ''}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-sm">
                          <div className={`flex-1 ${!isInjury && match.winnerTeam === 1 ? 'font-bold text-win' : 'text-ink-2'}`}>
                            <span>🔵 {t1p1?.name ?? '?'} / {t1p2?.name ?? '?'}</span>
                            {!isInjury && match.winnerTeam === 1 && <Badge className="ml-2 text-xs" variant="default">Ganador</Badge>}
                          </div>
                          <div className="flex gap-1 items-center">
                            {isInjury ? (
                              <span className="text-xs font-bold text-loss">No terminado</span>
                            ) : (
                              sets.map((set) => (
                                <div key={set.setNumber} className="text-center">
                                  <span className={`font-mono text-sm ${set.team1Games > set.team2Games ? 'font-bold' : ''}`}>{set.team1Games}</span>
                                  <span className="text-ink-3 mx-0.5">-</span>
                                  <span className={`font-mono text-sm ${set.team2Games > set.team1Games ? 'font-bold' : ''}`}>{set.team2Games}</span>
                                </div>
                              ))
                            )}
                          </div>
                          <div className={`flex-1 text-right ${!isInjury && match.winnerTeam === 2 ? 'font-bold text-win' : 'text-ink-2'}`}>
                            {!isInjury && match.winnerTeam === 2 && <Badge className="mr-2 text-xs" variant="default">Ganador</Badge>}
                            <span>{t2p1?.name ?? '?'} / {t2p2?.name ?? '?'} 🔴</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Link href={`/admin/matches/${match.id}/sides`}>
                          <Button variant="outline" className="min-h-[40px] px-3 text-xs">🎾 Lados</Button>
                        </Link>
                        <DeleteMatchButton id={match.id} />
                      </div>
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
