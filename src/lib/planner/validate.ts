import { isEditableWeek, mondayOf } from './weeks';
import { isValidSlotList } from './slots';

// Valida el payload de escritura de un día del planificador (API, no se fía del
// cliente). Devuelve el mensaje de error, o null si es válido.
export function writePayloadError(
  week: unknown, day: unknown, slots: unknown, todayIso: string,
): string | null {
  if (typeof week !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(week) || mondayOf(week) !== week) {
    return 'Semana inválida (usa la fecha del lunes, YYYY-MM-DD)';
  }
  if (!isEditableWeek(week, todayIso)) {
    return 'Solo se puede editar la semana actual o la siguiente';
  }
  if (!Number.isInteger(day) || (day as number) < 0 || (day as number) > 6) {
    return 'Día inválido (0=lunes … 6=domingo)';
  }
  if (!Array.isArray(slots) || !isValidSlotList(slots as number[])) {
    return 'Tramos inválidos: bloques de mínimo 1,5h en pasos de 30 min';
  }
  return null;
}
