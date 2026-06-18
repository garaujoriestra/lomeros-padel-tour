import { and, desc, eq } from 'drizzle-orm';
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
