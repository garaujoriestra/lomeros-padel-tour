import type { RankChangeEvent } from '@/lib/feed/rank-changes';

export interface MatchHistoryEntry {
  playerId: string;
  matchId: string;
  recordedAt: string;
  eloBefore: number;
  eloAfter: number;
  isWin: boolean;
  hasBagelSet: boolean;
  isDoubleBagel: boolean;
}

export interface PlayerAchievementGrant {
  playerId: string;
  achievementId: string;
  earnedAt: string;
  triggerMatchId: string | null;
}

interface DetectInput {
  history: MatchHistoryEntry[];
  rankEvents: RankChangeEvent[];
}

interface PlayerState {
  matchesPlayed: number;
  wins: number;
  currentStreak: number;
  hasFirstMatch: boolean;
  hasFirstWin: boolean;
  hasMatches10: boolean;
  hasMatches50: boolean;
  hasMatches100: boolean;
  hasWins25: boolean;
  hasStreak3: boolean;
  hasStreak5: boolean;
  hasStreak10: boolean;
  hasElo1600: boolean;
  hasElo1800: boolean;
  hasRank1: boolean;
  hasBagel: boolean;
  hasDoubleBagel: boolean;
}

function newState(): PlayerState {
  return {
    matchesPlayed: 0,
    wins: 0,
    currentStreak: 0,
    hasFirstMatch: false,
    hasFirstWin: false,
    hasMatches10: false,
    hasMatches50: false,
    hasMatches100: false,
    hasWins25: false,
    hasStreak3: false,
    hasStreak5: false,
    hasStreak10: false,
    hasElo1600: false,
    hasElo1800: false,
    hasRank1: false,
    hasBagel: false,
    hasDoubleBagel: false,
  };
}

export function detectAllAchievements(input: DetectInput): PlayerAchievementGrant[] {
  const grants: PlayerAchievementGrant[] = [];
  const states = new Map<string, PlayerState>();

  function getState(playerId: string): PlayerState {
    let s = states.get(playerId);
    if (!s) {
      s = newState();
      states.set(playerId, s);
    }
    return s;
  }

  function emit(playerId: string, achievementId: string, earnedAt: string, triggerMatchId: string | null) {
    grants.push({ playerId, achievementId, earnedAt, triggerMatchId });
  }

  // Process rating_history chronologically
  const sortedHistory = [...input.history].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));

  for (const e of sortedHistory) {
    const s = getState(e.playerId);

    // Counters
    s.matchesPlayed += 1;
    if (e.isWin) {
      s.wins += 1;
      s.currentStreak += 1;
    } else {
      s.currentStreak = 0;
    }

    // first_match
    if (!s.hasFirstMatch) {
      s.hasFirstMatch = true;
      emit(e.playerId, 'first_match', e.recordedAt, e.matchId);
    }

    // matches_10 / 50 / 100
    if (!s.hasMatches10 && s.matchesPlayed >= 10) {
      s.hasMatches10 = true;
      emit(e.playerId, 'matches_10', e.recordedAt, e.matchId);
    }
    if (!s.hasMatches50 && s.matchesPlayed >= 50) {
      s.hasMatches50 = true;
      emit(e.playerId, 'matches_50', e.recordedAt, e.matchId);
    }
    if (!s.hasMatches100 && s.matchesPlayed >= 100) {
      s.hasMatches100 = true;
      emit(e.playerId, 'matches_100', e.recordedAt, e.matchId);
    }

    // first_win
    if (e.isWin && !s.hasFirstWin) {
      s.hasFirstWin = true;
      emit(e.playerId, 'first_win', e.recordedAt, e.matchId);
    }

    // wins_25
    if (!s.hasWins25 && s.wins >= 25) {
      s.hasWins25 = true;
      emit(e.playerId, 'wins_25', e.recordedAt, e.matchId);
    }

    // Streaks
    if (!s.hasStreak3 && s.currentStreak >= 3) {
      s.hasStreak3 = true;
      emit(e.playerId, 'streak_3', e.recordedAt, e.matchId);
    }
    if (!s.hasStreak5 && s.currentStreak >= 5) {
      s.hasStreak5 = true;
      emit(e.playerId, 'streak_5', e.recordedAt, e.matchId);
    }
    if (!s.hasStreak10 && s.currentStreak >= 10) {
      s.hasStreak10 = true;
      emit(e.playerId, 'streak_10', e.recordedAt, e.matchId);
    }

    // ELO crossings
    if (!s.hasElo1600 && e.eloAfter >= 1600 && e.eloBefore < 1600) {
      s.hasElo1600 = true;
      emit(e.playerId, 'elo_1600', e.recordedAt, e.matchId);
    }
    if (!s.hasElo1800 && e.eloAfter >= 1800 && e.eloBefore < 1800) {
      s.hasElo1800 = true;
      emit(e.playerId, 'elo_1800', e.recordedAt, e.matchId);
    }

    // Bagel / double bagel
    if (e.hasBagelSet && !s.hasBagel) {
      s.hasBagel = true;
      emit(e.playerId, 'bagel', e.recordedAt, e.matchId);
    }
    if (e.isDoubleBagel && !s.hasDoubleBagel) {
      s.hasDoubleBagel = true;
      emit(e.playerId, 'double_bagel', e.recordedAt, e.matchId);
    }
  }

  // Process rank events: emit rank_1 the first time per player
  const sortedRankEvents = [...input.rankEvents].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  for (const re of sortedRankEvents) {
    if (re.type !== 'rank_into_top1') continue;
    const s = getState(re.playerId);
    if (!s.hasRank1) {
      s.hasRank1 = true;
      emit(re.playerId, 'rank_1', re.recordedAt, null);
    }
  }

  return grants;
}
