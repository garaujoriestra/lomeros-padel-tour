import { describe, it, expect } from 'vitest';
import { teamRating, winnerOdds, matchOddsFromRatings } from './odds';

const even = { player1Elo: 1500, player2Elo: 1500, pairElo: null };

describe('teamRating', () => {
  it('usa pairElo cuando existe', () => {
    expect(teamRating({ player1Elo: 1400, player2Elo: 1600, pairElo: 1550 })).toBe(1550);
  });
  it('cae a la media individual sin pairElo', () => {
    expect(teamRating({ player1Elo: 1400, player2Elo: 1600, pairElo: null })).toBe(1500);
  });
});

describe('winnerOdds', () => {
  it('partido igualado paga x2.0', () => {
    expect(winnerOdds(even, even)).toBe(2.0);
  });
  it('el favorito paga menos que el underdog', () => {
    const fav = { player1Elo: 1700, player2Elo: 1700, pairElo: null };
    expect(winnerOdds(fav, even)).toBeLessThan(2.0);
    expect(winnerOdds(even, fav)).toBeGreaterThan(2.0);
  });
  it('clampa a [1.2, 4.0] en desniveles extremos', () => {
    const crack = { player1Elo: 2400, player2Elo: 2400, pairElo: null };
    expect(winnerOdds(crack, even)).toBe(1.2);
    expect(winnerOdds(even, crack)).toBe(4.0);
  });
  it('redondea a 1 decimal', () => {
    const slight = { player1Elo: 1540, player2Elo: 1540, pairElo: null };
    const o = winnerOdds(slight, even);
    expect(o * 10).toBe(Math.round(o * 10));
  });
});

describe('matchOddsFromRatings', () => {
  it('marcador exacto duplica la cuota del ganador', () => {
    const odds = matchOddsFromRatings(even, even);
    expect(odds.team1.winner).toBe(2.0);
    expect(odds.team1.exactScore).toBe(4.0);
    expect(odds.team2.exactScore).toBe(4.0);
  });
});
