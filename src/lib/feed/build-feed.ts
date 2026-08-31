import type { RankChangeEvent } from './rank-changes';
import { ACHIEVEMENT_BY_ID, type Achievement } from '@/lib/achievements/catalog';

interface MatchLike {
  id: string;
  status: string;
  date: string;
  location: string | null;
  team1Player1Id: string;
  team1Player2Id: string;
  team2Player1Id: string;
  team2Player2Id: string;
  winnerTeam: number | null;
  injuredPlayerId?: string | null;
  createdAt: string;
}

interface MatchSetLike {
  matchId: string;
  setNumber: number;
  team1Games: number;
  team2Games: number;
}

interface RatingHistoryLike {
  playerId: string;
  matchId: string;
  recordedAt: string;
}

interface PlayerLike {
  id: string;
  name: string;
  createdAt: string;
}

export type FeedEvent =
  | {
      type: 'match_completed';
      matchId: string;
      timestamp: string;
      match: MatchLike;
      sets: MatchSetLike[];
    }
  | {
      type: 'match_scheduled';
      matchId: string;
      timestamp: string;
      match: MatchLike;
    }
  | {
      type: 'match_injury_aborted';
      matchId: string;
      timestamp: string;
      match: MatchLike;
    }
  | {
      type: 'match_draw';
      matchId: string;
      timestamp: string;
      match: MatchLike;
      sets: MatchSetLike[];
    }
  | {
      type: 'rank_change';
      timestamp: string;
      event: RankChangeEvent;
    }
  | {
      type: 'new_player';
      timestamp: string;
      player: PlayerLike;
    }
  | {
      type: 'achievement_unlocked';
      timestamp: string;
      playerId: string;
      achievement: Achievement;
    };

interface BuildFeedInput {
  matches: MatchLike[];
  matchSets: MatchSetLike[];
  ratingHistory: RatingHistoryLike[];
  players: PlayerLike[];
  rankEvents: RankChangeEvent[];
  achievements: { playerId: string; achievementId: string; earnedAt: string }[];
}

/** Hard-coded cutoff: only achievement events earned after this date appear in the feed.
 *  Block 3 deploy date — anything before this came from the historical backfill. */
const ACHIEVEMENT_FEED_CUTOFF = '2026-04-29T00:00:00Z';

const MAX_EVENTS = 10;

export function buildFeed(input: BuildFeedInput): FeedEvent[] {
  const events: FeedEvent[] = [];

  // Group sets and rating history by matchId
  const setsByMatch = new Map<string, MatchSetLike[]>();
  for (const s of input.matchSets) {
    const arr = setsByMatch.get(s.matchId) ?? [];
    arr.push(s);
    setsByMatch.set(s.matchId, arr);
  }
  for (const arr of setsByMatch.values()) arr.sort((a, b) => a.setNumber - b.setNumber);

  const closedAtByMatch = new Map<string, string>();
  for (const rh of input.ratingHistory) {
    const existing = closedAtByMatch.get(rh.matchId);
    if (!existing || rh.recordedAt > existing) {
      closedAtByMatch.set(rh.matchId, rh.recordedAt);
    }
  }

  for (const m of input.matches) {
    if (m.status === 'completed') {
      const closedAt = closedAtByMatch.get(m.id);
      if (!closedAt) continue;  // defensive: skip if no rating_history
      events.push({
        type: 'match_completed',
        matchId: m.id,
        timestamp: closedAt,
        match: m,
        sets: setsByMatch.get(m.id) ?? [],
      });
    } else if (m.status === 'scheduled') {
      events.push({
        type: 'match_scheduled',
        matchId: m.id,
        timestamp: m.createdAt,
        match: m,
      });
    } else if (m.status === 'injury_aborted') {
      events.push({
        type: 'match_injury_aborted',
        matchId: m.id,
        timestamp: m.createdAt,
        match: m,
      });
    } else if (m.status === 'draw') {
      // Un empate no escribe en rating_history, así que no hay instante de
      // cierre del que tirar: se ancla en createdAt, igual que la lesión.
      events.push({
        type: 'match_draw',
        matchId: m.id,
        timestamp: m.createdAt,
        match: m,
        sets: setsByMatch.get(m.id) ?? [],
      });
    }
  }

  for (const rc of input.rankEvents) {
    events.push({ type: 'rank_change', timestamp: rc.recordedAt, event: rc });
  }

  for (const p of input.players) {
    events.push({ type: 'new_player', timestamp: p.createdAt, player: p });
  }

  for (const a of input.achievements) {
    if (a.earnedAt < ACHIEVEMENT_FEED_CUTOFF) continue;
    const achievement = ACHIEVEMENT_BY_ID[a.achievementId];
    if (!achievement) continue;  // unknown id — defensive
    events.push({
      type: 'achievement_unlocked',
      timestamp: a.earnedAt,
      playerId: a.playerId,
      achievement,
    });
  }

  events.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  return events.slice(0, MAX_EVENTS);
}
