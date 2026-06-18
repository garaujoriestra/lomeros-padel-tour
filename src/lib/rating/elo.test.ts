import { describe, it, expect } from 'vitest';
import {
  kFactor,
  expectedScore,
  calculateDoublesElo,
  projectDoublesElo,
  calculatePairElo,
  calculateSynergy,
  calculateAdaptability,
  type PlayerForElo,
} from './elo';

// ---------------------------------------------------------------------------
// kFactor
// ---------------------------------------------------------------------------
describe('kFactor', () => {
  it('returns 40 for 0 matches', () => {
    expect(kFactor(0)).toBe(40);
  });

  it('returns 40 for 9 matches', () => {
    expect(kFactor(9)).toBe(40);
  });

  it('returns 32 for 10 matches', () => {
    expect(kFactor(10)).toBe(32);
  });

  it('returns 32 for 29 matches', () => {
    expect(kFactor(29)).toBe(32);
  });

  it('returns 24 for 30 matches', () => {
    expect(kFactor(30)).toBe(24);
  });
});

// ---------------------------------------------------------------------------
// expectedScore
// ---------------------------------------------------------------------------
describe('expectedScore', () => {
  it('returns 0.5 for equal ratings', () => {
    expect(expectedScore(1500, 1500)).toBe(0.5);
  });

  it('returns ~0.909 when A is 400 points higher than B', () => {
    expect(expectedScore(1900, 1500)).toBeCloseTo(0.9091, 3);
  });

  it('returns ~0.091 when A is 400 points lower than B', () => {
    expect(expectedScore(1500, 1900)).toBeCloseTo(0.0909, 3);
  });

  it('is symmetric: expectedScore(a,b) + expectedScore(b,a) ≈ 1', () => {
    expect(expectedScore(1600, 1400) + expectedScore(1400, 1600)).toBeCloseTo(1, 10);
  });
});

// ---------------------------------------------------------------------------
// calculateDoublesElo
// ---------------------------------------------------------------------------
describe('calculateDoublesElo', () => {
  function player(id: string, eloRating: number, matchesPlayed = 0): PlayerForElo {
    return { id, eloRating, matchesPlayed };
  }

  it('equal teams (1500 each), team1 wins — team1 gains 20, team2 loses 20', () => {
    const results = calculateDoublesElo(
      [player('a', 1500), player('b', 1500)],
      [player('c', 1500), player('d', 1500)],
      1,
    );
    const [a, b, c, d] = results;
    expect(a.eloChange).toBe(20);
    expect(b.eloChange).toBe(20);
    expect(c.eloChange).toBe(-20);
    expect(d.eloChange).toBe(-20);
    // gain equals absolute loss
    expect(a.eloChange).toBe(-c.eloChange);
  });

  it('underdog wins (team1 avg 1400 vs team2 avg 1600) — big positive change for team1 (>15)', () => {
    const results = calculateDoublesElo(
      [player('a', 1400), player('b', 1400)],
      [player('c', 1600), player('d', 1600)],
      1,
    );
    expect(results[0].eloChange).toBeGreaterThan(15);
    expect(results[1].eloChange).toBeGreaterThan(15);
  });

  it('favorite wins (team1 avg 1600 vs team2 avg 1400) — small positive change for team1 (<=10)', () => {
    const results = calculateDoublesElo(
      [player('a', 1600), player('b', 1600)],
      [player('c', 1400), player('d', 1400)],
      1,
    );
    expect(results[0].eloChange).toBeGreaterThan(0);
    expect(results[0].eloChange).toBeLessThanOrEqual(10);
  });

  it('returns exactly 4 results in order team1[0], team1[1], team2[0], team2[1]', () => {
    const results = calculateDoublesElo(
      [player('p1', 1500), player('p2', 1500)],
      [player('p3', 1500), player('p4', 1500)],
      1,
    );
    expect(results).toHaveLength(4);
    expect(results[0].playerId).toBe('p1');
    expect(results[1].playerId).toBe('p2');
    expect(results[2].playerId).toBe('p3');
    expect(results[3].playerId).toBe('p4');
  });
});

// ---------------------------------------------------------------------------
// projectDoublesElo
// ---------------------------------------------------------------------------
describe('projectDoublesElo', () => {
  function player(id: string, eloRating: number, matchesPlayed = 0): PlayerForElo {
    return { id, eloRating, matchesPlayed };
  }

  it('devuelve una entrada por cada uno de los 4 jugadores', () => {
    const proj = projectDoublesElo(
      [player('a', 1500), player('b', 1500)],
      [player('c', 1500), player('d', 1500)],
    );
    expect(Object.keys(proj).sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('equipos iguales (1500, 0 partidos): cada jugador +20 si gana / −20 si pierde', () => {
    const proj = projectDoublesElo(
      [player('a', 1500), player('b', 1500)],
      [player('c', 1500), player('d', 1500)],
    );
    for (const id of ['a', 'b', 'c', 'd']) {
      expect(proj[id].ifWin).toBe(20);
      expect(proj[id].ifLose).toBe(-20);
    }
  });

  it('ifWin es ≥ 0 y ifLose es ≤ 0 para todos los jugadores', () => {
    const proj = projectDoublesElo(
      [player('a', 1700), player('b', 1680)],
      [player('c', 1400), player('d', 1420)],
    );
    for (const id of ['a', 'b', 'c', 'd']) {
      expect(proj[id].ifWin).toBeGreaterThanOrEqual(0);
      expect(proj[id].ifLose).toBeLessThanOrEqual(0);
    }
  });

  it('coincide con calculateDoublesElo: ifWin = delta cuando su equipo gana, ifLose = delta cuando pierde', () => {
    const team1: [PlayerForElo, PlayerForElo] = [player('a', 1600), player('b', 1550)];
    const team2: [PlayerForElo, PlayerForElo] = [player('c', 1450), player('d', 1500)];
    const proj = projectDoublesElo(team1, team2);

    const t1Wins = calculateDoublesElo(team1, team2, 1);
    const t2Wins = calculateDoublesElo(team1, team2, 2);
    // Jugador del equipo 1: gana en el escenario "gana equipo 1".
    expect(proj['a'].ifWin).toBe(t1Wins.find((r) => r.playerId === 'a')!.eloChange);
    expect(proj['a'].ifLose).toBe(t2Wins.find((r) => r.playerId === 'a')!.eloChange);
    // Jugador del equipo 2: gana en el escenario "gana equipo 2".
    expect(proj['c'].ifWin).toBe(t2Wins.find((r) => r.playerId === 'c')!.eloChange);
    expect(proj['c'].ifLose).toBe(t1Wins.find((r) => r.playerId === 'c')!.eloChange);
  });

  it('el favorito gana menos al vencer y pierde más al caer que el underdog', () => {
    // team1 favorito (1700) vs team2 underdog (1400), mismo nº de partidos → mismo K.
    const proj = projectDoublesElo(
      [player('fav1', 1700), player('fav2', 1700)],
      [player('und1', 1400), player('und2', 1400)],
    );
    // Favorito gana poco al vencer; underdog gana mucho al vencer.
    expect(proj['fav1'].ifWin).toBeLessThan(proj['und1'].ifWin);
    // Favorito pierde mucho al caer (más negativo); underdog pierde poco.
    expect(proj['fav1'].ifLose).toBeLessThan(proj['und1'].ifLose);
  });
});

// ---------------------------------------------------------------------------
// calculatePairElo
// ---------------------------------------------------------------------------
describe('calculatePairElo', () => {
  it('equal-rated pair, won, 0 matches together → pairElo + 20', () => {
    // k=40, expected=0.5, change = round(40*(1-0.5)) = 20
    expect(calculatePairElo(1500, 1500, 0, true)).toBe(1520);
  });

  it('equal-rated pair, lost, 0 matches together → pairElo - 20', () => {
    // k=40, expected=0.5, change = round(40*(0-0.5)) = -20
    expect(calculatePairElo(1500, 1500, 0, false)).toBe(1480);
  });

  it('result is always rounded to an integer', () => {
    // Unequal ratings produce a non-integer before rounding
    const result = calculatePairElo(1500, 1600, 0, true);
    expect(Number.isInteger(result)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// calculateSynergy
// ---------------------------------------------------------------------------
describe('calculateSynergy', () => {
  it('returns 0 when pair has 0 matches', () => {
    expect(calculateSynergy(0, 0, 0.6, 0.7)).toBe(0);
  });

  it('returns 0 when pair win rate equals average individual win rates', () => {
    // pairWinRate = 5/10 = 0.5, expectedWinRate = (0.5+0.5)/2 = 0.5 → diff = 0
    expect(calculateSynergy(5, 10, 0.5, 0.5)).toBe(0);
  });

  it('returns positive when pair win rate is above expected', () => {
    // pairWinRate = 8/10 = 0.8, expectedWinRate = (0.5+0.5)/2 = 0.5 → diff = +0.3
    const result = calculateSynergy(8, 10, 0.5, 0.5);
    expect(result).toBeGreaterThan(0);
  });

  it('returns negative when pair win rate is below expected', () => {
    // pairWinRate = 2/10 = 0.2, expectedWinRate = (0.6+0.7)/2 = 0.65 → diff = -0.45
    const result = calculateSynergy(2, 10, 0.6, 0.7);
    expect(result).toBeLessThan(0);
  });
});

// ---------------------------------------------------------------------------
// calculateAdaptability
// ---------------------------------------------------------------------------
describe('calculateAdaptability', () => {
  it('returns 1 for a single partner (length 1)', () => {
    expect(calculateAdaptability([0.7])).toBe(1);
  });

  it('returns 1 when all partners have identical win rates (no variance)', () => {
    expect(calculateAdaptability([0.6, 0.6])).toBe(1);
  });

  it('returns much lower than 1 for extreme spread [0, 1] — result is 0', () => {
    // mean=0.5, variance=0.25, stdDev=0.5, result = 1 - 0.5/0.5 = 0
    const result = calculateAdaptability([0, 1]);
    expect(result).toBeLessThan(0.5);
  });
});
