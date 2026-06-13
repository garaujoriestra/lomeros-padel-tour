import type { SlotRef } from './types';

// Orden estándar de siembra de un bracket de tamaño potencia de 2 (base 0).
// Empareja cabezas de serie altas con bajas en cada ronda. Ej. tamaño 4 -> [0,3,1,2].
// Precondición: size es potencia de 2.
export function seedOrder(size: number): number[] {
  let seeds = [0, 1];
  while (seeds.length < size) {
    const sum = seeds.length * 2 - 1; // suma de cada par de sembrados (base 0)
    const next: number[] = [];
    for (const s of seeds) {
      next.push(s);
      next.push(sum - s);
    }
    seeds = next;
  }
  return seeds;
}

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

export interface BracketMatch {
  matchId: string; // clave posicional del motor (p.ej. 'r0m0'), NO un id de DB
  round: number;
  slotA: SlotRef;
  slotB: SlotRef;
}

// Genera el cuadro completo a partir de parejas ya sembradas (en orden de siembra).
// Tamaño = potencia de 2 superior; los byes recaen en los mejores sembrados.
export function generateBracket(seededPairIds: string[]): BracketMatch[] {
  const numPairs = seededPairIds.length;
  if (numPairs < 2) return [];

  let size = 1;
  while (size < numPairs) size *= 2;

  const order = seedOrder(size);
  const matches: BracketMatch[] = [];

  // Los byes recaen en los peores sembrados (índices >= numPairs). Como `size` es la menor
  // potencia de 2 >= numPairs, hay menos de size/2 byes, y en el orden de siembra cada par de
  // posiciones suma size-1, por lo que nunca se emparejan dos byes en el mismo partido.
  // Ronda 0: size/2 partidos con huecos pair/bye según la siembra.
  const seedToSlot = (seedIdx: number): SlotRef =>
    seedIdx < numPairs ? { type: 'pair', pairId: seededPairIds[seedIdx] } : { type: 'bye' };

  for (let i = 0; i < size / 2; i++) {
    matches.push({
      matchId: `r0m${i}`,
      round: 0,
      slotA: seedToSlot(order[2 * i]),
      slotB: seedToSlot(order[2 * i + 1]),
    });
  }

  // Rondas siguientes: cada partido lo alimentan dos partidos de la ronda anterior.
  let round = 1;
  let prevCount = size / 2;
  while (prevCount > 1) {
    const count = prevCount / 2;
    for (let i = 0; i < count; i++) {
      matches.push({
        matchId: `r${round}m${i}`,
        round,
        slotA: { type: 'matchWinner', matchId: `r${round - 1}m${2 * i}` },
        slotB: { type: 'matchWinner', matchId: `r${round - 1}m${2 * i + 1}` },
      });
    }
    prevCount = count;
    round += 1;
  }

  return matches;
}

export interface ResolvedBracketMatch {
  matchId: string;
  round: number;
  slotA: SlotRef;
  slotB: SlotRef;
  winnerPairId?: string;
}

// Resuelve los huecos matchWinner a la pareja concreta cuando se conoce, y calcula el
// ganador de cada partido. Los byes avanzan sin resultado. Procesa por rondas crecientes.
export function resolveBracket(
  bracket: BracketMatch[],
  results: Map<string, 'A' | 'B'>,
): ResolvedBracketMatch[] {
  const winnerByMatch = new Map<string, string>();

  const resolveSlot = (slot: SlotRef): SlotRef => {
    if (slot.type === 'matchWinner') {
      const w = winnerByMatch.get(slot.matchId);
      return w ? { type: 'pair', pairId: w } : slot;
    }
    return slot;
  };

  const sorted = [...bracket].sort((a, b) => a.round - b.round);
  const out: ResolvedBracketMatch[] = [];

  for (const m of sorted) {
    const slotA = resolveSlot(m.slotA);
    const slotB = resolveSlot(m.slotB);
    const aPair = slotA.type === 'pair' ? slotA.pairId : undefined;
    const bPair = slotB.type === 'pair' ? slotB.pairId : undefined;
    const aBye = slotA.type === 'bye';
    const bBye = slotB.type === 'bye';

    let winnerPairId: string | undefined;
    if (aPair && bBye) winnerPairId = aPair;
    else if (bPair && aBye) winnerPairId = bPair;
    else if (aPair && bPair) {
      const res = results.get(m.matchId);
      if (res === 'A') winnerPairId = aPair;
      else if (res === 'B') winnerPairId = bPair;
    }

    if (winnerPairId) winnerByMatch.set(m.matchId, winnerPairId);
    out.push({ matchId: m.matchId, round: m.round, slotA, slotB, winnerPairId });
  }

  return out;
}

