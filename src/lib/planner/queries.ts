import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { plannerSlots, type PlannerSlotRow } from '@/lib/db/schema';

// Todas las filas de disponibilidad de una semana del grupo (v1.1: solo jugadores;
// filas legacy de pista se ignoran en week-data).
export async function getWeekSlots(groupId: string, weekStart: string): Promise<PlannerSlotRow[]> {
  return db.select().from(plannerSlots)
    .where(and(eq(plannerSlots.groupId, groupId), eq(plannerSlots.weekStart, weekStart)));
}

// Slots que un jugador tiene pintados en un día concreto. Se lee ANTES de
// escribir para saber si la escritura añade disponibilidad (y entonces avisar al
// grupo) o solo la recorta. Sin fila → día vacío.
export async function getPlayerDaySlots(
  groupId: string,
  weekStart: string,
  day: number,
  playerId: string,
): Promise<number[]> {
  const rows = await db.select({ slots: plannerSlots.slots }).from(plannerSlots).where(and(
    eq(plannerSlots.groupId, groupId),
    eq(plannerSlots.weekStart, weekStart),
    eq(plannerSlots.day, day),
    eq(plannerSlots.subjectType, 'player'),
    eq(plannerSlots.subjectId, playerId),
  ));
  if (rows.length === 0) return [];
  try {
    const val = JSON.parse(rows[0].slots);
    if (Array.isArray(val) && val.every((n) => Number.isInteger(n))) return val;
  } catch { /* JSON inválido: se trata como día vacío, igual que en week-data */ }
  return [];
}

// Upsert de los slots de UN día para un sujeto (subjectType 'court' es legado
// inerte; solo se escribe 'player'). slots=[] borra la fila.
export async function upsertDaySlots(
  groupId: string,
  weekStart: string,
  day: number,
  subjectType: 'player' | 'court',
  subjectId: string,
  slots: number[],
): Promise<void> {
  if (slots.length === 0) {
    await db.delete(plannerSlots).where(and(
      eq(plannerSlots.groupId, groupId),
      eq(plannerSlots.weekStart, weekStart),
      eq(plannerSlots.day, day),
      eq(plannerSlots.subjectType, subjectType),
      eq(plannerSlots.subjectId, subjectId),
    ));
    return;
  }
  await db.insert(plannerSlots)
    .values({ groupId, weekStart, day, subjectType, subjectId, slots: JSON.stringify(slots) })
    .onConflictDoUpdate({
      // El UNIQUE físico no incluye group_id a propósito: subject_id es un UUID
      // global (players.id / courts.id), así que ya identifica una única fila.
      target: [plannerSlots.weekStart, plannerSlots.day, plannerSlots.subjectType, plannerSlots.subjectId],
      set: { slots: JSON.stringify(slots) },
    });
}
