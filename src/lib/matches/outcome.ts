// Qué significa un conjunto de sets. Única fuente de verdad para las tres rutas
// que registran o corrigen un resultado (POST /api/matches, PUT /api/matches/[id]
// y PATCH /api/matches/[id]/result), que antes repetían el conteo cada una.
//
// El caso que motivó extraerlo: un partido puede acabar 1-1 a sets si no da
// tiempo al tercero. Contando «gana quien tenga más sets» ese 1-1 caía del lado
// del equipo 2 en silencio, con el Elo y las apuestas liquidados al revés.

export interface SetInput {
  setNumber: number;
  team1Games: number;
  team2Games: number;
}

export type SetsOutcome =
  | { ok: true; status: 'completed'; winnerTeam: 1 | 2; sets: SetInput[] }
  | { ok: true; status: 'draw'; winnerTeam: null; sets: SetInput[] }
  | { ok: false; error: string };

/**
 * Valida los sets de un partido y devuelve su desenlace.
 *
 * - Un equipo gana 2 sets → `completed` con ganador.
 * - Cada equipo gana 1 set y solo se jugaron 2 → `draw` (no dio tiempo al tercero).
 * - Cualquier otra combinación es un error de captura.
 */
export function resolveSetsOutcome(sets: unknown): SetsOutcome {
  if (!Array.isArray(sets) || sets.length < 2 || sets.length > 3) {
    return { ok: false, error: 'El partido necesita 2 o 3 sets' };
  }

  let team1SetsWon = 0;
  let team2SetsWon = 0;
  const clean: SetInput[] = [];

  for (let i = 0; i < sets.length; i++) {
    const s = sets[i] as { team1Games?: unknown; team2Games?: unknown };
    const g1 = Number(s?.team1Games);
    const g2 = Number(s?.team2Games);
    if (!Number.isInteger(g1) || !Number.isInteger(g2) || g1 < 0 || g2 < 0) {
      return { ok: false, error: 'Los juegos de cada set deben ser números válidos' };
    }
    if (g1 === g2) return { ok: false, error: 'Un set no puede terminar empatado' };
    if (g1 > g2) team1SetsWon++;
    else team2SetsWon++;
    clean.push({ setNumber: i + 1, team1Games: g1, team2Games: g2 });
  }

  if (team1SetsWon === 2 || team2SetsWon === 2) {
    return { ok: true, status: 'completed', winnerTeam: team1SetsWon === 2 ? 1 : 2, sets: clean };
  }

  // 1-1 con solo 2 sets jugados: empate, no dio tiempo al tercero. Con 3 sets
  // siempre hay un 2-1, así que aquí solo se llega con 2 sets repartidos.
  if (team1SetsWon === 1 && team2SetsWon === 1) {
    return { ok: true, status: 'draw', winnerTeam: null, sets: clean };
  }

  return { ok: false, error: 'Un equipo debe ganar 2 sets, o el partido queda 1-1' };
}

/** Partidos con resultado deportivo registrado: victorias y empates. */
export function isPlayed(match: { status: string }): boolean {
  return match.status === 'completed' || match.status === 'draw';
}

/** Resultado de un partido desde la óptica de un jugador: victoria, empate, derrota. */
export type FormResult = 'W' | 'D' | 'L';
