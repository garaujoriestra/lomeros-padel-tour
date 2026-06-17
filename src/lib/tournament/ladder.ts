// Clasificación final del pozo POR ESCALERA: la pista de arriba (índice 0) es la mejor.
// Desempate dentro de una misma pista: por juegos acumulados (desc), estable si empatan.
// Vale para individuos (americano) o parejas (parejas fijas): opera sobre los ids que
// ocupan las pistas en la RONDA FINAL. Los que descansan van al final (court = null).

export interface LadderStanding {
  entityId: string;
  court: number | null; // índice de pista en la ronda final (0 = top); null si descansaba
  rank: number;
  games: number; // juegos acumulados (para mostrar y desempate)
}

export function ladderStandings(
  finalCourts: string[][],
  gamesByEntity: Map<string, number>,
  restingFinal: string[],
): LadderStanding[] {
  const out: LadderStanding[] = [];
  finalCourts.forEach((court, courtIdx) => {
    const sorted = court
      .map((entityId, pos) => ({ entityId, pos, games: gamesByEntity.get(entityId) ?? 0 }))
      // juegos desc; desempate estable por la posición original dentro de la pista
      .sort((a, b) => b.games - a.games || a.pos - b.pos);
    for (const s of sorted) out.push({ entityId: s.entityId, court: courtIdx, rank: 0, games: s.games });
  });
  for (const entityId of restingFinal) out.push({ entityId, court: null, rank: 0, games: gamesByEntity.get(entityId) ?? 0 });
  out.forEach((row, i) => { row.rank = i + 1; });
  return out;
}
