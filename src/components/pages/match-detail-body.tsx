import { db } from '@/lib/db';
import { matchSets, pairStats, ratingHistory } from '@/lib/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { getMatchInGroup } from '@/lib/matches/queries';
import { listAllPlayersInGroup } from '@/lib/players/queries';
import { getBetsWithBettorForMatch } from '@/lib/betting/queries';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, Calendar, MapPin, Users, Bandage } from 'lucide-react';
import { expectedScore, projectDoublesElo, type EloProjection } from '@/lib/rating/elo';
import { ShareMatchButton } from '@/components/shared/share-match-button';
import { DirectionalTransition } from '@/components/shared/view-transitions';
import type { PageContext } from '@/lib/auth/page-context';
import { currentMatchPools } from '@/lib/betting/match-odds';
import { bettingClosesAt, isBettingOpen } from '@/lib/betting/close-time';
import { hasPendingPenalty } from '@/lib/betting/settle';
import { BETTING } from '@/lib/betting/config';
import { BettingCard, type PublicBet } from '@/components/betting/betting-card';
import { BetsSummary } from '@/components/betting/bets-summary';
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

function TeamBlock({
  players: ids,
  playerMap,
  sides,
  align,
  projection,
  basePath,
}: {
  players: string[];
  playerMap: Record<string, { id: string; name: string; nickname: string | null; avatarUrl: string | null; eloRating: number }>;
  sides: Record<string, string | null>;
  align: 'left' | 'right';
  projection?: Record<string, EloProjection> | null;
  basePath: string;
}) {
  return (
    <div style={{ textAlign: align, minWidth: 0 }}>
      {ids.map((pid) => {
        const p = playerMap[pid];
        if (!p) return null;
        const side = sides[pid];
        const proj = projection?.[pid];
        return (
          <Link
            key={pid}
            href={`${basePath}/players/${pid}`}
            transitionTypes={['nav-forward']}
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
              {proj && (
                <div
                  data-testid="elo-en-juego"
                  className="small num"
                  style={{
                    display: 'flex',
                    gap: 8,
                    fontSize: 11,
                    fontWeight: 700,
                    marginTop: 1,
                    justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
                  }}
                >
                  <span style={{ color: 'var(--win)' }}>▲ +{proj.ifWin}</span>
                  <span style={{ color: 'var(--loss)' }}>▼ {proj.ifLose}</span>
                </div>
              )}
            </div>
            {align === 'right' && <LptAvatar player={p} size={30} />}
          </Link>
        );
      })}
    </div>
  );
}

// Cuerpo compartido de /matches/[id] (raíz) y /g/[slug]/matches/[id]. Recibe el
// contexto de página ya resuelto (el llamante decide si resolverlo con o sin slug).
export async function MatchDetailBody({ ctx, matchId: id }: { ctx: PageContext; matchId: string }) {
  const { groupId, basePath } = ctx;

  const match = await getMatchInGroup(groupId, id);
  if (!match) notFound();

  const allPlayers = await listAllPlayersInGroup(groupId);
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

  const isUp = match.status === 'scheduled';
  const isInjury = match.status === 'injury_aborted';
  const prediction = isUp && fourPlayers.length === 4
    ? Math.round(expectedScore((t1p1!.eloRating + t1p2!.eloRating) / 2, (t2p1!.eloRating + t2p2!.eloRating) / 2) * 100)
    : null;
  // Elo en juego: cuánto ganaría/perdería cada jugador según el resultado (solo programados).
  const projection = isUp && fourPlayers.length === 4
    ? projectDoublesElo([t1p1!, t1p2!], [t2p1!, t2p2!])
    : null;

  const sides: Record<string, string | null> = {
    [match.team1Player1Id]: match.team1Player1Side,
    [match.team1Player2Id]: match.team1Player2Side,
    [match.team2Player1Id]: match.team2Player1Side,
    [match.team2Player2Id]: match.team2Player2Side,
  };

  const matchUrl = `https://lomeros-padel-tour.vercel.app${basePath}/matches/${match.id}`;
  const injured = match.injuredPlayerId ? playerMap[match.injuredPlayerId] : null;

  // ── La Timba (apuestas) ──
  const bettingOpen = isBettingOpen(match);
  const groupSlug = basePath ? ctx.group.slug : undefined;
  let timba: React.ReactNode = null;
  if (bettingOpen) {
    const pools = await currentMatchPools(match);
    const allBets = (await getBetsWithBettorForMatch(match.id)) as PublicBet[];

    const me = ctx.player;
    const team1Ids = [match.team1Player1Id, match.team1Player2Id];
    const team2Ids = [match.team2Player1Id, match.team2Player2Id];
    const ownTeam: 0 | 1 | 2 = me && team1Ids.includes(me.id) ? 1 : me && team2Ids.includes(me.id) ? 2 : 0;
    const myBets = me ? allBets.filter((b) => b.playerId === me.id) : [];

    timba = (
      <BettingCard
        matchId={match.id}
        groupSlug={groupSlug}
        team1Label={`${displayName(t1p1)}/${displayName(t1p2)}`}
        team2Label={`${displayName(t2p1)}/${displayName(t2p2)}`}
        pools={pools}
        closesAtIso={bettingClosesAt(match.date, match.time).toISOString()}
        balance={me ? me.tokenBalance : null}
        bankrupt={me ? await hasPendingPenalty(me.id) : false}
        ownTeam={ownTeam}
        myBets={myBets}
        allBets={allBets}
        minBet={BETTING.minBet}
        maxBet={BETTING.maxBet}
      />
    );
  } else {
    timba = <BetsSummary matchId={match.id} myPlayerId={ctx.player?.id ?? null} />;
  }

  return (
    <DirectionalTransition>
      <div>
      <Link href={`${basePath}/matches`} transitionTypes={['nav-back']} className="sec-link" style={{ marginBottom: 14, display: 'inline-flex' }}>
        <ArrowLeft size={14} /> Partidos
      </Link>

      {/* Foto del partido */}
      {/* object-contain: las fotos verticales deben verse enteras (letterbox), no recortadas */}
      {match.photoUrl && (
        <div className="lpt-card" style={{ position: 'relative', height: 'min(60vh, 500px)', marginBottom: 18, overflow: 'hidden', background: 'var(--surface-2)' }}>
          <Image
            src={match.photoUrl}
            alt={`Foto del partido del ${match.date}`}
            fill
            priority
            sizes="(max-width: 768px) 100vw, 1024px"
            className="object-contain"
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
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 14, alignItems: 'center' }}>
              <TeamBlock players={[match.team1Player1Id, match.team1Player2Id]} playerMap={playerMap} sides={sides} align="left" projection={projection} basePath={basePath} />
              <div style={{ textAlign: 'center' }}>
                <div className="display" style={{ fontSize: 36, color: 'var(--acc)' }}>VS</div>
                <div className="small" style={{ opacity: 0.6, letterSpacing: '0.12em', textTransform: 'uppercase', fontSize: 10 }}>Pendiente</div>
              </div>
              <TeamBlock players={[match.team2Player1Id, match.team2Player2Id]} playerMap={playerMap} sides={sides} align="right" projection={projection} basePath={basePath} />
            </div>
            {projection && (
              <div className="small" style={{ textAlign: 'center', opacity: 0.55, fontSize: 10.5, marginTop: 10, fontWeight: 600 }}>
                <span style={{ color: 'var(--win)' }}>▲ si gana</span>
                {' · '}
                <span style={{ color: 'var(--loss)' }}>▼ si pierde</span>
                {' (Elo en juego)'}
              </div>
            )}
          </>
        ) : (
          <ScoreGrid
            team1={[t1p1, t1p2]}
            team2={[t2p1, t2p2]}
            sets={sets}
            winnerTeam={isInjury ? null : match.winnerTeam}
            injuredPlayerId={match.injuredPlayerId}
            animated
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
                <Link key={rh.playerId} href={`${basePath}/players/${rh.playerId}`} transitionTypes={['nav-forward']} className={`lpt-badge ${d >= 0 ? 'win' : 'loss'}`}>
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

      {/* La Timba — apuestas */}
      {timba}

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
      </div>
    </DirectionalTransition>
  );
}
