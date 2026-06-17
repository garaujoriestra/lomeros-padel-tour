import type { EventKind } from './types';

// Estado público de un evento derivado de su resumen (sin estado 'completed' a nivel de evento:
// la finalización se deduce de los partidos).
export type EventLiveState = 'upcoming' | 'live' | 'finished';

export function eventLiveState(s: { status: string; totalMatches: number; completedMatches: number }): EventLiveState {
  if (s.status === 'draft') return 'upcoming'; // aún no generado
  if (s.totalMatches > 0 && s.completedMatches < s.totalMatches) return 'live';
  if (s.totalMatches > 0 && s.completedMatches === s.totalMatches) return 'finished';
  return 'upcoming';
}

export function kindLabel(kind: EventKind): string {
  return kind === 'pozo' ? 'Pozo' : 'Torneo';
}

// Ruta del detalle público según el kind.
export function eventDetailHref(kind: EventKind, id: string): string {
  return kind === 'pozo' ? `/pozos/${id}` : `/torneos/${id}`;
}
