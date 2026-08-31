import { db } from '@/lib/db';
import { getDefaultGroupId } from '@/lib/auth/group-context';
import { listRankedPlayers, listRecentPlayers, listAllPlayersInGroup, countRankedPlayers, listRecentAchievementsInGroup } from '@/lib/players/queries';
import { listRecentMatches, listScheduledMatches, countMatchesInGroup, listMatchSetsForMatches } from '@/lib/matches/queries';
import { listRecentRatingHistoryInGroup } from '@/lib/rating/queries';
import Link from 'next/link';
import { Trophy, Calendar, CalendarDays, CalendarCheck } from 'lucide-react';
import { Podium } from '@/components/shared/podium';
import { MatchCard } from '@/components/shared/match-card';
import { ActivityFeed } from '@/components/shared/activity-feed';
import { InstallPrompt } from '@/components/shared/install-prompt';
import { SectionHead, HeroLines } from '@/components/lpt/ui';
import { CountUp } from '@/components/lpt/count-up';
import { buildFeed } from '@/lib/feed/build-feed';
import { detectRankChanges } from '@/lib/feed/rank-changes';
import { buildPodiumGroups } from '@/lib/rankings/podium-groups';
import { listEventSummaries } from '@/lib/tournament/event-store';
import { eventLiveState } from '@/lib/tournament/event-summary';
import { EventCard } from '@/components/tournament/event-card';
import { DirectionalTransition } from '@/components/shared/view-transitions';
import type { Metadata } from 'next';
import { LOMEROS_GROUP_NAME } from '@/lib/groups/constants';

export const metadata: Metadata = {
  title: { absolute: LOMEROS_GROUP_NAME },
  description: `El ranking oficial de ${LOMEROS_GROUP_NAME}`,
};

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const groupId = await getDefaultGroupId();
  const [
    topPlayers,
    recentMatchesAll,
    upcomingMatches,
    totalMatches,
    totalPlayers,
    recentHistory,
    recentNewPlayers,
    recentAchievements,
    eventSummaries,
    allPlayers,
  ] = await Promise.all([
    listRankedPlayers(groupId, 20),
    listRecentMatches(groupId, 30),
    listScheduledMatches(groupId, 3),
    countMatchesInGroup(groupId),
    countRankedPlayers(groupId),
    listRecentRatingHistoryInGroup(groupId, 100),
    listRecentPlayers(groupId, 5),
    listRecentAchievementsInGroup(groupId, 20),
    listEventSummaries(db, groupId),
    // No depende de nada del batch: se une aquí en vez de esperar en serie.
    listAllPlayersInGroup(groupId),
  ]);

  // Eventos públicos (no borradores), "en directo" primero y luego por fecha desc; máx 4.
  const publicEvents = eventSummaries
    .filter((s) => eventLiveState(s) !== 'upcoming')
    .sort((a, b) => {
      const liveA = eventLiveState(a) === 'live' ? 0 : 1;
      const liveB = eventLiveState(b) === 'live' ? 0 : 1;
      if (liveA !== liveB) return liveA - liveB;
      return b.date.localeCompare(a.date);
    })
    .slice(0, 4);

  const matchIds = recentMatchesAll.map((m) => m.id);
  const allSets = await listMatchSetsForMatches(matchIds);

  const playerMap: Record<string, typeof allPlayers[number]> = {};
  for (const p of allPlayers) playerMap[p.id] = p;

  // Último cambio de Elo por jugador (para los ▲/▼ del podio)
  const lastDelta: Record<string, number> = {};
  for (const rh of recentHistory) {
    if (!(rh.playerId in lastDelta)) lastDelta[rh.playerId] = rh.eloChange;
  }

  // Build the feed
  const rankEvents = detectRankChanges(recentHistory, allPlayers);
  const feedEvents = buildFeed({
    matches: recentMatchesAll,
    matchSets: allSets,
    ratingHistory: recentHistory,
    players: recentNewPlayers,
    rankEvents,
    achievements: recentAchievements.map((a) => ({
      playerId: a.playerId,
      achievementId: a.achievementId,
      earnedAt: a.earnedAt,
    })),
  });

  const podiumPlayers = topPlayers.map((p) => ({ ...p, delta: lastDelta[p.id] ?? null }));
  const season = new Date().getFullYear();

  // Cold-open de retransmisión: el hero abre con lo último que ha pasado en la
  // liga (el resultado más reciente), no solo con el ident de la temporada.
  const lastCompleted = recentMatchesAll.find(
    (m) => (m.status === 'completed' && m.winnerTeam != null) || m.status === 'draw',
  ) ?? null;
  let coldOpen: { text: string; href: string } | null = null;
  if (lastCompleted) {
    const short = (id: string | null) => (id && playerMap[id] ? (playerMap[id].nickname || playerMap[id].name.split(' ')[0]) : '?');
    const score = allSets
      .filter((s) => s.matchId === lastCompleted.id)
      .sort((a, b) => a.setNumber - b.setNumber)
      .map((s) => (lastCompleted.winnerTeam === 2 ? `${s.team2Games}-${s.team1Games}` : `${s.team1Games}-${s.team2Games}`))
      .join(' ');
    const t1 = `${short(lastCompleted.team1Player1Id)} y ${short(lastCompleted.team1Player2Id)}`;
    const t2 = `${short(lastCompleted.team2Player1Id)} y ${short(lastCompleted.team2Player2Id)}`;
    // Sin ganador que anteponer, el empate se lee en el orden del partido.
    const text = lastCompleted.status === 'draw'
      ? `${t1} empatan ${score} con ${t2}`
      : (() => {
          const [winners, losers] = lastCompleted.winnerTeam === 2 ? [t2, t1] : [t1, t2];
          return `${winners} ${score} a ${losers}`;
        })();
    coldOpen = { text, href: `/matches/${lastCompleted.id}` };
  }

  return (
    <DirectionalTransition>
      <div>
      {/* ── HERO ── */}
      <div className="hero section">
        <HeroLines />
        <div style={{ position: 'relative', padding: 'calc(34px * var(--sp)) calc(26px * var(--sp)) calc(26px * var(--sp))', textAlign: 'center' }}>
          <div className="kicker" style={{ justifyContent: 'center', color: 'currentcolor', opacity: 0.65 }}>
            Temporada {season} · Jornada {totalMatches}
          </div>
          <h1 className="display" style={{ fontSize: 'clamp(38px, 7vw, 64px)', margin: '10px 0 4px' }}>
            Lomeros <span style={{ color: 'var(--acc)' }}>Padel Tour</span>
          </h1>
          <p style={{ opacity: 0.65, fontSize: 13.5, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 600, margin: 0 }}>
            El ranking oficial del grupo
          </p>
          {coldOpen && (
            <Link
              href={coldOpen.href}
              transitionTypes={['nav-forward']}
              style={{
                display: 'inline-block',
                marginTop: 14,
                padding: '7px 16px',
                borderRadius: 999,
                background: 'color-mix(in oklab, currentcolor 10%, transparent)',
                border: '1px solid color-mix(in oklab, currentcolor 20%, transparent)',
                fontSize: 13,
                fontWeight: 700,
                color: 'inherit',
              }}
            >
              Último partido: <span className="num">{coldOpen.text}</span> →
            </Link>
          )}
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              gap: 'clamp(22px, 6vw, 60px)',
              marginTop: 'calc(26px * var(--sp))',
              paddingTop: 'calc(20px * var(--sp))',
              borderTop: '1px solid color-mix(in oklab, currentcolor 18%, transparent)',
            }}
          >
            {/* Un-Solo-Rótulo: el lima solo en el dato protagonista (Elo líder);
                los totales de temporada van en tinta. */}
            {([
              [totalMatches, 'Partidos', false],
              [totalPlayers, 'Jugadores', false],
              [topPlayers[0] ? Math.round(topPlayers[0].eloRating) : 1500, 'Elo líder', true],
            ] as [number, string, boolean][]).map(([n, label, isLead]) => (
              <div key={label}>
                <div className="display num" style={{ fontSize: 'clamp(26px, 4.5vw, 42px)', color: isLead ? 'var(--acc)' : 'inherit' }}>
                  <CountUp value={n} />
                </div>
                <div style={{ fontSize: 10.5, letterSpacing: '0.16em', textTransform: 'uppercase', opacity: 0.6, fontWeight: 700, marginTop: 3 }}>
                  {label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <InstallPrompt />

      <div className="grid-main">
        <div>
          {/* ── PODIO ── */}
          {topPlayers.length >= 3 && (
            <section className="section">
              <SectionHead icon={Trophy} title="Clasificación" linkLabel="Ver completa" linkHref="/rankings" />
              <Podium groups={buildPodiumGroups(podiumPlayers)} />
            </section>
          )}

          {/* ── EVENTOS ── */}
          {publicEvents.length > 0 && (
            <section className="section">
              <SectionHead icon={CalendarDays} title="Eventos" linkLabel="Ver todos" linkHref="/eventos" />
              <div className="grid-2 stagger">
                {publicEvents.map((event) => (
                  <EventCard key={event.id} event={event} />
                ))}
              </div>
            </section>
          )}

          {/* ── PRÓXIMOS PARTIDOS ── */}
          {upcomingMatches.length > 0 && (
            <section className="section">
              <SectionHead icon={Calendar} title="Próximos partidos" linkLabel="Ver todos" linkHref="/matches" />
              <div className="grid-2 stagger">
                {upcomingMatches.map((match) => (
                  <MatchCard
                    key={match.id}
                    match={match}
                    team1={[playerMap[match.team1Player1Id], playerMap[match.team1Player2Id]]}
                    team2={[playerMap[match.team2Player1Id], playerMap[match.team2Player2Id]]}
                    href={`/matches/${match.id}`}
                  />
                ))}
              </div>
            </section>
          )}

          {/* ── PLANIFICADOR ── Enlace siempre visible: en móvil (navbar colapsada,
              BottomNav curada sin planner) es la única vía de descubrimiento. */}
          <Link href="/planificador" className="sec-link" style={{ marginBottom: 20 }}>
            <CalendarCheck size={16} /> Planificador semanal →
          </Link>
        </div>

        {/* ── ACTIVIDAD ── */}
        <ActivityFeed events={feedEvents} playerMap={playerMap} />
      </div>

      {/* Empty state */}
      {totalMatches === 0 && (
        <div className="muted" style={{ textAlign: 'center', padding: '40px 0' }}>
          <p style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Aún no hay partidos registrados.</p>
          <p className="small" style={{ marginTop: 8 }}>
            <Link href="/login" style={{ color: 'var(--acc-text)', fontWeight: 700 }}>Entra como admin</Link> para añadir jugadores y el primer partido.
          </p>
        </div>
      )}
      </div>
    </DirectionalTransition>
  );
}
