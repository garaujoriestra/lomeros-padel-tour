import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { matches, matchSets, players, pairStats } from '@/lib/db/schema';
import { eq, and, inArray, or } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { recommendPairings } from '@/lib/rating/recommend-pairs';
import { computeSideStats } from '@/lib/rating/side-stats';
import { expectedScore } from '@/lib/rating/elo';
import { ShareMatchButton } from '@/components/shared/share-match-button';
import { headers } from 'next/headers';

export const dynamic = 'force-dynamic';

function SideBadge({ side }: { side: string | null }) {
  if (side !== 'drive' && side !== 'reves') return null;
  const colors = side === 'drive'
    ? 'bg-blue-500/20 border border-blue-400/40 text-blue-200'
    : 'bg-purple-500/20 border border-purple-400/40 text-purple-200';
  return (
    <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded font-bold ${colors}`}>
      {side === 'drive' ? 'D' : 'R'}
    </span>
  );
}

function SideSuggestionBadge({ rec, playerId }: { rec: { driveSidePlayerId: string; revesSidePlayerId: string } | null; playerId: string }) {
  if (!rec) return null;
  if (rec.driveSidePlayerId === playerId) {
    return <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded font-bold bg-blue-100 text-blue-700">🟦 Drive sugerido</span>;
  }
  if (rec.revesSidePlayerId === playerId) {
    return <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded font-bold bg-purple-100 text-purple-700">🟪 Revés sugerido</span>;
  }
  return null;
}

function PredictionLine({
  team1Elo,
  team2Elo,
  variant,
}: {
  team1Elo: number;
  team2Elo: number;
  variant: 'hero' | 'recommender';
}) {
  const team1Pct = Math.round(expectedScore(team1Elo, team2Elo) * 100);
  const team2Pct = 100 - team1Pct;
  if (variant === 'hero') {
    return (
      <p className="text-xs sm:text-sm text-white/70 mt-1 font-bold tabular-nums">
        <span className="text-blue-300">🔵 {team1Pct}%</span>
        <span className="mx-1.5 text-white/40">–</span>
        <span className="text-red-300">{team2Pct}% 🔴</span>
      </p>
    );
  }
  return (
    <p className="text-xs font-bold tabular-nums mt-1">
      <span className="text-blue-600">🔵 {team1Pct}%</span>
      <span className="mx-1.5 text-gray-300">–</span>
      <span className="text-red-600">{team2Pct}% 🔴</span>
    </p>
  );
}

function InjuryPlayerLine({
  player,
  side,
  injured,
  align,
}: {
  player: { id: string; name: string } | undefined;
  side: string | null;
  injured: boolean;
  align: 'left' | 'right';
}) {
  const className = `text-lg sm:text-xl font-black hover:opacity-80 transition-colors ${injured ? 'text-rose-300' : 'text-green-200'} ${align === 'right' ? 'text-right' : ''}`;
  return (
    <Link href={player ? `/players/${player.id}` : '#'}>
      <p className={className}>
        {injured && '🤕 '}
        {player?.name ?? '?'}
        <SideBadge side={side} />
      </p>
    </Link>
  );
}

function InjuryLayout({
  t1p1,
  t1p2,
  t2p1,
  t2p2,
  injuredPlayerId,
  sides,
}: {
  t1p1?: { id: string; name: string };
  t1p2?: { id: string; name: string };
  t2p1?: { id: string; name: string };
  t2p2?: { id: string; name: string };
  injuredPlayerId: string | null;
  sides: {
    team1Player1Side: string | null;
    team1Player2Side: string | null;
    team2Player1Side: string | null;
    team2Player2Side: string | null;
  };
}) {
  return (
    <div className="space-y-5">
      {/* Mobile stacked */}
      <div className="sm:hidden space-y-3">
        <div className="space-y-1">
          <InjuryPlayerLine player={t1p1} side={sides.team1Player1Side} injured={t1p1?.id === injuredPlayerId} align="left" />
          <InjuryPlayerLine player={t1p2} side={sides.team1Player2Side} injured={t1p2?.id === injuredPlayerId} align="left" />
        </div>
        <div className="text-center py-2">
          <p className="text-4xl">🤕</p>
          <p className="text-rose-300 text-sm font-black mt-1 uppercase tracking-widest">No terminado</p>
          <p className="text-rose-200/80 text-xs mt-0.5">Partido sin contar para ranking</p>
        </div>
        <div className="space-y-1">
          <InjuryPlayerLine player={t2p1} side={sides.team2Player1Side} injured={t2p1?.id === injuredPlayerId} align="left" />
          <InjuryPlayerLine player={t2p2} side={sides.team2Player2Side} injured={t2p2?.id === injuredPlayerId} align="left" />
        </div>
      </div>

      {/* ≥sm horizontal */}
      <div className="hidden sm:grid grid-cols-[1fr_auto_1fr] gap-6 items-center">
        <div className="space-y-2">
          <InjuryPlayerLine player={t1p1} side={sides.team1Player1Side} injured={t1p1?.id === injuredPlayerId} align="left" />
          <InjuryPlayerLine player={t1p2} side={sides.team1Player2Side} injured={t1p2?.id === injuredPlayerId} align="left" />
        </div>
        <div className="text-center">
          <p className="text-5xl">🤕</p>
          <p className="text-rose-300 text-sm font-black mt-2 uppercase tracking-widest">No terminado</p>
          <p className="text-rose-200/80 text-xs mt-0.5">Partido sin contar</p>
        </div>
        <div className="space-y-2">
          <InjuryPlayerLine player={t2p1} side={sides.team2Player1Side} injured={t2p1?.id === injuredPlayerId} align="right" />
          <InjuryPlayerLine player={t2p2} side={sides.team2Player2Side} injured={t2p2?.id === injuredPlayerId} align="right" />
        </div>
      </div>
    </div>
  );
}

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

  // Pair stats for these 4 players (both player slots restricted to the match's 4 ids)
  const allPlayerIds = [match.team1Player1Id, match.team1Player2Id, match.team2Player1Id, match.team2Player2Id];
  const relevantPairs = await db.select().from(pairStats).where(
    and(
      inArray(pairStats.player1Id, allPlayerIds),
      inArray(pairStats.player2Id, allPlayerIds),
    ),
  );

  // Sets (for completed matches)
  const sets = match.status === 'completed'
    ? await db.select().from(matchSets).where(eq(matchSets.matchId, id)).then((s) => s.sort((a, b) => a.setNumber - b.setNumber))
    : [];

  // Build side stats for the 4 players (only when we'll show pairing recommendations)
  const fourPlayerIds = [match.team1Player1Id, match.team1Player2Id, match.team2Player1Id, match.team2Player2Id];
  const playerCompletedMatches = match.status === 'scheduled' && fourPlayers.length === 4
    ? await db.select().from(matches).where(
        or(
          inArray(matches.team1Player1Id, fourPlayerIds),
          inArray(matches.team1Player2Id, fourPlayerIds),
          inArray(matches.team2Player1Id, fourPlayerIds),
          inArray(matches.team2Player2Id, fourPlayerIds),
        ),
      )
    : [];

  const completedOnly = playerCompletedMatches.filter((m) => m.status === 'completed');

  const sideStatsByPlayer: Record<string, ReturnType<typeof computeSideStats>> = {};
  for (const pid of fourPlayerIds) {
    sideStatsByPlayer[pid] = computeSideStats(pid, completedOnly);
  }

  // Pairing recommendations (only for scheduled)
  const pairingOptions = match.status === 'scheduled' && fourPlayers.length === 4
    ? recommendPairings([t1p1!, t1p2!, t2p1!, t2p2!], sideStatsByPlayer)
    : null;

  const t1Sets = sets.filter((s) => s.team1Games > s.team2Games).length;
  const t2Sets = sets.filter((s) => s.team2Games > s.team1Games).length;

  // Build absolute URL for the share button
  const headersList = await headers();
  const host = headersList.get('host') ?? 'lomeros-padel-tour.vercel.app';
  const proto = host.includes('localhost') ? 'http' : 'https';
  const matchUrl = `${proto}://${host}/matches/${match.id}`;

  return (
    <div className="space-y-8">

      {/* Photo hero */}
      {match.photoUrl && (
        <div className="relative w-full h-[60vh] sm:h-[500px] rounded-2xl overflow-hidden bg-gray-100">
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

      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-br from-green-950 via-green-900 to-emerald-800 text-white shadow-2xl">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_30%,rgba(74,222,128,0.07)_0%,transparent_60%)]" />
        <div className="relative p-5 sm:p-8 md:p-10">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-6">
            <div className="flex items-center gap-2 sm:gap-3 text-sm">
              <Link href="/matches" className="text-green-300 hover:text-white transition-colors font-medium">
                ← Partidos
              </Link>
              <span className="text-green-700">·</span>
              <span className="text-green-300">{match.date}</span>
              {match.location && <span className="text-green-400 hidden sm:inline">· 📍 {match.location}</span>}
            </div>
            {match.location && <span className="text-green-400 text-xs sm:hidden">📍 {match.location}</span>}
            <span className={`self-start sm:ml-auto px-3 py-1 rounded-full text-xs font-black ${
              match.status === 'scheduled'
                ? 'bg-blue-500/20 border border-blue-400/30 text-blue-200'
                : match.status === 'injury_aborted'
                  ? 'bg-rose-500/20 border border-rose-400/30 text-rose-200'
                  : 'bg-green-500/20 border border-green-400/30 text-green-200'
            }`}>
              {match.status === 'scheduled' ? '📅 Programado' : match.status === 'injury_aborted' ? '🤕 No terminado · Lesión' : '✅ Completado'}
            </span>
          </div>

          {match.status === 'injury_aborted' ? (
            <InjuryLayout
              t1p1={t1p1}
              t1p2={t1p2}
              t2p1={t2p1}
              t2p2={t2p2}
              injuredPlayerId={match.injuredPlayerId ?? null}
              sides={{
                team1Player1Side: match.team1Player1Side,
                team1Player2Side: match.team1Player2Side,
                team2Player1Side: match.team2Player1Side,
                team2Player2Side: match.team2Player2Side,
              }}
            />
          ) : match.status === 'completed' ? (
            <>
              {/* Mobile stacked */}
              <div className="sm:hidden space-y-4">
                <div className={match.winnerTeam === 2 ? 'opacity-50' : ''}>
                  <div className="space-y-1">
                    {[t1p1, t1p2].map((p, i) => (
                      <Link key={i} href={p ? `/players/${p.id}` : '#'}>
                        <p className={`text-lg font-black hover:text-green-300 transition-colors ${match.winnerTeam === 1 ? 'text-white' : 'text-green-200'}`}>
                          {p?.name ?? '?'}
                          <SideBadge side={i === 0 ? match.team1Player1Side : match.team1Player2Side} />
                        </p>
                      </Link>
                    ))}
                    {match.winnerTeam === 1 && (
                      <span className="inline-flex items-center gap-1.5 text-xs font-black text-green-300 bg-green-500/20 border border-green-400/30 rounded-full px-3 py-0.5 mt-1">
                        🏆 GANADOR
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-center gap-3">
                  <span className={`text-4xl font-black tabular-nums ${match.winnerTeam === 1 ? 'text-green-400' : 'text-white/30'}`}>{t1Sets}</span>
                  <span className="text-white/30 font-black text-xl">—</span>
                  <span className={`text-4xl font-black tabular-nums ${match.winnerTeam === 2 ? 'text-green-400' : 'text-white/30'}`}>{t2Sets}</span>
                </div>
                <div className="flex justify-center gap-2">
                  {sets.map((s) => (
                    <div key={s.setNumber} className="flex flex-col items-center">
                      <span className="text-green-400/60 text-[10px] mb-0.5">S{s.setNumber}</span>
                      <div className="flex items-center gap-1 font-mono text-xs bg-white/10 rounded-lg px-2 py-1">
                        <span className={s.team1Games > s.team2Games ? 'font-black text-white' : 'text-white/30'}>{s.team1Games}</span>
                        <span className="text-white/20 text-[10px]">–</span>
                        <span className={s.team2Games > s.team1Games ? 'font-black text-white' : 'text-white/30'}>{s.team2Games}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className={match.winnerTeam === 1 ? 'opacity-50' : ''}>
                  <div className="space-y-1">
                    {[t2p1, t2p2].map((p, i) => (
                      <Link key={i} href={p ? `/players/${p.id}` : '#'}>
                        <p className={`text-lg font-black hover:text-green-300 transition-colors ${match.winnerTeam === 2 ? 'text-white' : 'text-green-200'}`}>
                          {p?.name ?? '?'}
                          <SideBadge side={i === 0 ? match.team2Player1Side : match.team2Player2Side} />
                        </p>
                      </Link>
                    ))}
                    {match.winnerTeam === 2 && (
                      <span className="inline-flex items-center gap-1.5 text-xs font-black text-green-300 bg-green-500/20 border border-green-400/30 rounded-full px-3 py-0.5 mt-1">
                        🏆 GANADOR
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* ≥sm horizontal — original layout */}
              <div className="hidden sm:grid grid-cols-[1fr_auto_1fr] gap-6 items-center">
                <div className={match.winnerTeam === 2 ? 'opacity-50' : ''}>
                  <div className="space-y-2">
                    {[t1p1, t1p2].map((p, i) => (
                      <Link key={i} href={p ? `/players/${p.id}` : '#'}>
                        <p className={`text-xl font-black hover:text-green-300 transition-colors ${match.winnerTeam === 1 ? 'text-white' : 'text-green-200'}`}>
                          {p?.name ?? '?'}
                          <SideBadge side={i === 0 ? match.team1Player1Side : match.team1Player2Side} />
                        </p>
                      </Link>
                    ))}
                    {match.winnerTeam === 1 && (
                      <span className="inline-flex items-center gap-1.5 text-sm font-black text-green-300 bg-green-500/20 border border-green-400/30 rounded-full px-3 py-1 mt-2">
                        🏆 GANADOR
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-center gap-3">
                  <div className="flex items-center gap-3">
                    <span className={`text-5xl font-black tabular-nums ${match.winnerTeam === 1 ? 'text-green-400' : 'text-white/30'}`}>{t1Sets}</span>
                    <span className="text-white/30 font-black text-2xl">—</span>
                    <span className={`text-5xl font-black tabular-nums ${match.winnerTeam === 2 ? 'text-green-400' : 'text-white/30'}`}>{t2Sets}</span>
                  </div>
                  <div className="flex gap-2">
                    {sets.map((s) => (
                      <div key={s.setNumber} className="flex flex-col items-center">
                        <span className="text-green-400/60 text-xs mb-1">S{s.setNumber}</span>
                        <div className="flex items-center gap-1 font-mono text-sm bg-white/10 rounded-lg px-2.5 py-1.5">
                          <span className={s.team1Games > s.team2Games ? 'font-black text-white' : 'text-white/30'}>{s.team1Games}</span>
                          <span className="text-white/20 text-xs">–</span>
                          <span className={s.team2Games > s.team1Games ? 'font-black text-white' : 'text-white/30'}>{s.team2Games}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className={`text-right ${match.winnerTeam === 1 ? 'opacity-50' : ''}`}>
                  <div className="space-y-2">
                    {[t2p1, t2p2].map((p, i) => (
                      <Link key={i} href={p ? `/players/${p.id}` : '#'}>
                        <p className={`text-xl font-black hover:text-green-300 transition-colors ${match.winnerTeam === 2 ? 'text-white' : 'text-green-200'}`}>
                          {p?.name ?? '?'}
                          <SideBadge side={i === 0 ? match.team2Player1Side : match.team2Player2Side} />
                        </p>
                      </Link>
                    ))}
                    {match.winnerTeam === 2 && (
                      <div className="flex justify-end mt-2">
                        <span className="inline-flex items-center gap-1.5 text-sm font-black text-green-300 bg-green-500/20 border border-green-400/30 rounded-full px-3 py-1">
                          🏆 GANADOR
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* Scheduled layout */
            <>
              {/* Mobile stacked */}
              <div className="sm:hidden space-y-3">
                <div className="space-y-1">
                  {[t1p1, t1p2].map((p, i) => (
                    <Link key={i} href={p ? `/players/${p.id}` : '#'}>
                      <p className="text-lg font-black text-white hover:text-green-300 transition-colors">
                        {p?.name ?? '?'}
                        <SideBadge side={i === 0 ? match.team1Player1Side : match.team1Player2Side} />
                      </p>
                    </Link>
                  ))}
                </div>
                <div className="text-center">
                  <p className="text-3xl font-black text-blue-300">VS</p>
                  <p className="text-blue-300/60 text-xs mt-1 uppercase tracking-widest">Pendiente</p>
                  {t1p1 && t1p2 && t2p1 && t2p2 && (
                    <PredictionLine
                      team1Elo={(t1p1.eloRating + t1p2.eloRating) / 2}
                      team2Elo={(t2p1.eloRating + t2p2.eloRating) / 2}
                      variant="hero"
                    />
                  )}
                </div>
                <div className="space-y-1">
                  {[t2p1, t2p2].map((p, i) => (
                    <Link key={i} href={p ? `/players/${p.id}` : '#'}>
                      <p className="text-lg font-black text-white hover:text-green-300 transition-colors">
                        {p?.name ?? '?'}
                        <SideBadge side={i === 0 ? match.team2Player1Side : match.team2Player2Side} />
                      </p>
                    </Link>
                  ))}
                </div>
              </div>

              {/* ≥sm horizontal */}
              <div className="hidden sm:grid grid-cols-[1fr_auto_1fr] gap-6 items-center">
                <div className="space-y-2">
                  {[t1p1, t1p2].map((p, i) => (
                    <Link key={i} href={p ? `/players/${p.id}` : '#'}>
                      <p className="text-xl font-black text-white hover:text-green-300 transition-colors">
                        {p?.name ?? '?'}
                        <SideBadge side={i === 0 ? match.team1Player1Side : match.team1Player2Side} />
                      </p>
                    </Link>
                  ))}
                </div>
                <div className="text-center">
                  <p className="text-4xl font-black text-blue-300">VS</p>
                  <p className="text-blue-300/60 text-xs mt-1 uppercase tracking-widest">Pendiente</p>
                  {t1p1 && t1p2 && t2p1 && t2p2 && (
                    <PredictionLine
                      team1Elo={(t1p1.eloRating + t1p2.eloRating) / 2}
                      team2Elo={(t2p1.eloRating + t2p2.eloRating) / 2}
                      variant="hero"
                    />
                  )}
                </div>
                <div className="text-right space-y-2">
                  {[t2p1, t2p2].map((p, i) => (
                    <Link key={i} href={p ? `/players/${p.id}` : '#'}>
                      <p className="text-xl font-black text-white hover:text-green-300 transition-colors">
                        {p?.name ?? '?'}
                        <SideBadge side={i === 0 ? match.team2Player1Side : match.team2Player2Side} />
                      </p>
                    </Link>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Share button — both completed and scheduled */}
      <div className="flex justify-end">
        <ShareMatchButton url={matchUrl} />
      </div>

      {/* Pairing Recommender — only for scheduled matches */}
      {pairingOptions && (
        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-black text-gray-900">🎯 Parejas recomendadas</h2>
            <div className="flex-1 h-px bg-gradient-to-r from-green-300/60 to-transparent" />
          </div>
          <p className="text-sm text-gray-500">Las 3 combinaciones posibles con estos 4 jugadores, ordenadas de más a menos equilibradas según el Elo actual.</p>
          <div className="grid gap-4">
            {pairingOptions.map((opt, idx) => (
              <div
                key={idx}
                className={`bg-white rounded-2xl border shadow-sm p-4 sm:p-6 ${
                  idx === 0
                    ? 'border-green-200 shadow-green-100/50 ring-1 ring-green-200'
                    : idx === 1
                    ? 'border-yellow-100'
                    : 'border-gray-100 opacity-80'
                }`}
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
                  <span className={`self-start px-3 py-1 rounded-full text-xs font-black ${
                    idx === 0
                      ? 'bg-green-100 text-green-700'
                      : idx === 1
                      ? 'bg-yellow-100 text-yellow-700'
                      : 'bg-gray-100 text-gray-500'
                  }`}>
                    {idx === 0 ? '⭐ ' : ''}{opt.label}
                  </span>
                  <div className="sm:text-right">
                    <p className="text-xs text-gray-400">Diferencia de Elo</p>
                    <p className={`text-lg font-black tabular-nums ${opt.eloDiff < 30 ? 'text-green-600' : opt.eloDiff < 80 ? 'text-yellow-600' : 'text-red-500'}`}>
                      ±{Math.round(opt.eloDiff)}
                    </p>
                    <PredictionLine
                      team1Elo={opt.team1Elo}
                      team2Elo={opt.team2Elo}
                      variant="recommender"
                    />
                  </div>
                </div>

                <div className="grid sm:grid-cols-[1fr_auto_1fr] gap-4 items-center">
                  {/* Team 1 */}
                  <div className="space-y-2">
                    {opt.team1.map((p, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-xs font-black shrink-0">
                          {p.name.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-gray-800 text-sm truncate">
                            {p.name}
                            <SideSuggestionBadge rec={opt.team1SideRec} playerId={p.id} />
                          </p>
                          <p className="text-xs text-gray-400">{Math.round(p.eloRating)} ELO</p>
                        </div>
                      </div>
                    ))}
                    <p className="text-xs font-bold text-blue-600 pl-10">Elo equipo: {Math.round(opt.team1Elo)}</p>
                    {(() => {
                      const [p1, p2] = opt.team1;
                      const mp = pairMatchesPlayed(p1.id, p2.id, relevantPairs);
                      if (mp === 0) {
                        return (
                          <span className="inline-block mt-2 px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-200">
                            ✨ INÉDITA
                          </span>
                        );
                      }
                      return (
                        <p className="text-xs text-gray-400 mt-1.5">{mp} partido{mp !== 1 ? 's' : ''} juntos</p>
                      );
                    })()}
                  </div>

                  <div className="text-center sm:px-2">
                    <span className="text-xl font-black text-gray-300">VS</span>
                  </div>

                  {/* Team 2 — DOM order avatar→text. On ≥sm we use `order` to flip to text→avatar (right-aligned). */}
                  <div className="space-y-2 sm:text-right">
                    {opt.team2.map((p, i) => (
                      <div key={i} className="flex items-center gap-2 sm:justify-end">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-400 to-red-600 flex items-center justify-center text-white text-xs font-black shrink-0 sm:order-2">
                          {p.name.charAt(0)}
                        </div>
                        <div className="min-w-0 sm:order-1">
                          <p className="font-bold text-gray-800 text-sm truncate sm:text-right">
                            {p.name}
                            <SideSuggestionBadge rec={opt.team2SideRec} playerId={p.id} />
                          </p>
                          <p className="text-xs text-gray-400 sm:text-right">{Math.round(p.eloRating)} ELO</p>
                        </div>
                      </div>
                    ))}
                    <p className="text-xs font-bold text-red-600 pl-10 sm:pl-0 sm:pr-10 sm:text-right">Elo equipo: {Math.round(opt.team2Elo)}</p>
                    {(() => {
                      const [p1, p2] = opt.team2;
                      const mp = pairMatchesPlayed(p1.id, p2.id, relevantPairs);
                      if (mp === 0) {
                        return (
                          <span className="inline-block mt-2 px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-200 sm:float-right sm:clear-right">
                            ✨ INÉDITA
                          </span>
                        );
                      }
                      return (
                        <p className="text-xs text-gray-400 mt-1.5 sm:text-right">{mp} partido{mp !== 1 ? 's' : ''} juntos</p>
                      );
                    })()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Pair history between these players */}
      {relevantPairs.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-black text-gray-900">🤝 Historial de parejas</h2>
            <div className="flex-1 h-px bg-gradient-to-r from-green-300/60 to-transparent" />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {relevantPairs
              .filter((p) => p.matchesPlayed > 0)
              .sort((a, b) => b.matchesPlayed - a.matchesPlayed)
              .map((pair) => {
                const p1 = playerMap[pair.player1Id];
                const p2 = playerMap[pair.player2Id];
                const winRate = pair.matchesPlayed > 0
                  ? Math.round((pair.wins / pair.matchesPlayed) * 100)
                  : 0;
                return (
                  <div key={pair.id} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="flex -space-x-2">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white text-sm font-black ring-2 ring-white">
                          {p1?.name.charAt(0) ?? '?'}
                        </div>
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white text-sm font-black ring-2 ring-white">
                          {p2?.name.charAt(0) ?? '?'}
                        </div>
                      </div>
                      <div>
                        <p className="font-bold text-gray-800 text-sm">{p1?.name ?? '?'} & {p2?.name ?? '?'}</p>
                        <p className="text-xs text-gray-400">{pair.matchesPlayed} partidos juntos</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex gap-3 text-sm">
                        <span className="text-green-600 font-bold">{pair.wins}V</span>
                        <span className="text-red-400 font-bold">{pair.losses}D</span>
                      </div>
                      <span className={`text-lg font-black tabular-nums ${winRate >= 60 ? 'text-green-600' : winRate >= 40 ? 'text-yellow-600' : 'text-red-500'}`}>
                        {winRate}%
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${winRate >= 60 ? 'bg-green-500' : winRate >= 40 ? 'bg-yellow-400' : 'bg-red-400'}`}
                        style={{ width: `${winRate}%` }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        </section>
      )}

    </div>
  );
}
