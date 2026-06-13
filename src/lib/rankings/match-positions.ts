// Calcula la posición en el ranking individual (ELO desc, solo jugadores con
// partidos jugados) antes y después de un partido, para los jugadores que
// participaron. Es una función pura para poder testearla sin DB.

export interface PlayerEloRow {
  id: string;
  eloRating: number;
  matchesPlayed: number;
}

export interface MatchEloChange {
  playerId: string;
  eloAfter: number;
  eloChange: number;
}

export interface ResultPosition {
  before: number | null; // null si era su primer partido (no estaba rankeado)
  after: number;
}

// Mismo criterio que /api/rankings: solo jugadores con matchesPlayed > 0,
// ordenados por ELO descendente. Posición 1-indexed.
function rankMap(rows: { id: string; eloRating: number }[]): Map<string, number> {
  const sorted = [...rows].sort((a, b) => b.eloRating - a.eloRating);
  const m = new Map<string, number>();
  sorted.forEach((r, i) => m.set(r.id, i + 1));
  return m;
}

/**
 * Dado el estado de TODOS los jugadores tras procesar el partido y los cambios
 * de ELO de los participantes, devuelve la posición previa y nueva de cada uno.
 *
 * El estado previo se reconstruye: los participantes tenían eloBefore
 * (= eloAfter − eloChange) y un partido menos; el resto queda igual.
 */
export function computeResultPositions(
  allPlayersAfter: PlayerEloRow[],
  eloChanges: MatchEloChange[],
): Map<string, ResultPosition> {
  const changeById = new Map(eloChanges.map((c) => [c.playerId, c]));

  const afterRanks = rankMap(allPlayersAfter.filter((p) => p.matchesPlayed > 0));

  const beforeRows = allPlayersAfter
    .map((p) => {
      const ch = changeById.get(p.id);
      if (!ch) return { id: p.id, eloRating: p.eloRating, matchesPlayed: p.matchesPlayed };
      return {
        id: p.id,
        eloRating: ch.eloAfter - ch.eloChange,
        matchesPlayed: p.matchesPlayed - 1,
      };
    })
    .filter((p) => p.matchesPlayed > 0);
  const beforeRanks = rankMap(beforeRows);

  const out = new Map<string, ResultPosition>();
  for (const ch of eloChanges) {
    const after = afterRanks.get(ch.playerId);
    if (after == null) continue; // no debería ocurrir: acaban de jugar
    out.set(ch.playerId, { before: beforeRanks.get(ch.playerId) ?? null, after });
  }
  return out;
}
