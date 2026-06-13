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
