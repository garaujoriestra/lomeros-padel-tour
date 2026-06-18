// Motor de Elo adaptado a pádel dobles
// - Rating de equipo = media de los 2 jugadores
// - K-factor variable según experiencia
// - Update individual para los 4 jugadores
// - Update Elo de pareja
// - Cálculo de sinergia por pareja

export function kFactor(matchesPlayed: number): number {
  if (matchesPlayed < 10) return 40;
  if (matchesPlayed < 30) return 32;
  return 24;
}

export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

export interface PlayerForElo {
  id: string;
  eloRating: number;
  matchesPlayed: number;
}

export interface EloResult {
  playerId: string;
  eloBefore: number;
  eloAfter: number;
  eloChange: number;
}

/**
 * Calcula el nuevo Elo de los 4 jugadores tras un partido de dobles.
 * @param team1 - [player1, player2] del equipo 1
 * @param team2 - [player1, player2] del equipo 2
 * @param winnerTeam - 1 o 2
 */
export function calculateDoublesElo(
  team1: [PlayerForElo, PlayerForElo],
  team2: [PlayerForElo, PlayerForElo],
  winnerTeam: 1 | 2
): EloResult[] {
  const ratingTeam1 = (team1[0].eloRating + team1[1].eloRating) / 2;
  const ratingTeam2 = (team2[0].eloRating + team2[1].eloRating) / 2;

  const expectedTeam1 = expectedScore(ratingTeam1, ratingTeam2);
  const expectedTeam2 = 1 - expectedTeam1;

  const score1 = winnerTeam === 1 ? 1 : 0;
  const score2 = winnerTeam === 2 ? 1 : 0;

  const results: EloResult[] = [];

  for (const player of team1) {
    const k = kFactor(player.matchesPlayed);
    const change = Math.round(k * (score1 - expectedTeam1));
    results.push({
      playerId: player.id,
      eloBefore: player.eloRating,
      eloAfter: player.eloRating + change,
      eloChange: change,
    });
  }

  for (const player of team2) {
    const k = kFactor(player.matchesPlayed);
    const change = Math.round(k * (score2 - expectedTeam2));
    results.push({
      playerId: player.id,
      eloBefore: player.eloRating,
      eloAfter: player.eloRating + change,
      eloChange: change,
    });
  }

  return results;
}

export interface EloProjection {
  /** Cambio de Elo si el equipo del jugador gana (≥ 0). */
  ifWin: number;
  /** Cambio de Elo si el equipo del jugador pierde (≤ 0). */
  ifLose: number;
}

/**
 * Proyecta, para un partido aún no jugado, cuánto Elo ganaría/perdería cada jugador
 * según el resultado. Calcula ambos escenarios con `calculateDoublesElo` y, para cada
 * jugador, toma como `ifWin` el delta de "su equipo gana" y como `ifLose` el de "su
 * equipo pierde". No persiste nada.
 * @returns mapa playerId → { ifWin, ifLose }
 */
export function projectDoublesElo(
  team1: [PlayerForElo, PlayerForElo],
  team2: [PlayerForElo, PlayerForElo],
): Record<string, EloProjection> {
  const ifTeam1Wins = new Map(calculateDoublesElo(team1, team2, 1).map((r) => [r.playerId, r.eloChange]));
  const ifTeam2Wins = new Map(calculateDoublesElo(team1, team2, 2).map((r) => [r.playerId, r.eloChange]));
  const team1Ids = new Set([team1[0].id, team1[1].id]);

  const projection: Record<string, EloProjection> = {};
  for (const player of [...team1, ...team2]) {
    const onTeam1 = team1Ids.has(player.id);
    // Para el equipo 1: gana en el escenario "gana equipo 1"; para el equipo 2, al revés.
    projection[player.id] = onTeam1
      ? { ifWin: ifTeam1Wins.get(player.id)!, ifLose: ifTeam2Wins.get(player.id)! }
      : { ifWin: ifTeam2Wins.get(player.id)!, ifLose: ifTeam1Wins.get(player.id)! };
  }
  return projection;
}

/**
 * Calcula el Elo de una pareja en base a sus propias estadísticas de pareja.
 */
export function calculatePairElo(
  pairElo: number,
  opponentPairElo: number,
  matchesAsTeam: number,
  won: boolean
): number {
  const k = kFactor(matchesAsTeam);
  const expected = expectedScore(pairElo, opponentPairElo);
  const score = won ? 1 : 0;
  return Math.round(pairElo + k * (score - expected));
}

/**
 * Calcula el score de sinergia de una pareja.
 * Positivo = rinden mejor juntos de lo esperado individualmente.
 */
export function calculateSynergy(
  pairWins: number,
  pairMatches: number,
  player1WinRate: number,
  player2WinRate: number
): number {
  if (pairMatches === 0) return 0;
  const pairWinRate = pairWins / pairMatches;
  const expectedWinRate = (player1WinRate + player2WinRate) / 2;
  return parseFloat((pairWinRate - expectedWinRate).toFixed(4));
}

/**
 * Calcula la adaptabilidad de un jugador (0-1).
 * Alta adaptabilidad = rinde bien con cualquier compañero.
 * @param winRatesByPartner - win rate del jugador con cada compañero distinto
 */
export function calculateAdaptability(winRatesByPartner: number[]): number {
  if (winRatesByPartner.length < 2) return 1;
  const mean = winRatesByPartner.reduce((a, b) => a + b, 0) / winRatesByPartner.length;
  const variance =
    winRatesByPartner.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) /
    winRatesByPartner.length;
  const stdDev = Math.sqrt(variance);
  // Max posible stdDev con win rates entre 0 y 1 es 0.5
  return parseFloat((1 - stdDev / 0.5).toFixed(4));
}
