// Fachada de eventos: despacha por `kind` (pozo|torneo). Las rutas/UI importan de aquí.
import { eq } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from '@/lib/db/schema';
import { tournamentMatches } from '@/lib/db/schema';
import { loadEvent } from './event-store';
import * as pozo from './pozo-engine';
import * as torneo from './torneo-run';
import type { PozoMatchRow } from './pozo-run';

type Db = LibSQLDatabase<typeof schema>;

export async function generateEvent(db: Db, id: string, seed: number): Promise<void> {
  const ev = await loadEvent(db, id);
  if (ev.kind === 'pozo') return pozo.generatePozo(db, id, seed);
  if (ev.kind === 'torneo') return torneo.generateTorneo(db, id, seed);
  throw new Error(`generateEvent: kind no soportado (${ev.kind})`);
}

export async function recordResult(db: Db, matchId: string, gamesA: number, gamesB: number): Promise<void> {
  const [m] = await db.select().from(tournamentMatches).where(eq(tournamentMatches.id, matchId));
  if (!m) throw new Error('NOT_FOUND');
  const ev = await loadEvent(db, m.tournamentId);
  if (ev.kind === 'torneo') return torneo.recordTorneoResult(db, matchId, gamesA, gamesB);
  return pozo.recordPozoResult(db, matchId, gamesA, gamesB);
}

export async function listEventMatches(db: Db, id: string): Promise<PozoMatchRow[]> {
  const ev = await loadEvent(db, id);
  if (ev.kind === 'torneo') return torneo.loadTorneoMatches(db, id);
  return pozo.listPozoMatches(db, id);
}
