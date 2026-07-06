import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { courts, plannerSlots, players, type Court, type PlannerSlotRow } from '@/lib/db/schema';

// Pista del jugador en el grupo (cada jugador tiene como mucho una).
export async function getCourtByOwner(groupId: string, ownerPlayerId: string): Promise<Court | undefined> {
  const [c] = await db.select().from(courts)
    .where(and(eq(courts.groupId, groupId), eq(courts.ownerPlayerId, ownerPlayerId)));
  return c;
}

// Declara la pista del jugador (una por jugador; UNIQUE en owner_player_id).
export async function createCourt(groupId: string, ownerPlayerId: string, name: string): Promise<Court> {
  const [c] = await db.insert(courts).values({ groupId, ownerPlayerId, name }).returning();
  return c;
}

// Renombra la pista del jugador. undefined si no tiene pista en el grupo.
export async function renameCourt(groupId: string, ownerPlayerId: string, name: string): Promise<Court | undefined> {
  const [c] = await db.update(courts).set({ name })
    .where(and(eq(courts.groupId, groupId), eq(courts.ownerPlayerId, ownerPlayerId)))
    .returning();
  return c;
}

// Pistas del grupo con el nombre visible de su dueño.
export async function listCourtsInGroup(
  groupId: string,
): Promise<(Court & { ownerName: string })[]> {
  const rows = await db
    .select({ court: courts, ownerName: players.name, ownerNickname: players.nickname })
    .from(courts)
    .innerJoin(players, eq(courts.ownerPlayerId, players.id))
    .where(eq(courts.groupId, groupId));
  return rows.map((r) => ({ ...r.court, ownerName: r.ownerNickname ?? r.ownerName }));
}

// Todas las filas de disponibilidad (jugadores y pistas) de una semana del grupo.
export async function getWeekSlots(groupId: string, weekStart: string): Promise<PlannerSlotRow[]> {
  return db.select().from(plannerSlots)
    .where(and(eq(plannerSlots.groupId, groupId), eq(plannerSlots.weekStart, weekStart)));
}

// Upsert de los slots de UN día para un sujeto (jugador o pista). slots=[] borra la fila.
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
