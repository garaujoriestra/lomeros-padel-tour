import { listAllPlayersInGroup } from '@/lib/players/queries';
import { getWeekSlots } from './queries';
import { weekDates } from './weeks';

export interface WeekView {
  weekStart: string;
  dates: string[]; // 7 fechas ISO, L→D
  // byDay: índice 0=lunes … 6=domingo → slots pintados ese día
  players: { id: string; name: string; byDay: number[][] }[];
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

// Vista completa de la semana de un grupo: la disponibilidad pintada por cada
// jugador. Única fuente para página y API. (v1.1: sin pistas ni coincidencias —
// el partido se cuadra por fuera; las filas legacy de pista se ignoran.)
export async function loadWeekView(groupId: string, weekStart: string): Promise<WeekView> {
  const [roster, slotRows] = await Promise.all([
    listAllPlayersInGroup(groupId),
    getWeekSlots(groupId, weekStart),
  ]);
  const nameOf = new Map(roster.map((p) => [p.id, p.nickname ?? p.name]));

  const playerDays = new Map<string, number[][]>();
  for (const row of slotRows) {
    if (row.subjectType !== 'player') continue; // filas legacy de pista: ignoradas
    if (row.day < 0 || row.day > 6) continue; // fila corrupta: no rompe el contrato byDay[0..6]
    if (!playerDays.has(row.subjectId)) playerDays.set(row.subjectId, emptyWeek());
    playerDays.get(row.subjectId)![row.day] = parseSlots(row.slots);
  }

  // Jugadores con alguna disponibilidad (ignora filas de jugadores borrados del grupo).
  // Orden determinista (por nombre visible): el orden de filas de SQLite no es
  // un contrato, y la lista «quién puede» y sus tests lo necesitan estable.
  const players = [...playerDays.entries()]
    .filter(([id]) => nameOf.has(id))
    .map(([id, byDay]) => ({ id, name: nameOf.get(id)!, byDay }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));

  return { weekStart, dates: weekDates(weekStart), players };
}
