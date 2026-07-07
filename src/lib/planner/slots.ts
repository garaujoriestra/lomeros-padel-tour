import { PLANNER } from './config';

// ¿Lista de slots de un día válida? Minutos de inicio dentro del rango, múltiplos
// del tamaño de celda, ordenados sin duplicados, y cada bloque de consecutivos con
// ≥ minBlockSlots celdas: un partido dura 1,5h, bloques menores no cuadran nada.
export function isValidSlotList(slots: number[]): boolean {
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (!Number.isInteger(s) || s % PLANNER.slotMinutes !== 0) return false;
    if (s < PLANNER.dayStartMin || s + PLANNER.slotMinutes > PLANNER.dayEndMin) return false;
    if (i > 0 && s <= slots[i - 1]) return false;
  }
  let run = 0;
  for (let i = 0; i < slots.length; i++) {
    run = i > 0 && slots[i] === slots[i - 1] + PLANNER.slotMinutes ? run + 1 : 1;
    const endOfRun = i === slots.length - 1 || slots[i + 1] !== slots[i] + PLANNER.slotMinutes;
    if (endOfRun && run < PLANNER.minBlockSlots) return false;
  }
  return true;
}

// "HH:MM" a partir de minutos desde medianoche.
export function formatMin(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

// Minutos de inicio de todas las celdas del día (08:00 … 23:30).
export function allSlotStarts(): number[] {
  const out: number[] = [];
  for (let s = PLANNER.dayStartMin; s + PLANNER.slotMinutes <= PLANNER.dayEndMin; s += PLANNER.slotMinutes) out.push(s);
  return out;
}

// Bloques maximales [inicio, fin) de una lista ORDENADA de slots.
export function slotsToRanges(slots: number[]): { startMin: number; endMin: number }[] {
  const out: { startMin: number; endMin: number }[] = [];
  for (const s of slots) {
    const last = out[out.length - 1];
    if (last && last.endMin === s) last.endMin = s + PLANNER.slotMinutes;
    else out.push({ startMin: s, endMin: s + PLANNER.slotMinutes });
  }
  return out;
}
