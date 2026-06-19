import { db } from '@/lib/db';
import { getDefaultGroupId } from '@/lib/auth/group-context';
import { players, matches, matchSets, ratingHistory, playerAchievements } from '@/lib/db/schema';
import { desc, sql, eq, inArray } from 'drizzle-orm';
import Link from 'next/link';
import { Trophy, Calendar, CalendarDays } from 'lucide-react';
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

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const [
    topPlayers,
    recentMatchesAll,
    upcomingMatches,
    [totalMatchesRow],
    [totalPlayersRow],
    recentHistory,
    recentNewPlayers,
    recentAchievements,
    eventSummaries,
  ] = await Promise.all([
    db.select().from(players)
      .where(sql`${players.matchesPlayed} > 0`)
      .orderBy(desc(players.eloRating))
      .limit(20),
    db.select().from(matches).orderBy(desc(matches.date)).limit(30),
    db.select().from(matches).where(eq(matches.status, 'scheduled')).orderBy(matches.date).limit(3),
    db.select({ count: sql<number>`count(*)` }).from(matches),
    db.select({ count: sql<number>`count(*)` }).from(players).where(sql`${players.matchesPlayed} > 0`),
    db.select().from(ratingHistory).orderBy(desc(ratingHistory.recordedAt)).limit(100),
    db.select().from(players).orderBy(desc(players.createdAt)).limit(5),
    db.select().from(playerAchievements).orderBy(desc(playerAchievements.earnedAt)).limit(20),
    listEventSummaries(db, await getDefaultGroupId()),
  ]);

  const totalMatches = totalMatchesRow.count;
  const totalPlayers = totalPlayersRow.count;

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
  const allSets = matchIds.length > 0
    ? await db.select().from(matchSets).where(inArray(matchSets.matchId, matchIds))
    : [];

  const allPlayers = await db.select().from(players);
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

  return (
    <>
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
            {([
              [totalMatches, 'Partidos'],
              [totalPlayers, 'Jugadores'],
              [topPlayers[0] ? Math.round(topPlayers[0].eloRating) : 1500, 'Elo líder'],
            ] as [number, string][]).map(([n, label]) => (
              <div key={label}>
                <div className="display num" style={{ fontSize: 'clamp(26px, 4.5vw, 42px)', color: 'var(--acc)' }}>
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
    </>
  );
}
