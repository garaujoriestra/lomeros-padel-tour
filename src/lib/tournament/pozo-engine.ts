// Fachada del pozo: despacha por `format` (americano | fixed_pairs). La API y la UI
// importan SIEMPRE desde aquí, sin conocer la variante.
import { eq } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from '@/lib/db/schema';
import { tournamentMatches } from '@/lib/db/schema';
import { loadEvent } from './event-store';
import * as americano from './pozo-run';
import * as pairs from './pozo-pairs-run';
import type { LadderStanding } from './ladder';

type Db = LibSQLDatabase<typeof schema>;

// Reexport del listado (agnóstico al formato).
export { listPozoMatches, type PozoMatchRow } from './pozo-run';

export async function generatePozo(db: Db, tournamentId: string, seed: number): Promise<void> {
  const ev = await loadEvent(db, tournamentId);
  if (ev.kind !== 'pozo') throw new Error('generatePozo: no es un pozo');
  if (ev.format === 'americano') return americano.generatePozo(db, tournamentId, seed);
  if (ev.format === 'fixed_pairs') return pairs.generatePozoPairs(db, tournamentId, seed);
  throw new Error(`generatePozo: formato no soportado (${ev.format})`);
}

export async function recordPozoResult(db: Db, matchId: string, gamesA: number, gamesB: number): Promise<void> {
  const [m] = await db.select().from(tournamentMatches).where(eq(tournamentMatches.id, matchId));
  if (!m) throw new Error('NOT_FOUND');
  const ev = await loadEvent(db, m.tournamentId);
  if (ev.kind !== 'pozo') throw new Error('NOT_POZO');
  if (ev.format === 'fixed_pairs') return pairs.recordPozoPairsResult(db, matchId, gamesA, gamesB);
  return americano.recordPozoResult(db, matchId, gamesA, gamesB);
}

export async function pozoStandingsLive(db: Db, tournamentId: string): Promise<LadderStanding[]> {
  const ev = await loadEvent(db, tournamentId);
  if (ev.format === 'fixed_pairs') return pairs.pozoPairsStandingsLive(db, tournamentId);
  return americano.pozoStandingsLive(db, tournamentId);
}
