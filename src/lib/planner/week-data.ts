import { listAllPlayersInGroup } from '@/lib/players/queries';
import { getWeekSlots, listCourtsInGroup } from './queries';
import { findDayCoincidences, type Coincidence } from './matcher';
import { weekDates } from './weeks';

export interface WeekView {
  weekStart: string;
  dates: string[]; // 7 fechas ISO, L→D
  // byDay: índice 0=lunes … 6=domingo → slots pintados ese día
  players: { id: string; name: string; byDay: number[][] }[];
  courts: { id: string; name: string; ownerId: string; ownerName: string; byDay: number[][] }[];
  coincidences: (Coincidence & { day: number })[];
}

const emptyWeek = () => Array.from({ length: 7 }, () => [] as number[]);

// Parse defensivo del JSON de slots: una fila corrupta (solo alcanzable por SQL
// directo, nunca por la API validada) se degrada a día vacío en vez de tumbar
// la vista de toda la semana. Precedente: tournament/pozo-view.ts.
function parseSlots(raw: string): number[] {
  try {
    const val = JSON.parse(raw);
    if (Array.isArray(val) && val.every((n) => Number.isInteger(n))) return val;
  } catch { /* JSON inválido */ }
  console.error('planner: fila de slots corrupta ignorada:', raw);
  return [];
}

// Vista completa de la semana de un grupo: disponibilidades, pistas y
// coincidencias calculadas en servidor. Única fuente para página y API.
export async function loadWeekView(groupId: string, weekStart: string): Promise<WeekView> {
  const [roster, courtRows, slotRows] = await Promise.all([
    listAllPlayersInGroup(groupId),
    listCourtsInGroup(groupId),
    getWeekSlots(groupId, weekStart),
  ]);
  const nameOf = new Map(roster.map((p) => [p.id, p.nickname ?? p.name]));

  const playerDays = new Map<string, number[][]>();
  const courtDays = new Map<string, number[][]>();
  for (const row of slotRows) {
    if (row.day < 0 || row.day > 6) continue; // fila corrupta: no rompe el contrato byDay[0..6]
    const map = row.subjectType === 'player' ? playerDays : courtDays;
    if (!map.has(row.subjectId)) map.set(row.subjectId, emptyWeek());
    map.get(row.subjectId)![row.day] = parseSlots(row.slots);
  }

  // Jugadores con alguna disponibilidad (ignora filas de jugadores borrados del grupo).
  const playersView = [...playerDays.entries()]
    .filter(([id]) => nameOf.has(id))
    .map(([id, byDay]) => ({ id, name: nameOf.get(id)!, byDay }));

  const courtsView = courtRows.map((c) => ({
    id: c.id,
    name: c.name,
    ownerId: c.ownerPlayerId,
    ownerName: c.ownerName,
    byDay: courtDays.get(c.id) ?? emptyWeek(),
  }));

  const coincidences = Array.from({ length: 7 }, (_, day) =>
    findDayCoincidences(
      playersView.map((p) => ({ id: p.id, name: p.name, slots: p.byDay[day] })),
      courtsView.map((c) => ({ id: c.id, name: c.name, ownerId: c.ownerId, slots: c.byDay[day] })),
    ).map((c) => ({ ...c, day })),
  ).flat();

  return { weekStart, dates: weekDates(weekStart), players: playersView, courts: courtsView, coincidences };
}
