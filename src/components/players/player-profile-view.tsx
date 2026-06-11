import Link from 'next/link';
import { Pencil, TrendingUp, Swords, Users, History, Hand } from 'lucide-react';
import { EloChart, type EloMilestone } from '@/components/lpt/elo-chart';
import { CountUp } from '@/components/lpt/count-up';
import { SectionHead, LptAvatar, Delta, StatBar, FormDots, displayName, formatMatchDate } from '@/components/lpt/ui';
import { PartnerCard } from '@/components/shared/partner-card';
import { UnplayedPartnersCard } from '@/components/shared/unplayed-partners-card';
import { AchievementsCard } from '@/components/shared/achievements-card';
import type { RivalryStats } from '@/lib/rating/head-to-head';
import type { PlayerProfileData } from '@/lib/players/profile-data';

export function PlayerProfileView({ data, editable = false }: { data: PlayerProfileData; editable?: boolean }) {
  const {
    player,
    completedMatches,
    playerMap,
    playerRankEvents,
    recentForm,
    winRate,
    bestPartner,
    bestPartnerPlayer,
    worstPartner,
    worstPartnerPlayer,
    showWorstCard,
    unplayed,
    totalCandidates,
    earnedGrants,
    sideStats,
    hasSideData,
    driveBetter,
    rivalries,
    chartData,
    eloChangeByMatch,
    streak,
  } = data;
  const id = player.id;

  // Posición en el ranking (solo jugadores con partidos)
  const rank =
    player.matchesPlayed > 0
      ? Object.values(playerMap).filter((p) => p.matchesPlayed > 0 && p.eloRating > player.eloRating).length + 1
      : null;

  // Último cambio de Elo (▲/▼ junto al Elo grande)
  const lastDelta = completedMatches[0] ? eloChangeByMatch[completedMatches[0].id] ?? null : null;

  // Hitos para la gráfica (subidas al top)
  const eloSeries = [1500, ...chartData.map((d) => d.elo)];
  const milestones: EloMilestone[] = playerRankEvents
    .filter((e) => e.type === 'rank_into_top1' || e.type === 'rank_into_top3')
    .map((e) => {
      const idx = chartData.findIndex((d) => d.date === e.recordedAt);
      return idx >= 0 ? { index: idx + 1, label: e.type === 'rank_into_top1' ? '👑 #1' : '📈 Top 3' } : null;
    })
    .filter((m): m is EloMilestone => m !== null);

  const driveW = Math.round(sideStats.drive.winRate * 100);
  const revesW = Math.round(sideStats.reves.winRate * 100);

  return (
    <>
      {/* ── CABECERA ── */}
      <div className="hero section" style={{ padding: 'calc(26px * var(--sp))' }}>
        <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <LptAvatar player={player} size={84} />
            {rank != null && (
              <span
                className="display"
                style={{
                  position: 'absolute',
                  bottom: -6,
                  right: -6,
                  background: 'var(--acc)',
                  color: 'var(--on-acc)',
                  borderRadius: 99,
                  fontSize: 14,
                  padding: '3px 9px',
                }}
              >
                #{rank}
              </span>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <h1 className="display" style={{ fontSize: 'clamp(28px, 5vw, 42px)', margin: 0 }}>{player.name}</h1>
            {player.nickname && <div style={{ opacity: 0.65, fontWeight: 600, marginTop: 2 }}>&ldquo;{player.nickname}&rdquo;</div>}
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 12 }}>
              {player.isLeftHanded && (
                <span className="lpt-badge"><Hand size={11} /> Zurdo</span>
              )}
              {streak.count > 1 && (streak.type === 'W' || streak.type === 'L') && (
                <span className={`lpt-badge ${streak.type === 'W' ? 'accent' : 'loss'}`}>
                  {streak.type === 'W' ? '🔥' : '❄️'} Racha de {streak.count}
                </span>
              )}
              {editable && (
                <Link href="/me/edit" className="lpt-badge accent">
                  <Pencil size={11} /> Editar perfil
                </Link>
              )}
            </div>
          </div>
          <div className="profile-elo" style={{ textAlign: 'right' }}>
            <div className="display num" style={{ fontSize: 'clamp(40px, 6vw, 58px)', color: 'var(--acc)' }}>
              <CountUp value={Math.round(player.eloRating)} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 10.5, letterSpacing: '0.16em', textTransform: 'uppercase', opacity: 0.6, fontWeight: 700 }}>Elo</span>
              <Delta value={lastDelta} pulse />
            </div>
          </div>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 10,
            marginTop: 'calc(24px * var(--sp))',
            paddingTop: 'calc(18px * var(--sp))',
            borderTop: '1px solid color-mix(in oklab, currentcolor 18%, transparent)',
            textAlign: 'center',
          }}
        >
          {([
            [player.matchesPlayed, 'Partidos'],
            [player.wins, 'Victorias'],
            [player.losses, 'Derrotas'],
            [`${winRate}%`, 'Win rate'],
          ] as [number | string, string][]).map(([n, l]) => (
            <div key={l}>
              <div className="display num" style={{ fontSize: 'clamp(20px, 3.5vw, 30px)' }}>{n}</div>
              <div style={{ fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', opacity: 0.55, fontWeight: 700, marginTop: 2 }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid-main">
        <div>
          {/* Evolución Elo */}
          {chartData.length > 1 && (
            <div className="section">
              <SectionHead icon={TrendingUp} title="Evolución del Elo" />
              <div className="lpt-card card-pad">
                <EloChart data={eloSeries} milestones={milestones} />
                {milestones.length > 0 && (
                  <div style={{ display: 'flex', gap: 14, marginTop: 8, flexWrap: 'wrap' }}>
                    {milestones.map((m, i) => (
                      <span key={i} className="small muted" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 99, background: 'var(--acc)', display: 'inline-block' }} />
                        {m.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Forma + win rate */}
          {player.matchesPlayed > 0 && (
            <div className="grid-2 section">
              {recentForm.length > 0 && (
                <div className="lpt-card card-pad">
                  <div className="kicker" style={{ marginBottom: 12 }}>Forma reciente</div>
                  <FormDots form={recentForm as ('W' | 'L')[]} />
                </div>
              )}
              <div className="lpt-card card-pad">
                <div className="kicker" style={{ marginBottom: 12 }}>Win rate</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <StatBar pct={winRate} tone={winRate >= 50 ? 'win' : 'loss'} />
                  </div>
                  <span className="elo-num num" style={{ color: winRate >= 50 ? 'var(--win)' : 'var(--loss)' }}>{winRate}%</span>
                </div>
                <div className="small muted" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                  <span>{player.wins} victorias</span>
                  <span>{player.losses} derrotas</span>
                </div>
              </div>
            </div>
          )}

          {/* Lados */}
          {hasSideData && (
            <div className="grid-2 section">
              {([
                ['Drive', sideStats.drive, driveW, driveBetter],
                ['Revés', sideStats.reves, revesW, !driveBetter],
              ] as [string, typeof sideStats.drive, number, boolean][]).map(([label, s, w, isBest]) => (
                <div
                  key={label}
                  className="lpt-card card-pad"
                  style={s.matches > 0 && isBest && driveW !== revesW ? { borderColor: 'var(--acc)' } : undefined}
                >
                  <div className="kicker" style={{ marginBottom: 8 }}>
                    Lado {label}
                    {s.matches > 0 && isBest && driveW !== revesW && (
                      <span style={{ color: 'var(--acc-text)' }}>· su mejor lado</span>
                    )}
                  </div>
                  {s.matches === 0 ? (
                    <p className="small muted" style={{ margin: 0 }}>Sin datos</p>
                  ) : (
                    <>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                        <span className="elo-num">{w}%</span>
                        <span className="small muted" style={{ whiteSpace: 'nowrap' }}>
                          {s.matches} partidos · {s.wins}V {s.losses}D
                        </span>
                      </div>
                      <div style={{ marginTop: 8 }}>
                        <StatBar pct={w} height={5} />
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Head to head */}
          {rivalries.length > 0 && (
            <div className="section">
              <SectionHead icon={Swords} title="Head-to-head" />
              <div className="lpt-card" style={{ overflow: 'hidden' }}>
                {rivalries.map((r) => (
                  <RivalryRow key={r.opponentId} rivalry={r} />
                ))}
              </div>
            </div>
          )}
        </div>

        <div>
          {/* Compañeros */}
          {bestPartnerPlayer && bestPartner && (
            <div className="section">
              <SectionHead icon={Users} title="Compañeros" />
              <div style={{ display: 'grid', gap: 10 }}>
                <PartnerCard variant="best" partner={bestPartnerPlayer} pairStat={bestPartner} />
                {showWorstCard && worstPartner && worstPartnerPlayer && (
                  <PartnerCard variant="worst" partner={worstPartnerPlayer} pairStat={worstPartner} />
                )}
              </div>
              <div style={{ marginTop: 10 }}>
                <UnplayedPartnersCard unplayed={unplayed} totalCandidates={totalCandidates} />
              </div>
            </div>
          )}

          {/* Logros */}
          <AchievementsCard
            earned={earnedGrants.map((g) => ({ achievementId: g.achievementId, earnedAt: g.earnedAt }))}
          />

          {/* Historial */}
          {completedMatches.length > 0 && (
            <div className="section">
              <SectionHead icon={History} title="Historial" />
              <div className="lpt-card" style={{ overflow: 'hidden' }}>
                {completedMatches.slice(0, 10).map((match) => {
                  const isTeam1 = match.team1Player1Id === id || match.team1Player2Id === id;
                  const won = (isTeam1 && match.winnerTeam === 1) || (!isTeam1 && match.winnerTeam === 2);
                  const partnerId = isTeam1
                    ? (match.team1Player1Id === id ? match.team1Player2Id : match.team1Player1Id)
                    : (match.team2Player1Id === id ? match.team2Player2Id : match.team2Player1Id);
                  const partner = playerMap[partnerId];
                  const opponents = isTeam1
                    ? [playerMap[match.team2Player1Id], playerMap[match.team2Player2Id]]
                    : [playerMap[match.team1Player1Id], playerMap[match.team1Player2Id]];
                  const delta = eloChangeByMatch[match.id];
                  return (
                    <Link key={match.id} href={`/matches/${match.id}`} className="rank-row" style={{ display: 'flex', gap: 10 }}>
                      <span className={`form-dot ${won ? 'w' : 'l'}`}>{won ? 'V' : 'D'}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          <span className="muted">con</span> {displayName(partner)}{' '}
                          <span className="muted">vs</span> {opponents.map((p) => displayName(p)).join(' & ')}
                        </div>
                        <div className="small muted" style={{ fontSize: 11 }}>{formatMatchDate(match.date)}</div>
                      </div>
                      {delta != null && <Delta value={delta} />}
                    </Link>
                  );
                })}
              </div>
              {completedMatches.length > 10 && (
                <div style={{ textAlign: 'center', marginTop: 10 }}>
                  <Link href="/matches" className="sec-link">Ver todos los partidos</Link>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function RivalryRow({ rivalry }: { rivalry: RivalryStats }) {
  const winPct = Math.round(rivalry.winRate * 100);
  return (
    <Link href={`/players/${rivalry.opponentId}`} className="rank-row" style={{ display: 'flex' }}>
      <LptAvatar player={{ id: rivalry.opponentId, name: rivalry.opponentName, avatarUrl: rivalry.opponentAvatarUrl }} size={30} />
      <span style={{ flex: 1, fontWeight: 700, fontSize: 13.5, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {rivalry.opponentName}
      </span>
      <div style={{ width: 110 }} className="hide-sm">
        <StatBar pct={winPct} tone={winPct >= 50 ? 'win' : 'loss'} height={5} />
      </div>
      <span className="small num" style={{ width: 70, textAlign: 'center' }}>
        <b style={{ color: 'var(--win)' }}>{rivalry.wins}V</b> <span className="muted">·</span> <b style={{ color: 'var(--loss)' }}>{rivalry.losses}D</b>
      </span>
      <span className="elo-num num" style={{ width: 50, textAlign: 'right', fontSize: 17, color: winPct >= 50 ? 'var(--win)' : 'var(--loss)' }}>
        {winPct}%
      </span>
    </Link>
  );
}
