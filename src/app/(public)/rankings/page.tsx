import { db } from '@/lib/db';
import { players, ratingHistory } from '@/lib/db/schema';
import { desc, sql } from 'drizzle-orm';
import Link from 'next/link';
import { Trophy, UserPlus } from 'lucide-react';
import { Podium } from '@/components/shared/podium';
import { buildPodiumGroups, assignCompetitionRanks } from '@/lib/rankings/podium-groups';
import { SectionHead, LptAvatar, Delta, Sparkline } from '@/components/lpt/ui';

export const dynamic = 'force-dynamic';

export default async function RankingsPage() {
  const [ranked, unranked, history] = await Promise.all([
    db.select().from(players).where(sql`${players.matchesPlayed} > 0`).orderBy(desc(players.eloRating)),
    db.select().from(players).where(sql`${players.matchesPlayed} = 0`).orderBy(players.name),
    db.select().from(ratingHistory).orderBy(ratingHistory.recordedAt),
  ]);

  // Historial de Elo por jugador (para sparkline, delta y racha)
  const histByPlayer: Record<string, { elo: number[]; changes: number[] }> = {};
  for (const rh of history) {
    const h = (histByPlayer[rh.playerId] ??= { elo: [rh.eloBefore], changes: [] });
    h.elo.push(rh.eloAfter);
    h.changes.push(rh.eloChange);
  }
  function streakOf(changes: number[]): { type: 'W' | 'L'; count: number } | null {
    if (changes.length === 0) return null;
    const lastWin = changes[changes.length - 1] > 0;
    let count = 0;
    for (let i = changes.length - 1; i >= 0; i--) {
      if (changes[i] > 0 === lastWin) count++;
      else break;
    }
    return { type: lastWin ? 'W' : 'L', count };
  }

  const podiumPlayers = ranked.map((p) => ({
    ...p,
    delta: histByPlayer[p.id]?.changes.at(-1) ?? null,
  }));
  const podiumGroups = buildPodiumGroups(podiumPlayers);
  const rankedWithRanks = assignCompetitionRanks(podiumPlayers);

  return (
    <>
      <section className="section">
        <SectionHead icon={Trophy} title="Ranking individual" />
        {ranked.length === 0 ? (
          <div className="muted" style={{ textAlign: 'center', padding: '60px 0' }}>
            <p style={{ fontSize: 40, margin: '0 0 10px' }}>🏆</p>
            <p style={{ fontWeight: 600, margin: 0 }}>Aún no hay partidos registrados</p>
          </div>
        ) : (
          podiumGroups.length >= 3 && <Podium groups={podiumGroups} />
        )}
      </section>

      {ranked.length > 0 && (
        <section className="section">
          <div className="lpt-card" style={{ overflow: 'hidden' }}>
            <div className="rank-row" style={{ cursor: 'default', background: 'transparent', padding: 'calc(9px * var(--sp)) calc(16px * var(--sp))' }}>
              <span className="kicker" style={{ width: 34, justifyContent: 'center' }}>#</span>
              <span className="kicker" style={{ flex: 1 }}>Jugador</span>
              <span className="kicker hide-sm" style={{ width: 90, justifyContent: 'center' }}>Forma</span>
              <span className="kicker hide-sm" style={{ width: 64, justifyContent: 'center' }}>V–D</span>
              <span className="kicker" style={{ width: 56, justifyContent: 'flex-end' }}>Elo</span>
              <span style={{ width: 48 }} />
            </div>
            {rankedWithRanks.map((player) => {
              const winRate = Math.round((player.wins / player.matchesPlayed) * 100);
              const h = histByPlayer[player.id];
              const streak = h ? streakOf(h.changes) : null;
              return (
                <Link key={player.id} href={`/players/${player.id}`} className="rank-row" style={{ display: 'flex' }}>
                  <span className={`rank-pos ${player.rank <= 3 ? 'top' : ''}`}>{player.rank}</span>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
                    <LptAvatar player={player} size={34} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {player.nickname || player.name}
                        {streak && streak.count >= 3 && (
                          <span title={`Racha de ${streak.count}`} style={{ marginLeft: 6, fontSize: 12 }}>
                            {streak.type === 'W' ? '🔥' : '❄️'}
                          </span>
                        )}
                      </div>
                      <div className="small muted" style={{ fontSize: 11.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        <span className="hide-sm">{player.name}</span>
                        <span className="only-sm num">{player.wins}V – {player.losses}D · {winRate}%</span>
                      </div>
                    </div>
                  </div>
                  <div className="hide-sm" style={{ width: 90, display: 'flex', justifyContent: 'center' }}>
                    {h && h.elo.length >= 2 && <Sparkline data={h.elo.slice(-8)} />}
                  </div>
                  <span className="num small hide-sm" style={{ width: 64, textAlign: 'center', fontWeight: 600 }}>
                    <span style={{ color: 'var(--win)' }}>{player.wins}</span>
                    <span className="muted">–</span>
                    <span style={{ color: 'var(--loss)' }}>{player.losses}</span>
                  </span>
                  <span className="elo-num num" style={{ width: 56, textAlign: 'right' }}>{Math.round(player.eloRating)}</span>
                  <span style={{ width: 48, textAlign: 'right' }}>
                    <Delta value={player.delta} />
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Sin partidos */}
      {unranked.length > 0 && (
        <section className="section">
          <SectionHead icon={UserPlus} title="Aún sin partidos" />
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {unranked.map((p) => (
              <Link key={p.id} href={`/players/${p.id}`} className="lpt-card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px' }}>
                <LptAvatar player={p} size={30} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>{p.nickname || p.name}</div>
                  <div className="small muted" style={{ fontSize: 11 }}>Debuta pronto · Elo 1500</div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <Link href="/rankings/tokens" className="sec-link">🪙 Clasificación de La Timba →</Link>
      </section>
    </>
  );
}
