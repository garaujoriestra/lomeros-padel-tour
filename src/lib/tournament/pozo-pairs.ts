// Rey de la pista con PAREJAS FIJAS: cada pista = 2 parejas (pairId). La pareja que
// gana sube una pista, la que pierde baja; top retiene al ganador, fondo al perdedor.
// Las parejas no se rompen nunca. Estructura análoga a pozo.ts pero con parejas
// como unidad atómica (2 por pista en vez de 4 individuos).

export interface PairsRound {
  courts: string[][]; // courts[i] = [pairIdTop, pairIdBottom] de la pista de orden i+1
  resting: string[];  // pairIds que descansan esta ronda
}

export interface PairCourtResult {
  winner: string; // pairId ganador
  loser: string;  // pairId perdedor
}

// Siembra: 2 parejas por pista en orden; sobrantes a resting; no crea pistas a medias.
export function seedPozoPairsCourts(pairIds: string[], numCourts: number): PairsRound {
  const fillable = Math.min(numCourts, Math.floor(pairIds.length / 2));
  const courts: string[][] = [];
  for (let i = 0; i < fillable; i++) courts.push(pairIds.slice(i * 2, i * 2 + 2));
  const resting = pairIds.slice(fillable * 2);
  return { courts, resting };
}

// Movimiento clásico aplicado a parejas. results[i] corresponde a current.courts[i].
function moveCourts(current: PairsRound, results: PairCourtResult[]): PairsRound {
  const n = current.courts.length;
  const fromAbove: string[][] = Array.from({ length: n }, () => []); // perdedores que bajan
  const fromBelow: string[][] = Array.from({ length: n }, () => []); // ganadores que suben
  const stayTop: string[][] = Array.from({ length: n }, () => []);
  const stayBottom: string[][] = Array.from({ length: n }, () => []);

  results.forEach((res, k) => {
    const isTop = k === 0;
    const isBottom = k === n - 1;
    if (isTop) stayTop[k].push(res.winner); else fromBelow[k - 1].push(res.winner);
    if (isBottom) stayBottom[k].push(res.loser); else fromAbove[k + 1].push(res.loser);
  });

  const courts: string[][] = [];
  for (let k = 0; k < n; k++) {
    courts.push([...stayTop[k], ...fromAbove[k], ...fromBelow[k], ...stayBottom[k]]);
  }
  return { courts, resting: [...current.resting] };
}

// Aplica el movimiento y rota los descansos: la última pareja del fondo sale a descansar
// y entran las que descansaban.
export function nextPozoPairsRound(current: PairsRound, results: PairCourtResult[]): PairsRound {
  const moved = moveCourts(current, results);
  const restCount = current.resting.length;
  if (restCount === 0 || moved.courts.length === 0) return moved;

  const bottomIdx = moved.courts.length - 1;
  const bottom = moved.courts[bottomIdx];
  const goRest = bottom.slice(bottom.length - restCount);
  const staying = bottom.slice(0, bottom.length - restCount);
  moved.courts[bottomIdx] = [...staying, ...current.resting];
  moved.resting = goRest;
  return moved;
}
