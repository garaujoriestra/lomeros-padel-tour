import type { CreateCourtInput, CreateBlockInput, CreatePairInput, BlockConfig } from './store';
import type { MatchResultInput } from './results';
import type { MatchFormat } from './types';

export type Validated<T> = { ok: true; value: T } | { ok: false; error: string };

// Forma del "cascarón" del torneo (sin bloques; los bloques se añaden en el Plan 7).
export interface TournamentShellInput {
  name: string;
  date: string;
  location: string | null;
  notes: string | null;
  courts: CreateCourtInput[];
  participantPlayerIds: string[];
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function validateTournamentShell(body: unknown, rosterIds: Set<string>): Validated<TournamentShellInput> {
  if (typeof body !== 'object' || body === null) return { ok: false, error: 'Cuerpo inválido' };
  const b = body as Record<string, unknown>;

  const name = typeof b.name === 'string' ? b.name.trim() : '';
  if (!name) return { ok: false, error: 'El nombre es obligatorio' };

  const date = typeof b.date === 'string' ? b.date : '';
  if (!DATE.test(date)) return { ok: false, error: 'Fecha inválida (formato YYYY-MM-DD)' };

  if (!Array.isArray(b.courts) || b.courts.length === 0) {
    return { ok: false, error: 'Añade al menos una pista' };
  }
  const courts: CreateCourtInput[] = [];
  for (const [i, raw] of b.courts.entries()) {
    if (typeof raw !== 'object' || raw === null) return { ok: false, error: `Pista ${i + 1} inválida` };
    const c = raw as Record<string, unknown>;
    const label = typeof c.label === 'string' ? c.label.trim() : '';
    if (!label) return { ok: false, error: `La pista ${i + 1} necesita nombre` };
    const order = typeof c.order === 'number' ? c.order : i + 1;
    const availableFrom = typeof c.availableFrom === 'string' ? c.availableFrom : '';
    const availableTo = typeof c.availableTo === 'string' ? c.availableTo : '';
    if (!HHMM.test(availableFrom) || !HHMM.test(availableTo)) {
      return { ok: false, error: `Horario inválido en la pista "${label}" (usa HH:MM)` };
    }
    if (availableFrom >= availableTo) {
      return { ok: false, error: `En la pista "${label}", la hora de inicio debe ser anterior a la de fin` };
    }
    courts.push({ label, order, availableFrom, availableTo });
  }

  if (!Array.isArray(b.participantPlayerIds) || b.participantPlayerIds.length === 0) {
    return { ok: false, error: 'Selecciona al menos un participante' };
  }
  const seen = new Set<string>();
  const participantPlayerIds: string[] = [];
  for (const pid of b.participantPlayerIds) {
    if (typeof pid !== 'string') return { ok: false, error: 'Participante inválido' };
    if (seen.has(pid)) return { ok: false, error: 'Hay participantes duplicados' };
    if (!rosterIds.has(pid)) return { ok: false, error: 'Algún participante no existe en el roster' };
    seen.add(pid);
    participantPlayerIds.push(pid);
  }

  const location = typeof b.location === 'string' && b.location.trim() ? b.location.trim() : null;
  const notes = typeof b.notes === 'string' && b.notes.trim() ? b.notes.trim() : null;

  return { ok: true, value: { name, date, location, notes, courts, participantPlayerIds } };
}

export function validateResultInput(body: unknown): Validated<MatchResultInput> {
  if (typeof body !== 'object' || body === null) return { ok: false, error: 'Cuerpo inválido' };
  const b = body as Record<string, unknown>;

  if (!Number.isInteger(b.teamAScore) || (b.teamAScore as number) < 0) {
    return { ok: false, error: 'teamAScore debe ser un entero ≥ 0' };
  }
  if (!Number.isInteger(b.teamBScore) || (b.teamBScore as number) < 0) {
    return { ok: false, error: 'teamBScore debe ser un entero ≥ 0' };
  }

  let winner: 'A' | 'B' | null | undefined;
  if (b.winner === undefined) winner = undefined;
  else if (b.winner === 'A' || b.winner === 'B' || b.winner === null) winner = b.winner;
  else return { ok: false, error: "winner debe ser 'A', 'B' o null" };

  const setsJson = typeof b.setsJson === 'string' ? b.setsJson : undefined;

  return {
    ok: true,
    value: { teamAScore: b.teamAScore as number, teamBScore: b.teamBScore as number, winner, setsJson },
  };
}

function validMatchFormat(raw: unknown): MatchFormat | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const m = raw as Record<string, unknown>;
  switch (m.kind) {
    case 'timed':
      if (Number.isInteger(m.minutes) && (m.minutes as number) > 0 && (m.tieRule === 'golden_point' || m.tieRule === 'allow_draw')) {
        return { kind: 'timed', minutes: m.minutes as number, tieRule: m.tieRule };
      }
      return null;
    case 'first_to_set': return { kind: 'first_to_set' };
    case 'best_of_3': return { kind: 'best_of_3' };
    case 'games':
      if (Number.isInteger(m.target) && (m.target as number) > 0) return { kind: 'games', target: m.target as number };
      return null;
    default: return null;
  }
}

// Valida la lista completa de bloques (cuerpo { blocks: [...] }) contra los participantes.
export function validateBlocks(body: unknown, participantIds: Set<string>): Validated<CreateBlockInput[]> {
  if (typeof body !== 'object' || body === null) return { ok: false, error: 'Cuerpo inválido' };
  const rawBlocks = (body as Record<string, unknown>).blocks;
  if (!Array.isArray(rawBlocks)) return { ok: false, error: 'Faltan los bloques' };

  const blocks: CreateBlockInput[] = [];
  for (const [i, item] of rawBlocks.entries()) {
    const label = `Bloque ${i + 1}`;
    if (typeof item !== 'object' || item === null) return { ok: false, error: `${label}: inválido` };
    const b = item as Record<string, unknown>;

    if (b.type !== 'pozo' && b.type !== 'fixed_pairs') return { ok: false, error: `${label}: tipo inválido` };
    const name = typeof b.name === 'string' ? b.name.trim() : '';
    if (!name) return { ok: false, error: `${label}: falta el nombre` };
    if (!Number.isInteger(b.durationMinutes) || (b.durationMinutes as number) <= 0) {
      return { ok: false, error: `${label}: la duración debe ser un entero > 0` };
    }
    const matchFormat = validMatchFormat(b.matchFormat);
    if (!matchFormat) return { ok: false, error: `${label}: formato de partido inválido` };
    if (!Number.isInteger(b.bufferMinutes) || (b.bufferMinutes as number) < 0) {
      return { ok: false, error: `${label}: el descanso debe ser un entero ≥ 0` };
    }
    const duration = b.durationMinutes as number;
    const bufferMinutes = b.bufferMinutes as number;

    if (b.type === 'pozo') {
      if (!Number.isInteger(b.roundMinutes) || (b.roundMinutes as number) <= 0) {
        return { ok: false, error: `${label}: la duración de ronda debe ser un entero > 0` };
      }
      if ((b.roundMinutes as number) > duration) {
        return { ok: false, error: `${label}: la ronda no puede durar más que el bloque` };
      }
      const order = Array.isArray(b.participantOrder) ? b.participantOrder : [];
      const seen = new Set<string>();
      for (const pid of order) {
        if (typeof pid !== 'string' || !participantIds.has(pid)) {
          return { ok: false, error: `${label}: jugador del pozo fuera de los participantes` };
        }
        if (seen.has(pid)) return { ok: false, error: `${label}: jugador repetido en el pozo` };
        seen.add(pid);
      }
      const config: BlockConfig = {
        matchFormat, bufferMinutes,
        roundMinutes: b.roundMinutes as number,
        participantOrder: order as string[],
      };
      blocks.push({ order: i + 1, type: 'pozo', name, durationMinutes: duration, config });
      continue;
    }

    // fixed_pairs
    const knockout = b.knockout === true;
    const groupNamesRaw = Array.isArray(b.groupNames) ? b.groupNames : [];
    const groupNames: string[] = [];
    const groupSeen = new Set<string>();
    for (const g of groupNamesRaw) {
      if (typeof g !== 'string' || !g.trim()) return { ok: false, error: `${label}: nombre de grupo vacío` };
      const gname = g.trim();
      if (groupSeen.has(gname)) return { ok: false, error: `${label}: grupo duplicado "${gname}"` };
      groupSeen.add(gname);
      groupNames.push(gname);
    }

    const pairsRaw = Array.isArray(b.pairs) ? b.pairs : [];
    const pairs: CreatePairInput[] = [];
    const playerSeen = new Set<string>();
    const groupCount = new Map<string, number>();
    for (const [j, pr] of pairsRaw.entries()) {
      if (typeof pr !== 'object' || pr === null) return { ok: false, error: `${label}: pareja ${j + 1} inválida` };
      const p = pr as Record<string, unknown>;
      const p1 = p.player1Id, p2 = p.player2Id;
      if (typeof p1 !== 'string' || typeof p2 !== 'string' || !participantIds.has(p1) || !participantIds.has(p2)) {
        return { ok: false, error: `${label}: pareja ${j + 1} con jugador fuera de los participantes` };
      }
      if (p1 === p2) return { ok: false, error: `${label}: pareja ${j + 1} con el mismo jugador dos veces` };
      if (playerSeen.has(p1) || playerSeen.has(p2)) return { ok: false, error: `${label}: un jugador está en dos parejas` };
      playerSeen.add(p1);
      playerSeen.add(p2);

      let groupName: string | undefined;
      if (groupNames.length > 0) {
        if (typeof p.groupName !== 'string' || !groupNames.includes(p.groupName)) {
          return { ok: false, error: `${label}: pareja ${j + 1} sin grupo válido` };
        }
        groupName = p.groupName;
        groupCount.set(groupName, (groupCount.get(groupName) ?? 0) + 1);
      }
      let seed: number | undefined;
      if (p.seed !== undefined && p.seed !== null) {
        if (!Number.isInteger(p.seed)) return { ok: false, error: `${label}: seed inválido en la pareja ${j + 1}` };
        seed = p.seed as number;
      }
      pairs.push({ player1Id: p1, player2Id: p2, seed, groupName });
    }

    if (knockout && groupNames.length > 0) {
      if (!Number.isInteger(b.advancePerGroup) || (b.advancePerGroup as number) < 1) {
        return { ok: false, error: `${label}: clasifican por grupo debe ser ≥ 1` };
      }
      const smallest = Math.min(...groupNames.map((g) => groupCount.get(g) ?? 0));
      if ((b.advancePerGroup as number) > smallest) {
        return { ok: false, error: `${label}: clasifican por grupo (${b.advancePerGroup}) supera el grupo más pequeño (${smallest})` };
      }
    }
    if (knockout && groupNames.length === 0 && pairs.length < 2) {
      return { ok: false, error: `${label}: un cuadro sin grupos necesita al menos 2 parejas` };
    }

    const config: BlockConfig = {
      matchFormat, bufferMinutes, knockout,
      advancePerGroup: Number.isInteger(b.advancePerGroup) ? (b.advancePerGroup as number) : undefined,
    };
    blocks.push({ order: i + 1, type: 'fixed_pairs', name, durationMinutes: duration, config, groupNames, pairs });
  }

  return { ok: true, value: blocks };
}
