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
