import { getDefaultGroupId } from '@/lib/auth/group-context';
import { getSession } from '@/lib/auth/session';
import { listRankedPlayers, listUnrankedPlayers } from '@/lib/players/queries';
import { listRatingHistoryInGroup } from '@/lib/rating/queries';
import Link from 'next/link';
import { Trophy, UserPlus, Users, Coins } from 'lucide-react';
import { Podium } from '@/components/shared/podium';
import { buildPodiumGroups, assignCompetitionRanks } from '@/lib/rankings/podium-groups';
import { SectionHead, LptAvatar, Delta, Sparkline } from '@/components/lpt/ui';
import { DirectionalTransition } from '@/components/shared/view-transitions';

export const dynamic = 'force-dynamic';

export default async function RankingsPage() {
  const groupId = await getDefaultGroupId();
  const [ranked, unranked, history, session] = await Promise.all([
    listRankedPlayers(groupId),
    listUnrankedPlayers(groupId),
    listRatingHistoryInGroup(groupId),
    getSession(),
  ]);
  const myPlayerId = session?.player?.id ?? null;

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

  // El momento central del producto es «¿he subido?»: la fila del jugador con
  // sesión se destaca y su posición se anuncia arriba, sin buscarse a mano.
  const myRanked = myPlayerId ? rankedWithRanks.find((p) => p.id === myPlayerId) ?? null : null;

  // Lectura de jornada: los movimientos de Elo más recientes (último partido de
  // cada jugador), no solo la foto estática de la tabla.
  const movers = podiumPlayers
    .filter((p) => p.delta != null && p.delta !== 0)
    .sort((a, b) => Math.abs(b.delta!) - Math.abs(a.delta!))
    .slice(0, 3);

  return (
    <DirectionalTransition>
      <div>
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

      {/* Tu posición + movimientos: la tabla cuenta la jornada, no solo la lista. */}
      {ranked.length > 0 && (myRanked || movers.length > 0) && (
        <section className="section" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {myRanked && (
            <span className="lpt-badge accent" style={{ fontSize: 12, padding: '6px 13px' }}>
              Tu posición: #{myRanked.rank}
              {myRanked.delta != null && myRanked.delta !== 0 && (
                <b className="num" style={{ color: myRanked.delta > 0 ? 'var(--win)' : 'var(--loss)' }}>
                  {myRanked.delta > 0 ? '▲' : '▼'}{Math.abs(Math.round(myRanked.delta))}
                </b>
              )}
            </span>
          )}
          {movers.map((m) => (
            <span key={m.id} className={`lpt-badge ${m.delta! > 0 ? 'win' : 'loss'}`}>
              {m.delta! > 0 ? '▲' : '▼'} {m.nickname || m.name} <b className="num">{m.delta! > 0 ? '+' : ''}{Math.round(m.delta!)}</b>
            </span>
          ))}
        </section>
      )}

      {ranked.length > 0 && (
        <section className="section">
          <div className="lpt-card" style={{ overflow: 'hidden' }}>
            <div className="rank-row" style={{ cursor: 'default', background: 'transparent', padding: 'calc(9px * var(--sp)) calc(16px * var(--sp))' }}>
              <span className="kicker" style={{ width: 34, justifyContent: 'center' }}>#</span>
              <span className="kicker" style={{ flex: 1 }}>Jugador</span>
              <span className="kicker rank-spark">Forma</span>
              <span className="kicker hide-sm" style={{ width: 64, justifyContent: 'center' }}>V–D</span>
              <span className="kicker" style={{ width: 56, justifyContent: 'flex-end' }}>Elo</span>
              <span style={{ width: 48 }} />
            </div>
            {rankedWithRanks.map((player) => {
              const winRate = Math.round((player.wins / player.matchesPlayed) * 100);
              const h = histByPlayer[player.id];
              const streak = h ? streakOf(h.changes) : null;
              const isMe = player.id === myPlayerId;
              return (
                <Link
                  key={player.id}
                  href={`/players/${player.id}`}
                  transitionTypes={['nav-forward']}
                  className="rank-row"
                  style={{
                    display: 'flex',
                    background: isMe ? 'color-mix(in oklab, var(--acc) 9%, transparent)' : undefined,
                  }}
                >
                  <span className={`rank-pos ${player.rank <= 3 ? 'top' : ''}`}>{player.rank}</span>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
                    <LptAvatar player={player} size={34} vtName={`pl-${player.id}`} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {player.nickname || player.name}
                        {isMe && <span className="lpt-badge accent" style={{ marginLeft: 7, fontSize: 9.5, padding: '2px 7px' }}>tú</span>}
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
                  {/* La forma (momentum) también en móvil: es la superficie North Star. */}
                  <div className="rank-spark">
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
              <Link key={p.id} href={`/players/${p.id}`} transitionTypes={['nav-forward']} className="lpt-card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px' }}>
                <LptAvatar player={p} size={30} vtName={`pl-${p.id}`} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>{p.nickname || p.name}</div>
                  <div className="small muted" style={{ fontSize: 11 }}>Debuta pronto · Elo 1500</div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="section" style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <Link href="/rankings/pairs" className="sec-link"><Users size={14} /> Ranking de parejas →</Link>
        <Link href="/rankings/tokens" className="sec-link"><Coins size={14} /> Clasificación de La Timba →</Link>
      </section>
      </div>
    </DirectionalTransition>
  );
}
