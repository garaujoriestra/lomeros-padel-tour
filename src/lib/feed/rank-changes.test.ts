import { describe, it, expect } from 'vitest';
import { detectRankChanges } from './rank-changes';

describe('detectRankChanges', () => {
  // Helper to build a rating_history entry
  function entry(playerId: string, eloAfter: number, eloBefore: number, recordedAt: string) {
    return { playerId, eloBefore, eloAfter, recordedAt };
  }

  it('returns empty array for empty history', () => {
    expect(detectRankChanges([], [])).toEqual([]);
  });

  it('detects entering the top 3', () => {
    // 4 players starting at 1500. Player D plays a match and surges past A.
    const allPlayers = [
      { id: 'A', eloRating: 1600 },
      { id: 'B', eloRating: 1550 },
      { id: 'C', eloRating: 1520 },
      { id: 'D', eloRating: 1500 },
    ];
    // Replay history that took them to current state.
    // Initial state: everyone at 1500. Each entry walks them forward.
    const history = [
      entry('A', 1600, 1500, '2026-01-01T10:00:00Z'),
      entry('B', 1550, 1500, '2026-01-02T10:00:00Z'),
      entry('C', 1520, 1500, '2026-01-03T10:00:00Z'),
      // Now ranks are A=1600, B=1550, C=1520, D=1500. D is #4.
      entry('D', 1530, 1500, '2026-01-04T10:00:00Z'),
      // After D's entry: A=1600, B=1550, D=1530, C=1520. D is #3 (entered top 3).
    ];
    const events = detectRankChanges(history, allPlayers);
    const enterTop3 = events.find((e) => e.playerId === 'D' && e.type === 'rank_into_top3');
    expect(enterTop3).toBeDefined();
    expect(enterTop3?.recordedAt).toBe('2026-01-04T10:00:00Z');
  });

  it('detects leaving the top 3', () => {
    const allPlayers = [
      { id: 'A', eloRating: 1600 },
      { id: 'B', eloRating: 1550 },
      { id: 'C', eloRating: 1450 },  // dropped
      { id: 'D', eloRating: 1530 },
    ];
    const history = [
      entry('A', 1600, 1500, '2026-01-01T10:00:00Z'),
      entry('B', 1550, 1500, '2026-01-02T10:00:00Z'),
      entry('C', 1520, 1500, '2026-01-03T10:00:00Z'),
      // C in top 3 with 1520
      entry('D', 1530, 1500, '2026-01-04T10:00:00Z'),
      // C now #4
      entry('C', 1450, 1520, '2026-01-05T10:00:00Z'),
    ];
    const events = detectRankChanges(history, allPlayers);
    // C leaves top 3 on 2026-01-04 (when D overtook them), not on 2026-01-05.
    const leftTop3 = events.find((e) => e.playerId === 'C' && e.type === 'rank_loses_top3');
    expect(leftTop3).toBeDefined();
    expect(leftTop3?.recordedAt).toBe('2026-01-04T10:00:00Z');
  });

  it('detects becoming #1', () => {
    const allPlayers = [
      { id: 'A', eloRating: 1600 },
      { id: 'B', eloRating: 1700 },  // overtook
    ];
    const history = [
      entry('A', 1600, 1500, '2026-01-01T10:00:00Z'),
      entry('B', 1700, 1500, '2026-01-02T10:00:00Z'),
    ];
    const events = detectRankChanges(history, allPlayers);
    const becameOne = events.find((e) => e.playerId === 'B' && e.type === 'rank_into_top1');
    expect(becameOne).toBeDefined();
  });

  it('detects losing #1', () => {
    const allPlayers = [
      { id: 'A', eloRating: 1600 },
      { id: 'B', eloRating: 1700 },
    ];
    const history = [
      entry('A', 1700, 1500, '2026-01-01T10:00:00Z'),  // A becomes #1
      entry('B', 1700, 1500, '2026-01-02T10:00:00Z'),  // tie, but A keeps #1 (later)
      entry('A', 1600, 1700, '2026-01-03T10:00:00Z'),  // A drops, B becomes #1
    ];
    const events = detectRankChanges(history, allPlayers);
    const lostOne = events.find((e) => e.playerId === 'A' && e.type === 'rank_loses_top1');
    expect(lostOne).toBeDefined();
    expect(lostOne?.recordedAt).toBe('2026-01-03T10:00:00Z');
  });

  it('does not emit events for non-threshold changes', () => {
    // Player ranked #5 → #4: not a top-3 crossing.
    const allPlayers = [
      { id: 'A', eloRating: 1700 },
      { id: 'B', eloRating: 1650 },
      { id: 'C', eloRating: 1600 },
      { id: 'D', eloRating: 1550 },
      { id: 'E', eloRating: 1540 },
    ];
    const history = [
      entry('A', 1700, 1500, '2026-01-01T10:00:00Z'),
      entry('B', 1650, 1500, '2026-01-02T10:00:00Z'),
      entry('C', 1600, 1500, '2026-01-03T10:00:00Z'),
      entry('D', 1550, 1500, '2026-01-04T10:00:00Z'),
      entry('E', 1540, 1500, '2026-01-05T10:00:00Z'),  // E is #5, no event
    ];
    const events = detectRankChanges(history, allPlayers);
    expect(events).toHaveLength(0);
  });

  it('processes history in chronological order regardless of input order', () => {
    const allPlayers = [
      { id: 'A', eloRating: 1700 },
      { id: 'B', eloRating: 1500 },
    ];
    // Provide history out of order
    const history = [
      entry('A', 1700, 1500, '2026-01-02T10:00:00Z'),  // A becomes #1 (was tied at 1500 before)
      entry('B', 1500, 1500, '2026-01-01T10:00:00Z'),  // earlier, no-op
    ];
    const events = detectRankChanges(history, allPlayers);
    expect(events.find((e) => e.type === 'rank_into_top1' && e.playerId === 'A')).toBeDefined();
  });
});
