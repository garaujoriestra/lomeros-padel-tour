import type { MatchFormat } from './types';

// Duración estimada de juego (sin buffer) para planificar la parrilla.
export function estimatedMatchMinutes(format: MatchFormat): number {
  switch (format.kind) {
    case 'timed':
      return format.minutes;
    case 'first_to_set':
      return 20;
    case 'games':
      return Math.max(15, Math.round(format.target * 3.5));
    case 'best_of_3':
      return 40;
  }
}

export interface CourtWindow {
  courtId: string;
  order: number;   // 1 = pista más alta
  fromMin: number; // minutos desde medianoche
  toMin: number;
}

export interface ScheduleItem {
  matchId: string;
  players: string[]; // participantIds implicados (para detectar solapes)
}

export interface ScheduledMatch {
  matchId: string;
  courtId: string;
  startMin: number;
  endMin: number;
}

export interface ScheduleResult {
  scheduled: ScheduledMatch[];
  unscheduled: string[];
}

// Planificador greedy. Coloca cada partido en el primer instante posible sobre alguna
// pista, sin que ningún participante juegue dos partidos a la vez. slotMinutes = duración
// estimada del partido + buffer.
export function scheduleMatches(
  items: ScheduleItem[],
  courts: CourtWindow[],
  slotMinutes: number,
): ScheduleResult {
  const scheduled: ScheduledMatch[] = [];
  const unscheduled: string[] = [];

  // Ocupación por pista: lista de [start, end) ya asignados.
  const courtBusy = new Map<string, Array<[number, number]>>();
  courts.forEach((c) => courtBusy.set(c.courtId, []));
  // Ocupación por participante: lista de [start, end).
  const playerBusy = new Map<string, Array<[number, number]>>();
  items.forEach((item) => item.players.forEach((p) => { if (!playerBusy.has(p)) playerBusy.set(p, []); }));

  const overlaps = (intervals: Array<[number, number]>, start: number, end: number) =>
    intervals.some(([s, e]) => start < e && s < end);

  // Ordena pistas por inicio y luego por 'order' para preferir las mejores antes.
  const sortedCourts = [...courts].sort((a, b) => a.fromMin - b.fromMin || a.order - b.order);

  for (const item of items) {
    // Candidatos de inicio: para cada pista, prueba instantes desde su inicio hasta que cabe.
    // Recoge todos los candidatos válidos y elige el de inicio más temprano (desempate: order).
    let best: { court: CourtWindow; start: number } | null = null;
    for (const court of sortedCourts) {
      for (let start = court.fromMin; start + slotMinutes <= court.toMin; start += slotMinutes) {
        const end = start + slotMinutes;
        if (overlaps(courtBusy.get(court.courtId)!, start, end)) continue;
        if (item.players.some((p) => overlaps(playerBusy.get(p)!, start, end))) continue;
        if (!best || start < best.start || (start === best.start && court.order < best.court.order)) {
          best = { court, start };
        }
        break; // primer hueco libre de esta pista; pasamos a la siguiente
      }
    }
    if (best) {
      const end = best.start + slotMinutes;
      scheduled.push({ matchId: item.matchId, courtId: best.court.courtId, startMin: best.start, endMin: end });
      courtBusy.get(best.court.courtId)!.push([best.start, end]);
      item.players.forEach((p) => playerBusy.get(p)!.push([best!.start, end]));
    } else {
      unscheduled.push(item.matchId);
    }
  }

  return { scheduled, unscheduled };
}
