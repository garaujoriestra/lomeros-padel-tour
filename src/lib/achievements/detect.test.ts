import { describe, it, expect } from 'vitest';
import { detectAllAchievements, type MatchHistoryEntry } from './detect';

describe('detectAllAchievements', () => {
  function entry(
    playerId: string,
    matchId: string,
    recordedAt: string,
    eloBefore: number,
    eloAfter: number,
    isWin: boolean,
    opts: { hasBagelSet?: boolean; isDoubleBagel?: boolean } = {},
  ): MatchHistoryEntry {
    return {
      playerId,
      matchId,
      recordedAt,
      eloBefore,
      eloAfter,
      isWin,
      hasBagelSet: opts.hasBagelSet ?? false,
      isDoubleBagel: opts.isDoubleBagel ?? false,
    };
  }

  it('returns empty for empty input', () => {
    expect(detectAllAchievements({ history: [], rankEvents: [] })).toEqual([]);
  });

  it('emits first_match for the first entry of a player', () => {
    const grants = detectAllAchievements({
      history: [entry('p1', 'm1', '2026-01-01T10:00:00Z', 1500, 1520, true)],
      rankEvents: [],
    });
    expect(grants.find((g) => g.playerId === 'p1' && g.achievementId === 'first_match')).toBeDefined();
  });

  it('emits first_win for the first winning entry', () => {
    const grants = detectAllAchievements({
      history: [
        entry('p1', 'm1', '2026-01-01T10:00:00Z', 1500, 1480, false),  // first match — loss
        entry('p1', 'm2', '2026-01-02T10:00:00Z', 1480, 1500, true),   // first win
      ],
      rankEvents: [],
    });
    const winGrant = grants.find((g) => g.playerId === 'p1' && g.achievementId === 'first_win');
    expect(winGrant).toBeDefined();
    expect(winGrant?.triggerMatchId).toBe('m2');
  });

  it('emits matches_10 when matchesPlayed crosses 10', () => {
    const history: MatchHistoryEntry[] = [];
    for (let i = 1; i <= 10; i++) {
      history.push(entry('p1', `m${i}`, `2026-01-${String(i).padStart(2, '0')}T10:00:00Z`, 1500, 1500, false));
    }
    const grants = detectAllAchievements({ history, rankEvents: [] });
    const tenGrant = grants.find((g) => g.playerId === 'p1' && g.achievementId === 'matches_10');
    expect(tenGrant).toBeDefined();
    expect(tenGrant?.triggerMatchId).toBe('m10');
  });

  it('emits streak_3 after 3 consecutive wins, only once', () => {
    const history: MatchHistoryEntry[] = [
      entry('p1', 'm1', '2026-01-01T10:00:00Z', 1500, 1520, true),
      entry('p1', 'm2', '2026-01-02T10:00:00Z', 1520, 1540, true),
      entry('p1', 'm3', '2026-01-03T10:00:00Z', 1540, 1560, true),
      entry('p1', 'm4', '2026-01-04T10:00:00Z', 1560, 1540, false),  // loss resets
      entry('p1', 'm5', '2026-01-05T10:00:00Z', 1540, 1560, true),
      entry('p1', 'm6', '2026-01-06T10:00:00Z', 1560, 1580, true),
      entry('p1', 'm7', '2026-01-07T10:00:00Z', 1580, 1600, true),  // would be streak 3 again
    ];
    const grants = detectAllAchievements({ history, rankEvents: [] });
    const streakGrants = grants.filter((g) => g.achievementId === 'streak_3');
    expect(streakGrants).toHaveLength(1);
    expect(streakGrants[0].triggerMatchId).toBe('m3');
  });

  it('does not emit streak_3 for fewer than 3 consecutive wins', () => {
    const history: MatchHistoryEntry[] = [
      entry('p1', 'm1', '2026-01-01T10:00:00Z', 1500, 1520, true),
      entry('p1', 'm2', '2026-01-02T10:00:00Z', 1520, 1540, true),
      entry('p1', 'm3', '2026-01-03T10:00:00Z', 1540, 1520, false),
    ];
    const grants = detectAllAchievements({ history, rankEvents: [] });
    expect(grants.find((g) => g.achievementId === 'streak_3')).toBeUndefined();
  });

  it('emits elo_1600 the first time eloAfter crosses 1600', () => {
    const history: MatchHistoryEntry[] = [
      entry('p1', 'm1', '2026-01-01T10:00:00Z', 1500, 1580, true),
      entry('p1', 'm2', '2026-01-02T10:00:00Z', 1580, 1610, true),  // crosses 1600
      entry('p1', 'm3', '2026-01-03T10:00:00Z', 1610, 1590, false),
      entry('p1', 'm4', '2026-01-04T10:00:00Z', 1590, 1620, true),  // crosses again — should NOT emit
    ];
    const grants = detectAllAchievements({ history, rankEvents: [] });
    const eloGrants = grants.filter((g) => g.achievementId === 'elo_1600');
    expect(eloGrants).toHaveLength(1);
    expect(eloGrants[0].triggerMatchId).toBe('m2');
  });

  it('emits rank_1 from a rank_into_top1 event, only once', () => {
    const grants = detectAllAchievements({
      history: [],
      rankEvents: [
        { playerId: 'p1', type: 'rank_into_top1', recordedAt: '2026-01-01T10:00:00Z', newElo: 1700 },
        { playerId: 'p1', type: 'rank_into_top1', recordedAt: '2026-02-01T10:00:00Z', newElo: 1750 },  // second time
      ],
    });
    const rankGrants = grants.filter((g) => g.achievementId === 'rank_1');
    expect(rankGrants).toHaveLength(1);
    expect(rankGrants[0].earnedAt).toBe('2026-01-01T10:00:00Z');
  });

  it('emits bagel when hasBagelSet is true', () => {
    const grants = detectAllAchievements({
      history: [entry('p1', 'm1', '2026-01-01T10:00:00Z', 1500, 1520, true, { hasBagelSet: true })],
      rankEvents: [],
    });
    expect(grants.find((g) => g.achievementId === 'bagel')).toBeDefined();
  });

  it('emits double_bagel when isDoubleBagel is true', () => {
    const grants = detectAllAchievements({
      history: [entry('p1', 'm1', '2026-01-01T10:00:00Z', 1500, 1520, true, { hasBagelSet: true, isDoubleBagel: true })],
      rankEvents: [],
    });
    expect(grants.find((g) => g.achievementId === 'double_bagel')).toBeDefined();
    expect(grants.find((g) => g.achievementId === 'bagel')).toBeDefined();
  });

  it('does not duplicate bagel across multiple matches', () => {
    const grants = detectAllAchievements({
      history: [
        entry('p1', 'm1', '2026-01-01T10:00:00Z', 1500, 1520, true, { hasBagelSet: true }),
        entry('p1', 'm2', '2026-01-02T10:00:00Z', 1520, 1540, true, { hasBagelSet: true }),
      ],
      rankEvents: [],
    });
    const bagels = grants.filter((g) => g.achievementId === 'bagel');
    expect(bagels).toHaveLength(1);
  });
});
