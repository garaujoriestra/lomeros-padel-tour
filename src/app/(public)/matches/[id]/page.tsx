import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { matches, matchSets, players, pairStats, ratingHistory } from '@/lib/db/schema';
import { eq, and, inArray, or } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, Calendar, MapPin, Target, Users, Bandage, Star } from 'lucide-react';
import { recommendPairings, type PairingOption } from '@/lib/rating/recommend-pairs';
import { computeSideStats } from '@/lib/rating/side-stats';
import { expectedScore } from '@/lib/rating/elo';
import { ShareMatchButton } from '@/components/shared/share-match-button';
import {
  ScoreGrid,
  StatusPill,
  SectionHead,
  LptAvatar,
  AvatarStack,
  displayName,
  formatMatchDate,
  type LptPlayer,
} from '@/components/lpt/ui';

export const dynamic = 'force-dynamic';

function pairMatchesPlayed(
  p1Id: string,
  p2Id: string,
  pairs: { player1Id: string; player2Id: string; matchesPlayed: number }[],
): number {
  const found = pairs.find(
    (p) =>
      (p.player1Id === p1Id && p.player2Id === p2Id) ||
      (p.player1Id === p2Id && p.player2Id === p1Id),
  );
  return found?.matchesPlayed ?? 0;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const [match] = await db.select().from(matches).where(eq(matches.id, id));
  if (!match) {
    return { title: 'Partido no encontrado · LPT' };
  }
  const allPlayers = await db.select().from(players);
  const pMap = Object.fromEntries(allPlayers.map((p) => [p.id, p]));

  const t1 = `${pMap[match.team1Player1Id]?.name ?? '?'}/${pMap[match.team1Player2Id]?.name ?? '?'}`;
  const t2 = `${pMap[match.team2Player1Id]?.name ?? '?'}/${pMap[match.team2Player2Id]?.name ?? '?'}`;

  if (match.status === 'completed') {
    const sets = await db
      .select()
      .from(matchSets)
      .where(eq(matchSets.matchId, id))
      .then((s) => s.sort((a, b) => a.setNumber - b.setNumber));
    const setsStr = sets.map((s) => `${s.team1Games}-${s.team2Games}`).join(' / ');
    const description = `Resultado del partido del ${match.date}${match.location ? ` en ${match.location}` : ''}.`;
    return {
      title: `${t1} vs ${t2} · ${setsStr} — LPT`,
      description,
      openGraph: {
        title: `${t1} vs ${t2} · ${setsStr}`,
        description,
      },
    };
  }

  if (match.status === 'injury_aborted') {
    const injured = match.injuredPlayerId ? pMap[match.injuredPlayerId]?.name : null;
    const description = injured
      ? `Partido del ${match.date} no completado por lesión de ${injured}.`
      : `Partido del ${match.date} no completado por lesión.`;
    return {
      title: `${t1} vs ${t2} · 🤕 No terminado — LPT`,
      description,
      openGraph: {
        title: `${t1} vs ${t2} · No terminado por lesión`,
        description,
      },
    };
  }

  const description = `Partido programado${match.location ? ` en ${match.location}` : ''}.`;
  return {
    title: `${t1} vs ${t2} · ${match.date} — LPT`,
    description,
    openGraph: {
      title: `${t1} vs ${t2} · ${match.date}`,
      description,
    },
  };
}

function TeamBlock({
  players: ids,
  playerMap,
  sides,
  align,
}: {
  players: string[];
  playerMap: Record<string, { id: string; name: string; nickname: string | null; avatarUrl: string | null; eloRating: number }>;
  sides: Record<string, string | null>;
  align: 'left' | 'right';
}) {
  return (
    <div style={{ textAlign: align, minWidth: 0 }}>
      {ids.map((pid) => {
        const p = playerMap[pid];
        if (!p) return null;
        const side = sides[pid];
        return (
          <Link
            key={pid}
            href={`/players/${pid}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
              padding: '4px 0',
            }}
          >
            {align === 'left' && <LptAvatar player={p} size={30} />}
            <div style={{ minWidth: 0 }}>
              <div className="display" style={{ fontSize: 19, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {displayName(p)}
              </div>
              <div className="small num" style={{ opacity: 0.6, fontSize: 11 }}>
                {Math.round(p.eloRating)} Elo{side === 'drive' ? ' · Drive' : side === 'reves' ? ' · Revés' : ''}
              </div>
            </div>
            {align === 'right' && <LptAvatar player={p} size={30} />}
          </Link>
        );
      })}
    </div>
  );
}

function PairingOptionCard({
  opt,
  idx,
  playerMap,
  relevantPairs,
}: {
  opt: PairingOption;
  idx: number;
  playerMap: Record<string, { id: string; name: string; nickname: string | null; avatarUrl: string | null }>;
  relevantPairs: { player1Id: string; player2Id: string; matchesPlayed: number }[];
}) {
  const best = idx === 0;
  const t1Win = Math.round(opt.team1WinProb * 100);
  const sideTag = (rec: PairingOption['team1SideRec'], pid: string) => {
    if (!rec) return null;
    if (rec.driveSidePlayerId === pid) return 'Drive';
    if (rec.revesSidePlayerId === pid) return 'Revés';
    return null;
  };

  const team = (ids: PairingOption['team1'], teamElo: number, rec: PairingOption['team1SideRec']) => {
    const together = pairMatchesPlayed(ids[0].id, ids[1].id, relevantPairs);
    return (
      <div style={{ flex: 1, minWidth: 0 }}>
        {ids.map((p) => {
          const tag = sideTag(rec, p.id);
          return (
            <Link key={p.id} href={`/players/${p.id}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
              <LptAvatar player={playerMap[p.id]} size={26} />
              <span style={{ fontWeight: 700, fontSize: 13.5 }}>{displayName(playerMap[p.id])}</span>
              {tag && <span className="lpt-badge" style={{ fontSize: 9.5, padding: '2px 7px' }}>{tag}</span>}
            </Link>
          );
        })}
        <div className="small muted num" style={{ fontSize: 11.5, marginTop: 4 }}>
          Elo {Math.round(teamElo)} ·{' '}
          {together === 0 ? <b style={{ color: 'var(--acc-text)' }}>✦ pareja inédita</b> : `${together} juntos`}
        </div>
      </div>
    );
  };

  return (
    <div
      className="lpt-card card-pad"
      style={
        best
          ? { borderColor: 'var(--acc)', boxShadow: 'var(--card-shadow), 0 0 0 1px var(--acc)' }
          : { opacity: idx === 2 ? 0.78 : 1 }
      }
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <span className={`lpt-badge ${best ? 'accent' : ''}`}>
          {best && <Star size={11} strokeWidth={2.6} />} {opt.label}
        </span>
        <span className="small num muted">
          Δ Elo{' '}
          <b style={{ color: opt.eloDiff < 30 ? 'var(--win)' : opt.eloDiff < 80 ? 'var(--warn)' : 'var(--loss)' }}>
            ±{Math.round(opt.eloDiff)}
          </b>
        </span>
      </div>
      <div className="pairing-teams" style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        {team(opt.team1, opt.team1Elo, opt.team1SideRec)}
        <div className="pairing-vs">
          <div className="display" style={{ fontSize: 17, color: 'var(--ink-3)' }}>VS</div>
          <div className="small num" style={{ fontWeight: 800, color: 'var(--acc-text)', fontSize: 12 }}>
            {t1Win}–{100 - t1Win}
          </div>
        </div>
        {team(opt.team2, opt.team2Elo, opt.team2SideRec)}
      </div>
      <div style={{ display: 'flex', height: 5, borderRadius: 99, overflow: 'hidden', gap: 2, marginTop: 12 }}>
        <div style={{ width: `${t1Win}%`, background: 'var(--acc)', animation: 'barGrow 0.8s both' }} />
        <div style={{ flex: 1, background: 'var(--surface-2)' }} />
      </div>
    </div>
  );
}

export default async function MatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [match] = await db.select().from(matches).where(eq(matches.id, id));
  if (!match) notFound();

  const allPlayers = await db.select().from(players);
  const playerMap = Object.fromEntries(allPlayers.map((p) => [p.id, p]));

  const t1p1 = playerMap[match.team1Player1Id];
  const t1p2 = playerMap[match.team1Player2Id];
  const t2p1 = playerMap[match.team2Player1Id];
  const t2p2 = playerMap[match.team2Player2Id];
  const fourPlayers = [t1p1, t1p2, t2p1, t2p2].filter(Boolean);

  const allPlayerIds = [match.team1Player1Id, match.team1Player2Id, match.team2Player1Id, match.team2Player2Id];
  const relevantPairs = await db.select().from(pairStats).where(
    and(
      inArray(pairStats.player1Id, allPlayerIds),
      inArray(pairStats.player2Id, allPlayerIds),
    ),
  );

  const sets = match.status !== 'scheduled'
    ? await db.select().from(matchSets).where(eq(matchSets.matchId, id)).then((s) => s.sort((a, b) => a.setNumber - b.setNumber))
    : [];

  // Cambios de Elo de este partido (badges por jugador)
  const eloDeltas = match.status === 'completed'
    ? await db.select().from(ratingHistory).where(eq(ratingHistory.matchId, id))
    : [];

  const playerCompletedMatches = match.status === 'scheduled' && fourPlayers.length === 4
    ? await db.select().from(matches).where(
        or(
          inArray(matches.team1Player1Id, allPlayerIds),
          inArray(matches.team1Player2Id, allPlayerIds),
          inArray(matches.team2Player1Id, allPlayerIds),
          inArray(matches.team2Player2Id, allPlayerIds),
        ),
      )
    : [];
  const completedOnly = playerCompletedMatches.filter((m) => m.status === 'completed');

  const sideStatsByPlayer: Record<string, ReturnType<typeof computeSideStats>> = {};
  for (const pid of allPlayerIds) {
    sideStatsByPlayer[pid] = computeSideStats(pid, completedOnly);
  }

  const pairingOptions = match.status === 'scheduled' && fourPlayers.length === 4
    ? recommendPairings([t1p1!, t1p2!, t2p1!, t2p2!], sideStatsByPlayer)
    : null;

  const isUp = match.status === 'scheduled';
  const isInjury = match.status === 'injury_aborted';
  const prediction = isUp && fourPlayers.length === 4
    ? Math.round(expectedScore((t1p1!.eloRating + t1p2!.eloRating) / 2, (t2p1!.eloRating + t2p2!.eloRating) / 2) * 100)
    : null;

  const sides: Record<string, string | null> = {
    [match.team1Player1Id]: match.team1Player1Side,
    [match.team1Player2Id]: match.team1Player2Side,
    [match.team2Player1Id]: match.team2Player1Side,
    [match.team2Player2Id]: match.team2Player2Side,
  };

  const matchUrl = `https://lomeros-padel-tour.vercel.app/matches/${match.id}`;
  const injured = match.injuredPlayerId ? playerMap[match.injuredPlayerId] : null;

  return (
    <>
      <Link href="/matches" className="sec-link" style={{ marginBottom: 14, display: 'inline-flex' }}>
        <ArrowLeft size={14} /> Partidos
      </Link>

      {/* Foto del partido */}
      {match.photoUrl && (
        <div className="lpt-card" style={{ position: 'relative', height: 'clamp(200px, 45vw, 380px)', marginBottom: 18, overflow: 'hidden' }}>
          <Image
            src={match.photoUrl}
            alt={`Foto del partido del ${match.date}`}
            fill
            priority
            sizes="(max-width: 768px) 100vw, 1024px"
            className="object-cover"
          />
        </div>
      )}

      {/* Hero del partido */}
      <div className="hero section" style={{ padding: 'calc(26px * var(--sp))' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 20 }}>
          <span className="small" style={{ display: 'flex', alignItems: 'center', gap: 12, opacity: 0.75, fontWeight: 600, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Calendar size={13} /> {formatMatchDate(match.date)}
            </span>
            {match.location && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <MapPin size={13} /> {match.location}
              </span>
            )}
          </span>
          <StatusPill status={match.status} />
        </div>

        {isUp ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 14, alignItems: 'center' }}>
            <TeamBlock players={[match.team1Player1Id, match.team1Player2Id]} playerMap={playerMap} sides={sides} align="left" />
            <div style={{ textAlign: 'center' }}>
              <div className="display" style={{ fontSize: 36, color: 'var(--acc)' }}>VS</div>
              <div className="small" style={{ opacity: 0.6, letterSpacing: '0.12em', textTransform: 'uppercase', fontSize: 10 }}>Pendiente</div>
            </div>
            <TeamBlock players={[match.team2Player1Id, match.team2Player2Id]} playerMap={playerMap} sides={sides} align="right" />
          </div>
        ) : (
          <ScoreGrid
            team1={[t1p1, t1p2]}
            team2={[t2p1, t2p2]}
            sets={sets}
            winnerTeam={isInjury ? null : match.winnerTeam}
            injuredPlayerId={match.injuredPlayerId}
          />
        )}

        {/* Predicción */}
        {isUp && prediction != null && (
          <div style={{ marginTop: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 800, marginBottom: 6 }}>
              <span className="num">{prediction}%</span>
              <span style={{ opacity: 0.6, letterSpacing: '0.1em', textTransform: 'uppercase', fontSize: 10, fontWeight: 700 }}>Predicción Elo</span>
              <span className="num">{100 - prediction}%</span>
            </div>
            <div style={{ display: 'flex', height: 8, borderRadius: 99, overflow: 'hidden', gap: 2 }}>
              <div style={{ width: `${prediction}%`, background: 'var(--acc)', borderRadius: '99px 0 0 99px', animation: 'barGrow 0.9s both' }} />
              <div style={{ flex: 1, background: 'color-mix(in oklab, currentcolor 25%, transparent)', borderRadius: '0 99px 99px 0' }} />
            </div>
          </div>
        )}

        {isInjury && (
          <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 10, opacity: 0.85 }}>
            <Bandage size={16} style={{ color: 'var(--loss)', flexShrink: 0 }} />
            <span className="small" style={{ fontWeight: 600 }}>
              {injured ? <>Lesión de <b>{displayName(injured)}</b> — el partido no cuenta para el ranking.</> : 'No terminado por lesión — el partido no cuenta para el ranking.'}
            </span>
          </div>
        )}

        {/* Deltas Elo */}
        {eloDeltas.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 22 }}>
            {eloDeltas.map((rh) => {
              const p = playerMap[rh.playerId];
              if (!p) return null;
              const d = Math.round(rh.eloChange);
              return (
                <Link key={rh.playerId} href={`/players/${rh.playerId}`} className={`lpt-badge ${d >= 0 ? 'win' : 'loss'}`}>
                  {displayName(p)} {d >= 0 ? '+' : ''}{d}
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'calc(28px * var(--sp))' }}>
        <ShareMatchButton url={matchUrl} />
      </div>

      {/* Recomendador de parejas */}
      {pairingOptions && (
        <section className="section">
          <SectionHead icon={Target} title="Parejas recomendadas" />
          <p className="muted small" style={{ margin: '0 0 14px' }}>
            Las 3 combinaciones posibles con estos 4 jugadores, ordenadas por equilibrio de Elo. Incluye lados sugeridos (drive / revés).
          </p>
          <div className="stagger" style={{ display: 'grid', gap: 'calc(12px * var(--sp))' }}>
            {pairingOptions.map((opt, i) => (
              <PairingOptionCard key={i} opt={opt} idx={i} playerMap={playerMap} relevantPairs={relevantPairs} />
            ))}
          </div>
        </section>
      )}

      {/* Historial de estas parejas */}
      {relevantPairs.filter((p) => p.matchesPlayed > 0).length > 0 && (
        <section className="section">
          <SectionHead icon={Users} title="Historial de estas parejas" />
          <div className="grid-2 stagger">
            {relevantPairs
              .filter((p) => p.matchesPlayed > 0)
              .sort((a, b) => b.matchesPlayed - a.matchesPlayed)
              .map((pair) => {
                const a = playerMap[pair.player1Id];
                const b = playerMap[pair.player2Id];
                const wr = pair.matchesPlayed > 0 ? Math.round((pair.wins / pair.matchesPlayed) * 100) : 0;
                const synergyPct = Math.round(pair.synergyScore * 100);
                return (
                  <div key={pair.id} className="lpt-card card-pad" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <AvatarStack players={[a, b] as (LptPlayer | undefined)[]} size={30} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13.5 }}>
                        {displayName(a)} & {displayName(b)}
                      </div>
                      <div className="small muted" style={{ fontSize: 11.5 }}>
                        {pair.matchesPlayed} juntos · {pair.wins}V {pair.losses}D
                      </div>
                    </div>
                    <span className={`synergy ${synergyPct >= 0 ? 'pos' : 'neg'}`}>
                      {synergyPct >= 0 ? '+' : ''}{synergyPct}%
                    </span>
                    <span className="elo-num num" style={{ fontSize: 18 }}>{wr}%</span>
                  </div>
                );
              })}
          </div>
        </section>
      )}
    </>
  );
}
