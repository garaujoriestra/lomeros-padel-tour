export interface PozoRound {
  // courts[i] = 4 participantIds en la pista de orden i+1 (i=0 es la pista top).
  courts: string[][];
  resting: string[]; // participantes que descansan esta ronda
}

export interface CourtResult {
  winners: [string, string];
  losers: [string, string];
}

// Las 3 combinaciones de pareja posibles sobre las posiciones [0,1,2,3] de la pista.
const PAIRING_PATTERNS: Array<[[number, number], [number, number]]> = [
  [[0, 1], [2, 3]],
  [[0, 2], [1, 3]],
  [[0, 3], [1, 2]],
];

// Emparejamiento 2v2 de una pista según el número de ronda (rota cada ronda).
export function courtPairing(
  courtPlayers: string[],
  roundNumber: number,
): { teamA: [string, string]; teamB: [string, string] } {
  const [a, b] = PAIRING_PATTERNS[roundNumber % PAIRING_PATTERNS.length];
  return {
    teamA: [courtPlayers[a[0]], courtPlayers[a[1]]],
    teamB: [courtPlayers[b[0]], courtPlayers[b[1]]],
  };
}

// Siembra inicial: llena pistas de 4 en orden; sobrantes a resting; no crea pistas vacías.
export function seedPozoCourts(participantIds: string[], numCourts: number): PozoRound {
  const fillable = Math.min(numCourts, Math.floor(participantIds.length / 4));
  const courts: string[][] = [];
  for (let i = 0; i < fillable; i++) {
    courts.push(participantIds.slice(i * 4, i * 4 + 4));
  }
  const resting = participantIds.slice(fillable * 4);
  return { courts, resting };
}
