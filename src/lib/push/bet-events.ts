// src/lib/push/bet-events.ts
import { db } from '@/lib/db';
import { matches, players } from '@/lib/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { sendToUsers, userIdsForPlayers } from './send';
import { buildBetSettledNotification } from './notifications';

export interface SettledBetForPush {
  playerId: string;
  status: 'won' | 'lost' | 'refunded';
  amount: number;
  payout: number;
}

// Push individual a cada apostante con su resultado. Best-effort: nunca lanza.
export async function notifyBetSettlements(matchId: string, outcomes: SettledBetForPush[]): Promise<void> {
  try {
    if (outcomes.length === 0) return;
    const [match] = await db.select().from(matches).where(eq(matches.id, matchId));
    if (!match) return;

    const ids = [match.team1Player1Id, match.team1Player2Id, match.team2Player1Id, match.team2Player2Id];
    const rows = await db.select().from(players).where(inArray(players.id, ids));
    const nameOf = (id: string) => {
      const p = rows.find((r) => r.id === id);
      return p?.nickname || p?.name || '?';
    };
    const label = `${nameOf(ids[0])}/${nameOf(ids[1])} vs ${nameOf(ids[2])}/${nameOf(ids[3])}`;

    for (const o of outcomes) {
      const userIds = await userIdsForPlayers([o.playerId]);
      if (userIds.length === 0) continue;
      await sendToUsers(userIds, buildBetSettledNotification(o.status, o.amount, o.payout, label, matchId));
    }
  } catch (error) {
    console.error('notifyBetSettlements error', error);
  }
}
