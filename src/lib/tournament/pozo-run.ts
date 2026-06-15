import { and, eq, asc } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from '@/lib/db/schema';
import { tournaments, tournamentCourts, tournamentParticipants, tournamentMatches } from '@/lib/db/schema';
import { loadEvent } from './event-store';
import { shuffleDeterministic } from './seeding';
import { seedPozoCourts, courtPairing, type PozoRound } from './pozo';
import { hhmmToMin, minToHHMM } from './time';
import { estimatedMatchMinutes } from './scheduler';
import type { PozoConfig, SlotRef } from './types';

type Db = LibSQLDatabase<typeof schema>;

const PHASE = 'pozo';

function participantSlot(participantId: string): string {
  return JSON.stringify({ type: 'participant', participantId } as SlotRef);
}

// Escribe los partidos de una ronda dada a partir del estado (capas de pista).
// Rejilla: la pista de orden k aloja el partido de la pista k; hora = inicio_pista + ronda*slot.
async function writePozoRound(
  db: Db, tournamentId: string, round: number, state: PozoRound,
  courtsByOrder: { id: string; fromMin: number }[], slotMinutes: number,
): Promise<void> {
  for (let k = 0; k < state.courts.length; k++) {
    const players = state.courts[k];
    if (players.length < 4) continue; // pista incompleta: no se juega
    const { teamA, teamB } = courtPairing(players, round);
    const court = courtsByOrder[k];
    const startMin = court.fromMin + round * slotMinutes;
    await db.insert(tournamentMatches).values({
      id: crypto.randomUUID(), tournamentId, courtId: court.id, round, phaseTag: PHASE,
      scheduledStart: minToHHMM(startMin), scheduledEnd: minToHHMM(startMin + slotMinutes),
      status: 'pending',
      slotA1: participantSlot(teamA[0]), slotA2: participantSlot(teamA[1]),
      slotB1: participantSlot(teamB[0]), slotB2: participantSlot(teamB[1]),
    });
  }
}

// Genera la ronda 0 del pozo americano: baraja participantes (semilla), siembra pistas,
// escribe los partidos y marca el evento como 'scheduled'. Idempotente-NO (asume sin partidos).
export async function generatePozo(db: Db, tournamentId: string, seed: number): Promise<void> {
  const ev = await loadEvent(db, tournamentId);
  if (ev.kind !== 'pozo' || ev.format !== 'americano') throw new Error('generatePozo: solo pozo americano');
  const cfg = ev.config as PozoConfig;
  const courtsByOrder = ev.courts
    .slice().sort((a, b) => a.sortOrder - b.sortOrder)
    .map((c) => ({ id: c.id, fromMin: hhmmToMin(c.availableFrom) }));
  const slotMinutes = estimatedMatchMinutes(cfg.matchFormat);

  const shuffled = shuffleDeterministic(ev.participantPlayerIds, seed);
  const state0 = seedPozoCourts(shuffled, courtsByOrder.length);
  await writePozoRound(db, tournamentId, 0, state0, courtsByOrder, slotMinutes);

  await db.update(tournaments).set({ status: 'scheduled' }).where(eq(tournaments.id, tournamentId));
}

export interface PozoMatchRow {
  id: string; round: number; phaseTag: string | null; status: string;
  courtId: string | null; scheduledStart: string | null; scheduledEnd: string | null;
  slotA1: string | null; slotA2: string | null; slotB1: string | null; slotB2: string | null;
  teamAScore: number | null; teamBScore: number | null; winner: string | null;
}

export async function listPozoMatches(db: Db, tournamentId: string, round?: number): Promise<PozoMatchRow[]> {
  const rows = await db.select().from(tournamentMatches)
    .where(and(eq(tournamentMatches.tournamentId, tournamentId), eq(tournamentMatches.phaseTag, PHASE)))
    .orderBy(asc(tournamentMatches.round));
  const filtered = round === undefined ? rows : rows.filter((r) => r.round === round);
  return filtered.map((r) => ({
    id: r.id, round: r.round, phaseTag: r.phaseTag, status: r.status,
    courtId: r.courtId, scheduledStart: r.scheduledStart, scheduledEnd: r.scheduledEnd,
    slotA1: r.slotA1, slotA2: r.slotA2, slotB1: r.slotB1, slotB2: r.slotB2,
    teamAScore: r.teamAScore, teamBScore: r.teamBScore, winner: r.winner,
  }));
}
