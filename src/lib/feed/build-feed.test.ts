import { describe, it, expect } from 'vitest';
import { buildFeed } from './build-feed';

describe('buildFeed', () => {
  function match(id: string, status: 'scheduled' | 'completed', date: string, t1p1 = 'a', t1p2 = 'b', t2p1 = 'c', t2p2 = 'd') {
    return {
      id, status, date,
      team1Player1Id: t1p1, team1Player2Id: t1p2,
      team2Player1Id: t2p1, team2Player2Id: t2p2,
      winnerTeam: status === 'completed' ? 1 : null,
      location: null,
      createdAt: date,
    };
  }
  function player(id: string, createdAt: string) {
    return { id, name: id.toUpperCase(), createdAt };
  }
  function set(matchId: string, setNumber: number, t1: number, t2: number) {
    return { matchId, setNumber, team1Games: t1, team2Games: t2 };
  }
  function rh(playerId: string, recordedAt: string, matchId: string) {
    return { playerId, matchId, recordedAt, eloBefore: 1500, eloAfter: 1520 };
  }

  it('returns empty array for empty inputs', () => {
    expect(buildFeed({ matches: [], matchSets: [], ratingHistory: [], players: [], rankEvents: [], achievements: [] })).toEqual([]);
  });

  it('emits a match_completed event per completed match', () => {
    const events = buildFeed({
      matches: [match('m1', 'completed', '2026-04-01T10:00:00Z')],
      matchSets: [set('m1', 1, 6, 3), set('m1', 2, 7, 5)],
      ratingHistory: [rh('a', '2026-04-01T11:00:00Z', 'm1')],
      players: [],
      rankEvents: [],
      achievements: [],
    });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('match_completed');
    if (events[0].type === 'match_completed') {
      expect(events[0].matchId).toBe('m1');
      expect(events[0].timestamp).toBe('2026-04-01T11:00:00Z');
    }
  });

  it('emits a match_scheduled event per scheduled match', () => {
    const events = buildFeed({
      matches: [match('m2', 'scheduled', '2026-04-02T00:00:00Z')],
      matchSets: [],
      ratingHistory: [],
      players: [],
      rankEvents: [],
      achievements: [],
    });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('match_scheduled');
  });

  it('emits a rank_change event per rank event', () => {
    const events = buildFeed({
      matches: [],
      matchSets: [],
      ratingHistory: [],
      players: [],
      rankEvents: [
        { playerId: 'a', type: 'rank_into_top3', recordedAt: '2026-04-03T10:00:00Z', newElo: 1600 },
      ],
      achievements: [],
    });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('rank_change');
  });

  it('emits a new_player event per recent player', () => {
    const events = buildFeed({
      matches: [],
      matchSets: [],
      ratingHistory: [],
      players: [player('alice', '2026-04-04T10:00:00Z')],
      rankEvents: [],
      achievements: [],
    });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('new_player');
  });

  it('orders events newest first', () => {
    const events = buildFeed({
      matches: [
        match('m1', 'completed', '2026-04-01T00:00:00Z'),
        match('m2', 'completed', '2026-04-03T00:00:00Z'),
      ],
      matchSets: [],
      ratingHistory: [
        rh('a', '2026-04-01T10:00:00Z', 'm1'),
        rh('a', '2026-04-03T10:00:00Z', 'm2'),
      ],
      players: [],
      rankEvents: [],
      achievements: [],
    });
    expect(events.map((e) => e.timestamp)).toEqual([
      '2026-04-03T10:00:00Z',
      '2026-04-01T10:00:00Z',
    ]);
  });

  it('truncates to top 10 events', () => {
    const matches = Array.from({ length: 15 }, (_, i) =>
      match(`m${i}`, 'completed', `2026-04-${String(i + 1).padStart(2, '0')}T00:00:00Z`),
    );
    const ratingHistory = matches.map((m, i) =>
      rh('a', `2026-04-${String(i + 1).padStart(2, '0')}T10:00:00Z`, m.id),
    );
    const events = buildFeed({ matches, matchSets: [], ratingHistory, players: [], rankEvents: [], achievements: [] });
    expect(events).toHaveLength(10);
  });

  it('does not emit a match_completed event without rating_history', () => {
    // Defensive: a completed match with no rating_history (shouldn't happen but…)
    const events = buildFeed({
      matches: [match('m1', 'completed', '2026-04-01T00:00:00Z')],
      matchSets: [],
      ratingHistory: [],
      players: [],
      rankEvents: [],
      achievements: [],
    });
    expect(events).toHaveLength(0);
  });

  it('mixes all event types in chronological order', () => {
    const events = buildFeed({
      matches: [
        match('m1', 'completed', '2026-04-01T00:00:00Z'),
        match('m2', 'scheduled', '2026-04-04T00:00:00Z'),
      ],
      matchSets: [],
      ratingHistory: [rh('a', '2026-04-01T11:00:00Z', 'm1')],
      players: [player('alice', '2026-04-02T00:00:00Z')],
      rankEvents: [
        { playerId: 'a', type: 'rank_into_top3', recordedAt: '2026-04-03T00:00:00Z', newElo: 1600 },
      ],
      achievements: [],
    });
    const types = events.map((e) => e.type);
    expect(types).toEqual(['match_scheduled', 'rank_change', 'new_player', 'match_completed']);
  });

  it('emits an achievement_unlocked event for grants after the cutoff', () => {
    const events = buildFeed({
      matches: [],
      matchSets: [],
      ratingHistory: [],
      players: [],
      rankEvents: [],
      achievements: [
        { playerId: 'p1', achievementId: 'streak_3', earnedAt: '2026-04-29T10:00:00Z' },
      ],
    });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('achievement_unlocked');
  });

  it('drops achievement events earned before the cutoff', () => {
    const events = buildFeed({
      matches: [],
      matchSets: [],
      ratingHistory: [],
      players: [],
      rankEvents: [],
      achievements: [
        { playerId: 'p1', achievementId: 'first_match', earnedAt: '2026-01-01T00:00:00Z' },
      ],
    });
    expect(events).toHaveLength(0);
  });

  it('attaches the resolved Achievement object to the event', () => {
    const events = buildFeed({
      matches: [],
      matchSets: [],
      ratingHistory: [],
      players: [],
      rankEvents: [],
      achievements: [
        { playerId: 'p1', achievementId: 'streak_3', earnedAt: '2026-04-29T10:00:00Z' },
      ],
    });
    expect(events[0].type).toBe('achievement_unlocked');
    if (events[0].type === 'achievement_unlocked') {
      expect(events[0].playerId).toBe('p1');
      expect(events[0].achievement.id).toBe('streak_3');
      expect(events[0].achievement.name).toBe('Racha de 3');
    }
  });

  it('drops unknown achievementIds defensively', () => {
    const events = buildFeed({
      matches: [],
      matchSets: [],
      ratingHistory: [],
      players: [],
      rankEvents: [],
      achievements: [
        { playerId: 'p1', achievementId: 'nonexistent_id', earnedAt: '2026-04-29T10:00:00Z' },
      ],
    });
    expect(events).toHaveLength(0);
  });
});
