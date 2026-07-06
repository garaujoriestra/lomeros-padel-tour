import { PLANNER } from './config';

export interface SubjectDaySlots {
  id: string;
  name: string;
  slots: number[];
}
export interface CourtDaySlots extends SubjectDaySlots {
  ownerId: string;
}

export interface Coincidence {
  startMin: number;
  endMin: number;
  courtNames: string[];  // pistas efectivas en algún punto del tramo
  playerNames: string[]; // unión de jugadores disponibles en el tramo
}

// Coincidencias de UN día: ventanas de matchSlots slots consecutivos con
// ≥ minPlayers jugadores disponibles TODA la ventana y ≥1 pista efectiva
// (pista ∩ su dueño: el dueño tiene que poder jugar para que su pista cuente;
// él es uno de los minPlayers). Ventanas activas contiguas se fusionan en
// tramos maximales; huecos inactivos separan tramos aunque se solapen horas.
export function findDayCoincidences(
  players: SubjectDaySlots[],
  courts: CourtDaySlots[],
): Coincidence[] {
  const playerSets = players.map((p) => ({ ...p, set: new Set(p.slots) }));
  const courtSets = courts.map((c) => {
    const owner = playerSets.find((p) => p.id === c.ownerId);
    return { ...c, set: new Set(owner ? c.slots.filter((s) => owner.set.has(s)) : []) };
  });

  const windowMin = PLANNER.matchSlots * PLANNER.slotMinutes;
  const out: Coincidence[] = [];
  let lastActiveStart = -1;

  for (let w = PLANNER.dayStartMin; w + windowMin <= PLANNER.dayEndMin; w += PLANNER.slotMinutes) {
    const windowSlots = Array.from({ length: PLANNER.matchSlots }, (_, i) => w + i * PLANNER.slotMinutes);
    const avail = playerSets.filter((p) => windowSlots.every((s) => p.set.has(s)));
    const okCourts = courtSets.filter((c) => windowSlots.every((s) => c.set.has(s)));
    if (avail.length < PLANNER.minPlayers || okCourts.length === 0) continue;

    const last = out[out.length - 1];
    if (last && w === lastActiveStart + PLANNER.slotMinutes) {
      last.endMin = w + windowMin;
      last.courtNames = union(last.courtNames, okCourts.map((c) => c.name));
      last.playerNames = union(last.playerNames, avail.map((p) => p.name));
    } else {
      out.push({
        startMin: w,
        endMin: w + windowMin,
        courtNames: okCourts.map((c) => c.name),
        playerNames: avail.map((p) => p.name),
      });
    }
    lastActiveStart = w;
  }
  return out;
}

function union(a: string[], b: string[]): string[] {
  return [...new Set([...a, ...b])];
}
