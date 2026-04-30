import { describe, it, expect } from 'vitest';
import { buildPodiumGroups, assignCompetitionRanks } from './podium-groups';

const p = (id: string, eloRating: number) => ({ id, eloRating });

describe('buildPodiumGroups', () => {
  it('returns three single-player groups when no ties', () => {
    const groups = buildPodiumGroups([p('a', 1700), p('b', 1600), p('c', 1500)]);
    expect(groups).toEqual([
      { rank: 1, players: [p('a', 1700)] },
      { rank: 2, players: [p('b', 1600)] },
      { rank: 3, players: [p('c', 1500)] },
    ]);
  });

  it('groups two players tied at #1 and skips rank 2', () => {
    const groups = buildPodiumGroups([p('a', 1700), p('b', 1700), p('c', 1600), p('d', 1500)]);
    expect(groups).toEqual([
      { rank: 1, players: [p('a', 1700), p('b', 1700)] },
      { rank: 3, players: [p('c', 1600)] },
      { rank: 4, players: [p('d', 1500)] },
    ]);
  });

  it('groups two tied at #2 (silver step holds both)', () => {
    const groups = buildPodiumGroups([p('a', 1700), p('b', 1600), p('c', 1600), p('d', 1500)]);
    expect(groups).toEqual([
      { rank: 1, players: [p('a', 1700)] },
      { rank: 2, players: [p('b', 1600), p('c', 1600)] },
      { rank: 4, players: [p('d', 1500)] },
    ]);
  });

  it('groups two tied at #3', () => {
    const groups = buildPodiumGroups([p('a', 1700), p('b', 1600), p('c', 1500), p('d', 1500)]);
    expect(groups).toEqual([
      { rank: 1, players: [p('a', 1700)] },
      { rank: 2, players: [p('b', 1600)] },
      { rank: 3, players: [p('c', 1500), p('d', 1500)] },
    ]);
  });

  it('handles three-way tie at the top (only 1 group fits if limit=3 and rest tied)', () => {
    const groups = buildPodiumGroups([p('a', 1700), p('b', 1700), p('c', 1700), p('d', 1500)]);
    expect(groups).toEqual([
      { rank: 1, players: [p('a', 1700), p('b', 1700), p('c', 1700)] },
      { rank: 4, players: [p('d', 1500)] },
    ]);
  });

  it('compares by rounded ELO, not exact', () => {
    // 1500.4 and 1499.7 both round to 1500 — treated as a tie.
    const groups = buildPodiumGroups([p('a', 1700), p('b', 1500.4), p('c', 1499.7)]);
    expect(groups).toEqual([
      { rank: 1, players: [p('a', 1700)] },
      { rank: 2, players: [p('b', 1500.4), p('c', 1499.7)] },
    ]);
  });

  it('returns empty when input is empty', () => {
    expect(buildPodiumGroups([])).toEqual([]);
  });
});

describe('assignCompetitionRanks', () => {
  it('numbers ranks 1..N when no ties', () => {
    const ranked = assignCompetitionRanks([p('a', 1700), p('b', 1600), p('c', 1500)]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it('produces 1, 1, 3 pattern for a tie at the top', () => {
    const ranked = assignCompetitionRanks([p('a', 1700), p('b', 1700), p('c', 1500)]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 1, 3]);
  });

  it('produces 1, 2, 2, 4 pattern for a tie at #2', () => {
    const ranked = assignCompetitionRanks([
      p('a', 1700),
      p('b', 1600),
      p('c', 1600),
      p('d', 1500),
    ]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 2, 4]);
  });
});
