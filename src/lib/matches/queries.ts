import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { matches, matchSets, type Match, type MatchSet, type NewMatch } from '@/lib/db/schema';

export async function listMatchesByDate(groupId: string): Promise<Match[]> {
  return db.select().from(matches).where(eq(matches.groupId, groupId)).orderBy(desc(matches.date));
}

export async function getMatchInGroup(groupId: string, id: string): Promise<Match | undefined> {
  const [m] = await db.select().from(matches).where(and(eq(matches.id, id), eq(matches.groupId, groupId)));
  return m;
}

// matchSets no tiene group_id: se lee por matchId, con el padre ya verificado en-grupo por el caller.
export async function getMatchSetsForMatch(matchId: string): Promise<MatchSet[]> {
  return db.select().from(matchSets).where(eq(matchSets.matchId, matchId)).orderBy(matchSets.setNumber);
}

export async function createMatchInGroup(
  groupId: string,
  values: Omit<NewMatch, 'id' | 'groupId'>,
): Promise<Match> {
  const [m] = await db.insert(matches).values({ ...values, groupId }).returning();
  return m;
}

export async function updateMatchInGroup(
  groupId: string,
  id: string,
  fields: Partial<Omit<NewMatch, 'id' | 'groupId'>>,
): Promise<Match | undefined> {
  const [m] = await db
    .update(matches)
    .set(fields)
    .where(and(eq(matches.id, id), eq(matches.groupId, groupId)))
    .returning();
  return m;
}

export async function deleteMatchInGroup(groupId: string, id: string): Promise<void> {
  await db.delete(matches).where(and(eq(matches.id, id), eq(matches.groupId, groupId)));
}

// matchSets hereda el grupo del partido padre (matchId ya es de un partido del grupo).
export async function insertMatchSets(
  matchId: string,
  sets: { setNumber: number; team1Games: number; team2Games: number }[],
): Promise<void> {
  for (const set of sets) {
    await db.insert(matchSets).values({
      matchId,
      setNumber: set.setNumber,
      team1Games: set.team1Games,
      team2Games: set.team2Games,
    });
  }
}

// Partidos recientes del grupo, por fecha desc (feed de la home).
export async function listRecentMatches(groupId: string, limit: number): Promise<Match[]> {
  return db.select().from(matches).where(eq(matches.groupId, groupId))
    .orderBy(desc(matches.date)).limit(limit);
}

// Partidos programados del grupo, por fecha (home "próximos" + cron); limit opcional.
export async function listScheduledMatches(groupId: string, limit?: number): Promise<Match[]> {
  const base = db.select().from(matches)
    .where(and(eq(matches.groupId, groupId), eq(matches.status, 'scheduled')))
    .orderBy(matches.date);
  return limit ? base.limit(limit) : base;
}

// Nº de partidos del grupo.
export async function countMatchesInGroup(groupId: string): Promise<number> {
  const [r] = await db.select({ count: sql<number>`count(*)` }).from(matches)
    .where(eq(matches.groupId, groupId));
  return Number(r.count);
}

// Todos los sets de los partidos del grupo (vía JOIN al partido), para listados.
export async function listMatchSetsInGroup(groupId: string): Promise<MatchSet[]> {
  return db.select({
    id: matchSets.id, matchId: matchSets.matchId, setNumber: matchSets.setNumber,
    team1Games: matchSets.team1Games, team2Games: matchSets.team2Games,
  })
    .from(matchSets)
    .innerJoin(matches, eq(matches.id, matchSets.matchId))
    .where(eq(matches.groupId, groupId));
}

// Sets de un conjunto de partidos (el caller ya scopeó los ids in-grupo).
export async function listMatchSetsForMatches(matchIds: string[]): Promise<MatchSet[]> {
  if (matchIds.length === 0) return [];
  return db.select().from(matchSets).where(inArray(matchSets.matchId, matchIds));
}

// Partidos del grupo que involucran a alguno de los jugadores dados (preview de parejas).
export async function listMatchesInvolvingPlayers(groupId: string, ids: string[]): Promise<Match[]> {
  if (ids.length === 0) return [];
  return db.select().from(matches).where(and(
    eq(matches.groupId, groupId),
    or(
      inArray(matches.team1Player1Id, ids),
      inArray(matches.team1Player2Id, ids),
      inArray(matches.team2Player1Id, ids),
      inArray(matches.team2Player2Id, ids),
    ),
  ));
}
