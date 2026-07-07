import { PLANNER } from './config';

export interface DayAvailability {
  id: string;
  name: string;
  slots: number[];
}
export interface DaySegment {
  startMin: number;
  endMin: number;
  names: string[];
}

// Tramos de UN día donde hay alguien disponible. El tramo se parte donde cambia
// la composición: cada segmento lleva los nombres exactos que pueden en él.
// Sin umbrales (v1.1): esto solo enseña dónde hay interés; el partido se cuadra fuera.
export function summarizeDay(players: DayAvailability[]): DaySegment[] {
  const sets = players.map((p) => ({ name: p.name, set: new Set(p.slots) }));
  const out: DaySegment[] = [];
  for (let s = PLANNER.dayStartMin; s < PLANNER.dayEndMin; s += PLANNER.slotMinutes) {
    const names = sets.filter((p) => p.set.has(s)).map((p) => p.name);
    if (names.length === 0) continue;
    const last = out[out.length - 1];
    if (last && last.endMin === s && sameNames(last.names, names)) {
      last.endMin = s + PLANNER.slotMinutes;
    } else {
      out.push({ startMin: s, endMin: s + PLANNER.slotMinutes, names });
    }
  }
  return out;
}

function sameNames(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((n, i) => n === b[i]);
}
