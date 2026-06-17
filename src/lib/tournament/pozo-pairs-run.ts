import { eq, asc } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from '@/lib/db/schema';
import { tournaments, tournamentCourts, tournamentMatches } from '@/lib/db/schema';
import { loadEvent } from './event-store';
import { loadPairs } from './pair-store';
import { shuffleDeterministic } from './seeding';
import { seedPozoPairsCourts, nextPozoPairsRound, type PairsRound, type PairCourtResult } from './pozo-pairs';
import { hhmmToMin, minToHHMM } from './time';
import { estimatedMatchMinutes } from './scheduler';
import { ladderStandings, type LadderStanding } from './ladder';
import { listPozoMatches, type PozoMatchRow } from './pozo-run';
import type { PozoConfig, SlotRef } from './types';

type Db = LibSQLDatabase<typeof schema>;
const PHASE = 'pozo';

function pairSlot(pairId: string): string {
  return JSON.stringify({ type: 'pair', pairId } as SlotRef);
}
function parsePair(slot: string | null): string {
  return (JSON.parse(slot ?? '{}') as { pairId: string }).pairId;
}

// Escribe los partidos de una ronda: la pista k aloja [parejaTop vs parejaBottom].
async function writePozoPairsRound(
  db: Db, tournamentId: string, round: number, state: PairsRound,
  courtsByOrder: { id: string; fromMin: number }[], slotMinutes: number,
): Promise<void> {
  for (let k = 0; k < state.courts.length; k++) {
    const pair = state.courts[k];
    if (pair.length < 2) continue; // pista incompleta: no se juega
    const [topPair, bottomPair] = pair;
    const court = courtsByOrder[k];
    const startMin = court.fromMin + round * slotMinutes;
    await db.insert(tournamentMatches).values({
      // id determinista por (torneo, ronda, pista): re-generar la misma ronda no duplica.
      id: `${tournamentId}-${PHASE}-r${round}-${court.id}`,
      tournamentId, courtId: court.id, round, phaseTag: PHASE,
      scheduledStart: minToHHMM(startMin), scheduledEnd: minToHHMM(startMin + slotMinutes),
      status: 'pending',
      slotA1: pairSlot(topPair), slotA2: null,
      slotB1: pairSlot(bottomPair), slotB2: null,
    }).onConflictDoNothing();
  }
}

export async function generatePozoPairs(db: Db, tournamentId: string, seed: number): Promise<void> {
  const ev = await loadEvent(db, tournamentId);
  if (ev.kind !== 'pozo' || ev.format !== 'fixed_pairs') throw new Error('generatePozoPairs: solo pozo parejas fijas');
  const cfg = ev.config as PozoConfig;
  const pairs = await loadPairs(db, tournamentId);
  if (pairs.length === 0) throw new Error('NO_PAIRS');

  const courtsByOrder = ev.courts.slice().sort((a, b) => a.sortOrder - b.sortOrder)
    .map((c) => ({ id: c.id, fromMin: hhmmToMin(c.availableFrom) }));
  const slotMinutes = estimatedMatchMinutes(cfg.matchFormat);

  const pairIds = shuffleDeterministic(pairs.map((p) => p.id), seed);
  const state0 = seedPozoPairsCourts(pairIds, courtsByOrder.length);

  // El descanso solo rota por la pista del fondo (≤ 2 parejas). Si sobran más, el avance de
  // ronda sería imposible: lo rechazamos AHORA en vez de fallar a mitad de torneo.
  if (state0.resting.length > 2) {
    throw new Error('UNBALANCED_PAIRS');
  }

  await writePozoPairsRound(db, tournamentId, 0, state0, courtsByOrder, slotMinutes);

  await db.update(tournaments).set({ status: 'scheduled' }).where(eq(tournaments.id, tournamentId));
}

// Reconstruye el estado (capas de parejas por pista) en la ronda `uptoRound` replayando desde la 0.
async function replayPozoPairsState(db: Db, tournamentId: string, uptoRound: number): Promise<PairsRound> {
  const all = await listPozoMatches(db, tournamentId);
  const byRound = new Map<number, PozoMatchRow[]>();
  for (const m of all) { const a = byRound.get(m.round) ?? []; a.push(m); byRound.set(m.round, a); }

  const courtsByOrder = (await db.select().from(tournamentCourts)
    .where(eq(tournamentCourts.tournamentId, tournamentId))
    .orderBy(asc(tournamentCourts.order))).map((c) => c.id);
  const sortByCourt = (ms: PozoMatchRow[]) => ms.slice()
    .sort((a, b) => courtsByOrder.indexOf(a.courtId!) - courtsByOrder.indexOf(b.courtId!));

  const round0 = sortByCourt(byRound.get(0) ?? []);
  const courts0 = round0.map((m) => [parsePair(m.slotA1), parsePair(m.slotB1)]);
  const inCourts = new Set(courts0.flat());
  const allPairs = (await loadPairs(db, tournamentId)).map((p) => p.id);
  const resting0 = allPairs.filter((p) => !inCourts.has(p));
  let state: PairsRound = { courts: courts0, resting: resting0 };

  for (let r = 0; r < uptoRound; r++) {
    const matches = sortByCourt(byRound.get(r) ?? []);
    const results: PairCourtResult[] = matches.map((m) => {
      const top = parsePair(m.slotA1); const bottom = parsePair(m.slotB1);
      if (m.winner !== 'A' && m.winner !== 'B') {
        throw new Error(`pozo-pairs-run: el partido ${m.id} de la ronda ${r} no tiene ganador; no se puede avanzar`);
      }
      return m.winner === 'A' ? { winner: top, loser: bottom } : { winner: bottom, loser: top };
    });
    state = nextPozoPairsRound(state, results);
  }
  return state;
}

export async function recordPozoPairsResult(db: Db, matchId: string, gamesA: number, gamesB: number): Promise<void> {
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

  const nextState = await replayPozoPairsState(db, match.tournamentId, round + 1);
  const courtsByOrder = ev.courts.slice().sort((a, b) => a.sortOrder - b.sortOrder)
    .map((c) => ({ id: c.id, fromMin: hhmmToMin(c.availableFrom) }));
  const slotMinutes = estimatedMatchMinutes(cfg.matchFormat);
  await writePozoPairsRound(db, match.tournamentId, round + 1, nextState, courtsByOrder, slotMinutes);
}

export async function pozoPairsStandingsLive(db: Db, tournamentId: string): Promise<LadderStanding[]> {
  const all = await listPozoMatches(db, tournamentId);
  if (all.length === 0) return [];
  const latestRound = Math.max(...all.map((m) => m.round));
  const state = await replayPozoPairsState(db, tournamentId, latestRound);

  // Juegos acumulados por pareja (de todos los partidos completados).
  const games = new Map<string, number>();
  for (const m of all) {
    if (m.status !== 'completed') continue;
    const top = parsePair(m.slotA1); const bottom = parsePair(m.slotB1);
    games.set(top, (games.get(top) ?? 0) + (m.teamAScore ?? 0));
    games.set(bottom, (games.get(bottom) ?? 0) + (m.teamBScore ?? 0));
  }
  return ladderStandings(state.courts, games, state.resting);
}
