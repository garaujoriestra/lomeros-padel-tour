import type { MatchFormat, EventKind, EventConfig } from './types';

export type Validated<T> = { ok: true; value: T } | { ok: false; error: string };

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

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

// --- Validación del evento (kind + format + config) ---

export interface EventInputValidated {
  name: string;
  date: string;
  location: string | null;
  kind: EventKind;
  format: string;
  config: EventConfig;
  courts: { label: string; order: number; availableFrom: string; availableTo: string }[];
  participantPlayerIds: string[];
}

export function validateEventInput(body: unknown, rosterIds: Set<string>): Validated<EventInputValidated> {
  if (typeof body !== 'object' || body === null) return { ok: false, error: 'Cuerpo inválido' };
  const b = body as Record<string, unknown>;

  const name = typeof b.name === 'string' ? b.name.trim() : '';
  if (!name) return { ok: false, error: 'Falta el nombre' };

  const date = typeof b.date === 'string' ? b.date.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: 'Fecha inválida (YYYY-MM-DD)' };

  const location = typeof b.location === 'string' && b.location.trim() ? b.location.trim() : null;

  const kind = b.kind;
  if (kind !== 'pozo' && kind !== 'torneo') return { ok: false, error: 'Tipo inválido' };

  const format = b.format;
  const validFormats = kind === 'pozo' ? ['fixed_pairs', 'americano'] : ['single_elim', 'groups_elim'];
  if (typeof format !== 'string' || !validFormats.includes(format)) {
    return { ok: false, error: 'Formato inválido para el tipo' };
  }

  if (!Array.isArray(b.courts) || b.courts.length === 0) return { ok: false, error: 'Añade al menos una pista' };
  const courts: EventInputValidated['courts'] = [];
  for (const [i, raw] of b.courts.entries()) {
    if (typeof raw !== 'object' || raw === null) return { ok: false, error: `La pista ${i + 1} es inválida` };
    const c = raw as Record<string, unknown>;
    const label = typeof c.label === 'string' ? c.label.trim() : '';
    if (!label) return { ok: false, error: `La pista ${i + 1} necesita nombre` };
    const order = typeof c.order === 'number' ? c.order : i + 1;
    const availableFrom = typeof c.availableFrom === 'string' ? c.availableFrom : '';
    const availableTo = typeof c.availableTo === 'string' ? c.availableTo : '';
    if (!HHMM.test(availableFrom) || !HHMM.test(availableTo)) return { ok: false, error: `Horario inválido en "${label}"` };
    if (availableFrom >= availableTo) return { ok: false, error: `En "${label}", inicio debe ser antes que fin` };
    courts.push({ label, order, availableFrom, availableTo });
  }

  if (!Array.isArray(b.participantPlayerIds) || b.participantPlayerIds.length === 0) {
    return { ok: false, error: 'Selecciona participantes' };
  }
  const participantPlayerIds: string[] = [];
  const seenParticipants = new Set<string>();
  for (const pid of b.participantPlayerIds) {
    if (typeof pid !== 'string' || !rosterIds.has(pid)) return { ok: false, error: 'Participante no válido' };
    if (seenParticipants.has(pid)) return { ok: false, error: 'Participante repetido' };
    seenParticipants.add(pid);
    participantPlayerIds.push(pid);
  }

  const cfg = (typeof b.config === 'object' && b.config !== null ? b.config : {}) as Record<string, unknown>;
  let config: EventConfig;
  if (kind === 'pozo') {
    const rounds = cfg.rounds;
    if (!Number.isInteger(rounds) || (rounds as number) <= 0) return { ok: false, error: 'El nº de rondas debe ser > 0' };
    const mf = validMatchFormat(cfg.matchFormat);
    if (!mf) return { ok: false, error: 'Formato de partido inválido' };
    config = { rounds: rounds as number, matchFormat: mf };
  } else {
    const mf = validMatchFormat(cfg.matchFormat);
    if (!mf) return { ok: false, error: 'Formato de partido inválido' };
    const thirdPlace = cfg.thirdPlace === true;
    if (format === 'groups_elim') {
      const numGroups = cfg.numGroups;
      const advancePerGroup = cfg.advancePerGroup ?? 2;
      if (!Number.isInteger(numGroups) || (numGroups as number) < 1) return { ok: false, error: 'nº de grupos inválido' };
      if (!Number.isInteger(advancePerGroup) || (advancePerGroup as number) < 1) return { ok: false, error: 'pasan-por-grupo debe ser ≥ 1' };
      config = { matchFormat: mf, thirdPlace, numGroups: numGroups as number, advancePerGroup: advancePerGroup as number };
    } else {
      config = { matchFormat: mf, thirdPlace };
    }
  }

  return { ok: true, value: { name, date, location, kind, format, config, courts, participantPlayerIds } };
}

// Valida el set de parejas de un evento. participantIds = roster del evento.
// Exige: cada pareja con 2 jugadores distintos del roster, cada jugador en una sola
// pareja, y TODOS los participantes emparejados (nº par y completo).
export function validatePairsInput(body: unknown, participantIds: Set<string>): Validated<[string, string][]> {
  if (typeof body !== 'object' || body === null) return { ok: false, error: 'Cuerpo inválido' };
  const b = body as Record<string, unknown>;
  if (!Array.isArray(b.pairs)) return { ok: false, error: 'Faltan las parejas' };

  const pairs: [string, string][] = [];
  const seen = new Set<string>();
  for (const [i, raw] of b.pairs.entries()) {
    if (!Array.isArray(raw) || raw.length !== 2) return { ok: false, error: `La pareja ${i + 1} es inválida` };
    const [p1, p2] = raw;
    if (typeof p1 !== 'string' || typeof p2 !== 'string') return { ok: false, error: `La pareja ${i + 1} es inválida` };
    if (p1 === p2) return { ok: false, error: `Una pareja no puede repetir jugador` };
    for (const p of [p1, p2]) {
      if (!participantIds.has(p)) return { ok: false, error: 'Jugador fuera del roster' };
      if (seen.has(p)) return { ok: false, error: 'Un jugador no puede estar en dos parejas' };
      seen.add(p);
    }
    pairs.push([p1, p2]);
  }
  if (pairs.length === 0) return { ok: false, error: 'Define al menos una pareja' };
  if (seen.size !== participantIds.size) return { ok: false, error: 'Todos los participantes deben estar emparejados' };
  return { ok: true, value: pairs };
}
