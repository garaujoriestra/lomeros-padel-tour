import { eq } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from '@/lib/db/schema';
import { tournamentPairs } from '@/lib/db/schema';

type Db = LibSQLDatabase<typeof schema>;

export interface LoadedPair {
  id: string;
  player1Id: string;
  player2Id: string;
  label: string | null;
  groupId: string | null;
}

export async function loadPairs(db: Db, tournamentId: string): Promise<LoadedPair[]> {
  const rows = await db.select().from(tournamentPairs).where(eq(tournamentPairs.tournamentId, tournamentId));
  return rows.map((r) => ({ id: r.id, player1Id: r.player1Id, player2Id: r.player2Id, label: r.label ?? null, groupId: r.groupId ?? null }));
}

// Reemplaza el set completo de parejas del evento (FK OFF en Turso/harness → borrado explícito).
export async function replacePairs(db: Db, tournamentId: string, pairs: [string, string][]): Promise<void> {
  await db.delete(tournamentPairs).where(eq(tournamentPairs.tournamentId, tournamentId));
  for (const [player1Id, player2Id] of pairs) {
    await db.insert(tournamentPairs).values({ id: crypto.randomUUID(), tournamentId, player1Id, player2Id });
  }
}
