import { and, eq, asc } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from '@/lib/db/schema';
import { tournaments, tournamentCourts, tournamentParticipants, tournamentMatches } from '@/lib/db/schema';
import { loadEvent } from './event-store';
import { shuffleDeterministic } from './seeding';
import { seedPozoCourts, courtPairing, nextPozoRoundWithRest, type PozoRound, type CourtResult } from './pozo';
import { hhmmToMin, minToHHMM } from './time';
import { estimatedMatchMinutes } from './scheduler';
import { ladderStandings, type LadderStanding } from './ladder';
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
      // id determinista por (torneo, ronda, pista): re-generar la misma ronda no duplica.
      id: `${tournamentId}-${PHASE}-r${round}-${court.id}`,
      tournamentId, courtId: court.id, round, phaseTag: PHASE,
      scheduledStart: minToHHMM(startMin), scheduledEnd: minToHHMM(startMin + slotMinutes),
      status: 'pending',
      slotA1: participantSlot(teamA[0]), slotA2: participantSlot(teamA[1]),
      slotB1: participantSlot(teamB[0]), slotB2: participantSlot(teamB[1]),
    }).onConflictDoNothing();
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

function parseParticipant(slot: string | null): string {
  const s = JSON.parse(slot ?? '{}');
  return s.participantId as string;
}

// Reconstruye el estado del pozo en una ronda dada replayando desde la ronda 0.
async function replayPozoState(db: Db, tournamentId: string, uptoRound: number): Promise<PozoRound> {
  const all = await listPozoMatches(db, tournamentId);
  const byRound = new Map<number, PozoMatchRow[]>();
  for (const m of all) { const a = byRound.get(m.round) ?? []; a.push(m); byRound.set(m.round, a); }

  // Estado de la ronda 0 a partir de sus partidos (ordenados por court → orden de pista).
  const courtsByOrder = (await db.select().from(tournamentCourts)
    .where(eq(tournamentCourts.tournamentId, tournamentId))
    .orderBy(asc(tournamentCourts.order))).map((c) => c.id);
  const round0 = (byRound.get(0) ?? []).slice()
    .sort((a, b) => courtsByOrder.indexOf(a.courtId!) - courtsByOrder.indexOf(b.courtId!));
  const courts0 = round0.map((m) => [
    parseParticipant(m.slotA1), parseParticipant(m.slotA2),
    parseParticipant(m.slotB1), parseParticipant(m.slotB2),
  ]);
  // Descansan: participantes que no están en ninguna pista de la ronda 0.
  const inCourts = new Set(courts0.flat());
  // Los que descansan en la ronda 0 no tienen partido, así que se deducen (participantes
  // no asignados a pista). El orden entre ellos es estable (orden de inserción) y, como las
  // parejas que descansan son intercambiables, no afecta a la corrección del avance.
  const allParts = (await db.select().from(tournamentParticipants)
    .where(eq(tournamentParticipants.tournamentId, tournamentId))).map((p) => p.playerId);
  const resting0 = allParts.filter((p) => !inCourts.has(p));
  let state: PozoRound = { courts: courts0, resting: resting0 };

  for (let r = 0; r < uptoRound; r++) {
    const matches = (byRound.get(r) ?? []).slice()
      .sort((a, b) => courtsByOrder.indexOf(a.courtId!) - courtsByOrder.indexOf(b.courtId!));
    const results: CourtResult[] = matches.map((m) => {
      const teamA: [string, string] = [parseParticipant(m.slotA1), parseParticipant(m.slotA2)];
      const teamB: [string, string] = [parseParticipant(m.slotB1), parseParticipant(m.slotB2)];
      if (m.winner !== 'A' && m.winner !== 'B') {
        throw new Error(`pozo-run: el partido ${m.id} de la ronda ${r} no tiene ganador; no se puede avanzar`);
      }
      return m.winner === 'A' ? { winners: teamA, losers: teamB } : { winners: teamB, losers: teamA };
    });
    state = nextPozoRoundWithRest(state, results);
  }
  return state;
}

// Registra el marcador de un partido del pozo; si la ronda queda completa y hay más rondas, genera la siguiente.
export async function recordPozoResult(db: Db, matchId: string, gamesA: number, gamesB: number): Promise<void> {
  const [match] = await db.select().from(tournamentMatches).where(eq(tournamentMatches.id, matchId));
  if (!match) throw new Error('NOT_FOUND');
  const winner = gamesA >= gamesB ? 'A' : 'B';
  await db.update(tournamentMatches).set({
    teamAScore: gamesA, teamBScore: gamesB, winner, status: 'completed',
  }).where(eq(tournamentMatches.id, matchId));

  const round = match.round;
  const roundMatches = await listPozoMatches(db, match.tournamentId, round);
  if (!roundMatches.every((m) => m.status === 'completed')) return; // ronda incompleta

  const ev = await loadEvent(db, match.tournamentId);
  const cfg = ev.config as PozoConfig;
  if (round + 1 >= cfg.rounds) return; // no hay más rondas
  if ((await listPozoMatches(db, match.tournamentId, round + 1)).length > 0) return; // ya generada

  const nextState = await replayPozoState(db, match.tournamentId, round + 1);
  const courtsByOrder = ev.courts.slice().sort((a, b) => a.sortOrder - b.sortOrder)
    .map((c) => ({ id: c.id, fromMin: hhmmToMin(c.availableFrom) }));
  const slotMinutes = estimatedMatchMinutes(cfg.matchFormat);
  await writePozoRound(db, match.tournamentId, round + 1, nextState, courtsByOrder, slotMinutes);
}

// Clasificación en vivo del pozo: usa la ÚLTIMA ronda existente como escalera actual,
// y acumula los juegos de TODOS los partidos completados.
export async function pozoStandingsLive(db: Db, tournamentId: string): Promise<LadderStanding[]> {
  const all = await listPozoMatches(db, tournamentId);
  if (all.length === 0) return [];
  const latestRound = Math.max(...all.map((m) => m.round));
  const state = await replayPozoState(db, tournamentId, latestRound);

  // Juegos acumulados por participante (de todos los partidos completados).
  const games = new Map<string, number>();
  for (const m of all) {
    if (m.status !== 'completed') continue;
    const a = [parseParticipant(m.slotA1), parseParticipant(m.slotA2)];
    const b = [parseParticipant(m.slotB1), parseParticipant(m.slotB2)];
    for (const p of a) games.set(p, (games.get(p) ?? 0) + (m.teamAScore ?? 0));
    for (const p of b) games.set(p, (games.get(p) ?? 0) + (m.teamBScore ?? 0));
  }
  return ladderStandings(state.courts, games, state.resting);
}
