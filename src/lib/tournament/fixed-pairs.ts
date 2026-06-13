export interface PairMatchResult {
  pairA: string;
  pairB: string;
  gamesA: number;
  gamesB: number;
  winner: 'A' | 'B' | 'draw';
}

export interface GroupStanding {
  pairId: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  gamesFor: number;
  gamesAgainst: number;
  gameDiff: number;
  points: number;
  rank: number;
}

// Clasificación de grupo. Victoria 3, empate 1, derrota 0. Desempate: puntos,
// diferencia de juegos, juegos a favor, y pairId asc para ser determinista.
export function groupStandings(pairIds: string[], results: PairMatchResult[]): GroupStanding[] {
  const rows = new Map<string, GroupStanding>();
  for (const pairId of pairIds) {
    rows.set(pairId, {
      pairId, played: 0, wins: 0, draws: 0, losses: 0,
      gamesFor: 0, gamesAgainst: 0, gameDiff: 0, points: 0, rank: 0,
    });
  }

  const apply = (pairId: string, gf: number, ga: number, outcome: 'win' | 'draw' | 'loss') => {
    const row = rows.get(pairId);
    if (!row) return;
    row.played += 1;
    row.gamesFor += gf;
    row.gamesAgainst += ga;
    if (outcome === 'win') { row.wins += 1; row.points += 3; }
    else if (outcome === 'draw') { row.draws += 1; row.points += 1; }
    else { row.losses += 1; }
  };

  for (const r of results) {
    if (r.winner === 'A') {
      apply(r.pairA, r.gamesA, r.gamesB, 'win');
      apply(r.pairB, r.gamesB, r.gamesA, 'loss');
    } else if (r.winner === 'B') {
      apply(r.pairA, r.gamesA, r.gamesB, 'loss');
      apply(r.pairB, r.gamesB, r.gamesA, 'win');
    } else {
      apply(r.pairA, r.gamesA, r.gamesB, 'draw');
      apply(r.pairB, r.gamesB, r.gamesA, 'draw');
    }
  }

  const table = [...rows.values()];
  table.forEach((row) => { row.gameDiff = row.gamesFor - row.gamesAgainst; });
  table.sort((a, b) =>
    b.points - a.points ||
    b.gameDiff - a.gameDiff ||
    b.gamesFor - a.gamesFor ||
    a.pairId.localeCompare(b.pairId),
  );
  table.forEach((row, i) => { row.rank = i + 1; });
  return table;
}

export interface RoundRobinMatch {
  round: number;
  pairA: string;
  pairB: string;
}

const BYE = '__BYE__';

// Calendario todos-contra-todos por el método del círculo. Con impar, añade un hueco
// fantasma (BYE) que hace descansar a una pareja por ronda (no se emite partido).
export function roundRobinSchedule(pairIds: string[]): RoundRobinMatch[] {
  if (pairIds.length < 2) return [];
  let arr = [...pairIds];
  if (arr.length % 2 !== 0) arr.push(BYE);
  const n = arr.length;
  const half = n / 2;
  const matches: RoundRobinMatch[] = [];
  for (let round = 0; round < n - 1; round++) {
    for (let i = 0; i < half; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      if (a !== BYE && b !== BYE) matches.push({ round, pairA: a, pairB: b });
    }
    // Rota dejando fijo el primer elemento.
    arr = [arr[0], arr[n - 1], ...arr.slice(1, n - 1)];
  }
  return matches;
}
