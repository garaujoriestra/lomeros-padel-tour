import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { players, playerAchievements, type NewPlayer, type Player } from '@/lib/db/schema';

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

// Los jugadores del grupo cuyo id está en `ids` (para validar que un partido no
// referencia jugadores de otro grupo).
export async function getPlayersInGroup(groupId: string, ids: string[]): Promise<Player[]> {
  if (ids.length === 0) return [];
  return db.select().from(players).where(and(inArray(players.id, ids), eq(players.groupId, groupId)));
}

// Todos los jugadores del grupo, por nombre (para playerMaps y rosters de admin).
export async function listAllPlayersInGroup(groupId: string): Promise<Player[]> {
  return db.select().from(players).where(eq(players.groupId, groupId)).orderBy(players.name);
}

// Jugadores con partidos jugados, por Elo desc (rankings); limit opcional.
export async function listRankedPlayers(groupId: string, limit?: number): Promise<Player[]> {
  const base = db.select().from(players)
    .where(and(eq(players.groupId, groupId), sql`${players.matchesPlayed} > 0`))
    .orderBy(desc(players.eloRating));
  return limit ? base.limit(limit) : base;
}

// Jugadores sin partidos, por nombre.
export async function listUnrankedPlayers(groupId: string): Promise<Player[]> {
  return db.select().from(players)
    .where(and(eq(players.groupId, groupId), sql`${players.matchesPlayed} = 0`))
    .orderBy(players.name);
}

// Jugadores recién creados, por createdAt desc.
export async function listRecentPlayers(groupId: string, limit: number): Promise<Player[]> {
  return db.select().from(players).where(eq(players.groupId, groupId))
    .orderBy(desc(players.createdAt)).limit(limit);
}

// Jugadores por saldo de fichas desc, luego nombre (clasificación de La Timba).
export async function listPlayersByTokenBalance(groupId: string): Promise<Player[]> {
  return db.select().from(players).where(eq(players.groupId, groupId))
    .orderBy(desc(players.tokenBalance), players.name);
}

// Jugadores que juegan al pádel, por nombre (formulario de partido).
export async function listPadelPlayers(groupId: string): Promise<Player[]> {
  return db.select().from(players)
    .where(and(eq(players.groupId, groupId), eq(players.juegaPadel, true)))
    .orderBy(players.name);
}

// Nº de jugadores del grupo.
export async function countPlayersInGroup(groupId: string): Promise<number> {
  const [r] = await db.select({ count: sql<number>`count(*)` }).from(players)
    .where(eq(players.groupId, groupId));
  return Number(r.count);
}

// Nº de jugadores con partidos jugados.
export async function countRankedPlayers(groupId: string): Promise<number> {
  const [r] = await db.select({ count: sql<number>`count(*)` }).from(players)
    .where(and(eq(players.groupId, groupId), sql`${players.matchesPlayed} > 0`));
  return Number(r.count);
}

// Logros recientes de los jugadores del grupo (vía JOIN), por earnedAt desc.
export async function listRecentAchievementsInGroup(
  groupId: string,
  limit: number,
): Promise<{ playerId: string; achievementId: string; earnedAt: string }[]> {
  return db.select({
    playerId: playerAchievements.playerId,
    achievementId: playerAchievements.achievementId,
    earnedAt: playerAchievements.earnedAt,
  })
    .from(playerAchievements)
    .innerJoin(players, eq(players.id, playerAchievements.playerId))
    .where(eq(players.groupId, groupId))
    .orderBy(desc(playerAchievements.earnedAt))
    .limit(limit);
}
