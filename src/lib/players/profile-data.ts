import { db } from '@/lib/db';
import { matches, ratingHistory, pairStats, playerAchievements, type Player } from '@/lib/db/schema';
import { eq, or, desc } from 'drizzle-orm';
import { getPlayerInGroup, listAllPlayersInGroup } from '@/lib/players/queries';
import { listRatingHistoryInGroup } from '@/lib/rating/queries';
import { computeSideStats } from '@/lib/rating/side-stats';
import { computeAllRivalries } from '@/lib/rating/head-to-head';
import { detectRankChanges } from '@/lib/feed/rank-changes';
import { findUnplayedPartners } from '@/lib/players/unplayed-partners';

export async function loadPlayerProfile(groupId: string, id: string) {
  const player = await getPlayerInGroup(groupId, id);
  if (!player) return null;

  // Estas seis lecturas son mutuamente independientes (solo dependen de id/groupId,
  // no unas de otras): en paralelo con un solo Promise.all para no encadenar RTTs a
  // la DB en la vista de detalle más visitada.
  const [playerMatches, history, pairs, allPlayers, globalHistory, earnedGrants] =
    await Promise.all([
      db
        .select()
        .from(matches)
        .where(
          or(
            eq(matches.team1Player1Id, id),
            eq(matches.team1Player2Id, id),
            eq(matches.team2Player1Id, id),
            eq(matches.team2Player2Id, id)
          )
        )
        .orderBy(desc(matches.date)),
      db
        .select()
        .from(ratingHistory)
        .where(eq(ratingHistory.playerId, id))
        .orderBy(ratingHistory.recordedAt),
      db
        .select()
        .from(pairStats)
        .where(or(eq(pairStats.player1Id, id), eq(pairStats.player2Id, id)))
        .orderBy(desc(pairStats.wins)),
      listAllPlayersInGroup(groupId),
      listRatingHistoryInGroup(groupId),
      db
        .select()
        .from(playerAchievements)
        .where(eq(playerAchievements.playerId, id))
        .orderBy(desc(playerAchievements.earnedAt)),
    ]);

  const completedMatches = playerMatches.filter((m) => m.status === 'completed');
  const playerMap = Object.fromEntries(allPlayers.map((p) => [p.id, p]));
  const allRankEvents = detectRankChanges(globalHistory, allPlayers);
  const playerRankEvents = allRankEvents.filter((e) => e.playerId === id);

  const recentForm = completedMatches.slice(0, 8).map((m) => {
    const isTeam1 = m.team1Player1Id === id || m.team1Player2Id === id;
    return (isTeam1 && m.winnerTeam === 1) || (!isTeam1 && m.winnerTeam === 2) ? 'W' : 'L';
  });

  const winRate = player.matchesPlayed > 0
    ? Math.round((player.wins / player.matchesPlayed) * 100)
    : 0;

  const bestPartner = pairs
    .filter((p) => p.matchesPlayed >= 2)
    .sort((a, b) => (b.wins / b.matchesPlayed) - (a.wins / a.matchesPlayed))[0];
  const bestPartnerPlayer = bestPartner
    ? playerMap[bestPartner.player1Id === id ? bestPartner.player2Id : bestPartner.player1Id]
    : null;

  const worstPartner = pairs
    .filter((p) => p.matchesPlayed >= 2)
    .sort((a, b) => (a.wins / a.matchesPlayed) - (b.wins / b.matchesPlayed))[0];
  const worstPartnerPlayer = worstPartner
    ? playerMap[worstPartner.player1Id === id ? worstPartner.player2Id : worstPartner.player1Id]
    : null;

  // Only show "worst" card if it's a DIFFERENT player from "best"
  const showWorstCard =
    worstPartnerPlayer != null &&
    bestPartnerPlayer != null &&
    worstPartnerPlayer.id !== bestPartnerPlayer.id;

  // Unplayed partners
  // allPlayers covers the snapshot we need (full player list).
  const unplayed = findUnplayedPartners(id, allPlayers, pairs);
  // Total candidates = active players (matchesPlayed > 0), excluding the target.
  const totalCandidates = allPlayers.filter(
    (p) => p.id !== id && p.matchesPlayed > 0,
  ).length;

  const sideStats = computeSideStats(id, completedMatches);
  const hasSideData = sideStats.drive.matches > 0 || sideStats.reves.matches > 0;
  const driveBetter = sideStats.drive.winRate >= sideStats.reves.winRate;

  const rivalries = computeAllRivalries(id, completedMatches, allPlayers);

  const chartData = history.map((h) => ({ date: h.recordedAt, elo: Math.round(h.eloAfter) }));
  // Per-match ELO change for this player, keyed by matchId (used in the match history list).
  const eloChangeByMatch: Record<string, number> = {};
  for (const h of history) {
    eloChangeByMatch[h.matchId] = Math.round(h.eloChange);
  }
  const eloChange = Math.round(player.eloRating - 1500);
  const streak = (() => {
    let count = 0;
    const first = recentForm[0];
    if (!first) return { type: '-', count: 0 };
    for (const r of recentForm) {
      if (r === first) count++; else break;
    }
    return { type: first, count };
  })();

  return {
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
    eloChange,
    eloChangeByMatch,
    streak,
  };
}

export type PlayerProfileData = NonNullable<Awaited<ReturnType<typeof loadPlayerProfile>>>;
// Re-export Player type for consumers that need it
export type { Player };
