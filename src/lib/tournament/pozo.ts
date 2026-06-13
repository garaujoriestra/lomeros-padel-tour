export interface PozoRound {
  // courts[i] = 4 participantIds en la pista de orden i+1 (i=0 es la pista top).
  courts: string[][];
  resting: string[]; // participantes que descansan esta ronda
}

export interface CourtResult {
  winners: [string, string];
  losers: [string, string];
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
