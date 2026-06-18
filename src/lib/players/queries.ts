import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { players, type NewPlayer, type Player } from '@/lib/db/schema';

// Jugadores del grupo, ordenados por ELO descendente.
export async function listPlayersByElo(groupId: string): Promise<Player[]> {
  return db.select().from(players).where(eq(players.groupId, groupId)).orderBy(desc(players.eloRating));
}

// Un jugador del grupo (undefined si no existe o es de otro grupo).
export async function getPlayerInGroup(groupId: string, id: string): Promise<Player | undefined> {
  const [p] = await db
    .select()
    .from(players)
    .where(and(eq(players.id, id), eq(players.groupId, groupId)));
  return p;
}

// Crea un jugador en el grupo (fija groupId del contexto, no del caller).
export async function createPlayerInGroup(
  groupId: string,
  values: Omit<NewPlayer, 'id' | 'groupId'>,
): Promise<Player> {
  const [p] = await db.insert(players).values({ ...values, groupId }).returning();
  return p;
}

// Actualiza un jugador del grupo. undefined si no existe en el grupo (id de otro grupo no se toca).
export async function updatePlayerInGroup(
  groupId: string,
  id: string,
  values: Partial<Omit<NewPlayer, 'id' | 'groupId'>>,
): Promise<Player | undefined> {
  const [p] = await db
    .update(players)
    .set(values)
    .where(and(eq(players.id, id), eq(players.groupId, groupId)))
    .returning();
  return p;
}

// Borra un jugador del grupo (un id de otro grupo no borra nada).
export async function deletePlayerInGroup(groupId: string, id: string): Promise<void> {
  await db.delete(players).where(and(eq(players.id, id), eq(players.groupId, groupId)));
}
