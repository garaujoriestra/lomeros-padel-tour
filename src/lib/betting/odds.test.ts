import { describe, it, expect } from 'vitest';
import { teamRating, winnerOdds, matchOddsFromRatings } from './odds';

const even = { player1Elo: 1500, player2Elo: 1500 };

describe('teamRating', () => {
  it('es la media del Elo individual de los dos jugadores', () => {
    expect(teamRating({ player1Elo: 1400, player2Elo: 1600 })).toBe(1500);
    expect(teamRating({ player1Elo: 1479, player2Elo: 1478 })).toBe(1478.5);
  });
});

describe('winnerOdds', () => {
  it('partido igualado paga x2.0', () => {
    expect(winnerOdds(even, even)).toBe(2.0);
  });
  it('el favorito paga menos que el underdog', () => {
    const fav = { player1Elo: 1700, player2Elo: 1700 };
    expect(winnerOdds(fav, even)).toBeLessThan(2.0);
    expect(winnerOdds(even, fav)).toBeGreaterThan(2.0);
  });
  it('clampa a [1.2, 4.0] en desniveles extremos', () => {
    const crack = { player1Elo: 2400, player2Elo: 2400 };
    expect(winnerOdds(crack, even)).toBe(1.2);
    expect(winnerOdds(even, crack)).toBe(4.0);
  });
  it('redondea a 1 decimal', () => {
    const slight = { player1Elo: 1540, player2Elo: 1540 };
    const o = winnerOdds(slight, even);
    expect(o * 10).toBe(Math.round(o * 10));
  });
  it('amplifica diferencias pequeñas de Elo (sensibilidad)', () => {
    // ~40 pts de media de diferencia entre parejas (típico del grupo):
    // con sensibilidad debe notarse claramente, no quedarse pegado a x2.0.
    const fav = { player1Elo: 1500, player2Elo: 1500 };
    const dog = { player1Elo: 1460, player2Elo: 1460 };
    expect(winnerOdds(fav, dog)).toBeLessThanOrEqual(1.8);
    expect(winnerOdds(dog, fav)).toBeGreaterThanOrEqual(2.3);
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
