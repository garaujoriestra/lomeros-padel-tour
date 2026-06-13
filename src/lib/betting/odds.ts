// Cuotas según Elo (lógica pura, sin DB).
import { expectedScore } from '@/lib/rating/elo';
import { BETTING } from './config';

export interface TeamRatingInput {
  player1Elo: number;
  player2Elo: number;
}

export interface MatchOdds {
  team1: { winner: number; exactScore: number };
  team2: { winner: number; exactScore: number };
}

// Rating de la pareja = media del Elo individual de sus dos jugadores.
// NOTA: deliberadamente NO usamos el Elo de pareja (pairElo). En este grupo las
// parejas apenas repiten, así que sus pairElo se quedan pegados a ~1500 y las
// cuotas salían planas (x2 para ambos). El Elo individual es la señal densa que
// de verdad distingue a la pareja mejor de la peor.
export function teamRating(t: TeamRatingInput): number {
  return (t.player1Elo + t.player2Elo) / 2;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function winnerOdds(team: TeamRatingInput, rival: TeamRatingInput): number {
  // Amplificamos la diferencia de Elo por oddsSensitivity para que, en grupos
  // con Elos parecidos, apostar por la pareja peor pague de forma perceptible.
  // expectedScore(diff, 0) = 1 / (1 + 10^(-diff/400)).
  const diff = (teamRating(team) - teamRating(rival)) * BETTING.oddsSensitivity;
  const p = expectedScore(diff, 0);
  const clamped = Math.min(BETTING.oddsMax, Math.max(BETTING.oddsMin, 1 / p));
  return round1(clamped);
}

export function exactScoreOdds(team: TeamRatingInput, rival: TeamRatingInput): number {
  return round1(winnerOdds(team, rival) * BETTING.exactScoreMultiplier);
}

export function matchOddsFromRatings(team1: TeamRatingInput, team2: TeamRatingInput): MatchOdds {
  return {
    team1: { winner: winnerOdds(team1, team2), exactScore: exactScoreOdds(team1, team2) },
    team2: { winner: winnerOdds(team2, team1), exactScore: exactScoreOdds(team2, team1) },
  };
}
