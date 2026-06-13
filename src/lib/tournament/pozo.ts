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

// Aplica el movimiento clásico del pozo. results[i] corresponde a current.courts[i].
// No modifica resting (la rotación de descansos se aplica aparte).
export function nextPozoRound(current: PozoRound, results: CourtResult[]): PozoRound {
  const n = current.courts.length;
  // fromAbove[k] = perdedores que bajan desde la pista k-1.
  // fromBelow[k] = ganadores que suben desde la pista k+1.
  const fromAbove: string[][] = Array.from({ length: n }, () => []);
  const fromBelow: string[][] = Array.from({ length: n }, () => []);
  const stayers: string[][] = Array.from({ length: n }, () => []);

  results.forEach((res, k) => {
    const isTop = k === 0;
    const isBottom = k === n - 1;
    // Ganadores: suben (k-1) salvo en el top, donde se quedan.
    if (isTop) stayers[k].push(...res.winners);
    else fromBelow[k - 1].push(...res.winners);
    // Perdedores: bajan (k+1) salvo en el fondo, donde se quedan.
    if (isBottom) stayers[k].push(...res.losers);
    else fromAbove[k + 1].push(...res.losers);
  });

  const courts: string[][] = [];
  for (let k = 0; k < n; k++) {
    // Orden dentro de la pista: stayers-top, perdedores que bajan, ganadores que suben, stayers-fondo.
    // En top: stayers (ganadores) + fromBelow. En fondo: fromAbove + stayers (perdedores).
    courts.push([...stayers[k].slice(0, k === 0 ? 2 : 0), ...fromAbove[k], ...fromBelow[k], ...stayers[k].slice(k === 0 ? 2 : 0)]);
  }
  return { courts, resting: [...current.resting] };
}

// Aplica el movimiento y rota los descansos: los que descansaban entran por la pista fondo
// y los últimos 'resting.length' de la pista fondo pasan a descansar la siguiente ronda.
export function nextPozoRoundWithRest(current: PozoRound, results: CourtResult[]): PozoRound {
  const moved = nextPozoRound(current, results);
  const restCount = current.resting.length;
  if (restCount === 0 || moved.courts.length === 0) return moved;

  const bottomIdx = moved.courts.length - 1;
  const bottom = moved.courts[bottomIdx];
  // Salen a descansar los 'restCount' del final del fondo; entran los que descansaban.
  const goRest = bottom.slice(bottom.length - restCount);
  const staying = bottom.slice(0, bottom.length - restCount);
  moved.courts[bottomIdx] = [...staying, ...current.resting];
  moved.resting = goRest;
  return moved;
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

export interface PozoMatchResult {
  teamA: [string, string];
  teamB: [string, string];
  gamesA: number;
  gamesB: number;
  winner: 'A' | 'B';
}

export interface PozoStanding {
  participantId: string;
  games: number;
  wins: number;
  rank: number;
}

// Clasificación del pozo: por juegos ganados (desc), desempate por victorias (desc).
export function pozoStandings(participantIds: string[], results: PozoMatchResult[]): PozoStanding[] {
  const games = new Map<string, number>();
  const wins = new Map<string, number>();
  participantIds.forEach((p) => { games.set(p, 0); wins.set(p, 0); });

  for (const r of results) {
    const winners = r.winner === 'A' ? r.teamA : r.teamB;
    for (const p of r.teamA) games.set(p, (games.get(p) ?? 0) + r.gamesA);
    for (const p of r.teamB) games.set(p, (games.get(p) ?? 0) + r.gamesB);
    for (const p of winners) wins.set(p, (wins.get(p) ?? 0) + 1);
  }

  const table = participantIds.map((participantId) => ({
    participantId,
    games: games.get(participantId) ?? 0,
    wins: wins.get(participantId) ?? 0,
    rank: 0,
  }));
  table.sort((a, b) => b.games - a.games || b.wins - a.wins);
  table.forEach((row, i) => { row.rank = i + 1; });
  return table;
}
