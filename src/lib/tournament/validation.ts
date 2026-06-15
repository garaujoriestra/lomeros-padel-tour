import type { CreateCourtInput } from './store';
import type { MatchResultInput } from './results';

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
