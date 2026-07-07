import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { plannerSlots, type PlannerSlotRow } from '@/lib/db/schema';

// Todas las filas de disponibilidad de una semana del grupo (v1.1: solo jugadores;
// filas legacy de pista se ignoran en week-data).
export async function getWeekSlots(groupId: string, weekStart: string): Promise<PlannerSlotRow[]> {
  return db.select().from(plannerSlots)
    .where(and(eq(plannerSlots.groupId, groupId), eq(plannerSlots.weekStart, weekStart)));
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
