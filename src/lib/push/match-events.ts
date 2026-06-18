import { db } from '@/lib/db';
import { players } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { sendToUsers, userIdsForPlayers } from './send';
import { buildResultNotification, buildAchievementNotification } from './notifications';
import { computeResultPositions } from '@/lib/rankings/match-positions';
import type { MatchRatingResult } from '@/lib/rating/process-match';

interface MatchTeams {
  id: string;
  groupId: string;
  winnerTeam: 1 | 2;
  team1Player1Id: string;
  team1Player2Id: string;
  team2Player1Id: string;
  team2Player2Id: string;
}

// Envía push de resultado a los 4 jugadores y de logro a quien corresponda.
// Best-effort: nunca lanza; los errores se loguean.
export async function notifyMatchResult(match: MatchTeams, result: MatchRatingResult): Promise<void> {
  try {
    const winners =
      match.winnerTeam === 1
        ? [match.team1Player1Id, match.team1Player2Id]
        : [match.team2Player1Id, match.team2Player2Id];

    // Posición en el ranking (antes → después) de cada participante, con el
    // estado de ELO ya actualizado en la DB.
    const allPlayers = await db
      .select({ id: players.id, eloRating: players.eloRating, matchesPlayed: players.matchesPlayed })
      .from(players)
      .where(eq(players.groupId, match.groupId));
    const positions = computeResultPositions(allPlayers, result.eloChanges);

    for (const ec of result.eloChanges) {
      const userIds = await userIdsForPlayers([ec.playerId]);
      if (userIds.length === 0) continue;
      const didWin = winners.includes(ec.playerId);
      await sendToUsers(
        userIds,
        buildResultNotification(didWin, ec.eloChange, match.id, positions.get(ec.playerId)),
      );
    }

    for (const ach of result.newAchievements) {
      const payload = buildAchievementNotification(ach.achievementId);
      if (!payload) continue;
      const userIds = await userIdsForPlayers([ach.playerId]);
      if (userIds.length === 0) continue;
      await sendToUsers(userIds, payload);
    }
  } catch (error) {
    console.error('notifyMatchResult error', error);
  }
}
