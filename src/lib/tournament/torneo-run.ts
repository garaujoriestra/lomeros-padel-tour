import { eq, asc } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from '@/lib/db/schema';
import { tournaments, tournamentMatches } from '@/lib/db/schema';
import { loadEvent } from './event-store';
import { loadPairs, type LoadedPair } from './pair-store';
import { shuffleDeterministic } from './seeding';
import { generateBracket, type BracketMatch } from './fixed-pairs';
import { estimatedMatchMinutes, type CourtWindow } from './scheduler';
import { hhmmToMin, minToHHMM } from './time';
import type { PozoMatchRow } from './pozo-run';
import type { TorneoConfig, SlotRef } from './types';

type Db = LibSQLDatabase<typeof schema>;

function slotJson(slot: SlotRef): string { return JSON.stringify(slot); }
function parseSlotRef(s: string | null): SlotRef | null {
  if (!s) return null;
  try { return JSON.parse(s) as SlotRef; } catch { return null; }
}

export async function loadTorneoMatches(db: Db, tournamentId: string): Promise<PozoMatchRow[]> {
  const rows = await db.select().from(tournamentMatches)
    .where(eq(tournamentMatches.tournamentId, tournamentId)).orderBy(asc(tournamentMatches.round));
  return rows.map((r) => ({
    id: r.id, round: r.round, phaseTag: r.phaseTag, status: r.status,
    courtId: r.courtId, scheduledStart: r.scheduledStart, scheduledEnd: r.scheduledEnd,
    slotA1: r.slotA1, slotA2: r.slotA2, slotB1: r.slotB1, slotB2: r.slotB2,
    teamAScore: r.teamAScore, teamBScore: r.teamBScore, winner: r.winner,
  }));
}

function courtWindowsOf(ev: Awaited<ReturnType<typeof loadEvent>>): CourtWindow[] {
  return ev.courts.slice().sort((a, b) => a.sortOrder - b.sortOrder)
    .map((c) => ({ courtId: c.id, order: c.sortOrder, fromMin: hhmmToMin(c.availableFrom), toMin: hhmmToMin(c.availableTo) }));
}

// Reparte el cuadro por OLAS: la ronda r empieza en baseStart + r*slot; pistas round-robin.
function scheduleBracketByWave(
  bracket: BracketMatch[], courts: CourtWindow[], slotMinutes: number, baseStartMin: number,
): Map<string, { courtId: string; startMin: number; endMin: number }> {
  const out = new Map<string, { courtId: string; startMin: number; endMin: number }>();
  if (courts.length === 0) return out;
  const byRound = new Map<number, BracketMatch[]>();
  for (const m of bracket) { const a = byRound.get(m.round) ?? []; a.push(m); byRound.set(m.round, a); }
  for (const r of [...byRound.keys()].sort((a, b) => a - b)) {
    const start = baseStartMin + r * slotMinutes;
    const end = start + slotMinutes;
    byRound.get(r)!.forEach((m, i) => {
      const court = courts[i % courts.length];
      if (end <= court.toMin) out.set(m.matchId, { courtId: court.courtId, startMin: start, endMin: end });
    });
  }
  return out;
}

async function writeBracket(
  db: Db, tournamentId: string, bracket: BracketMatch[],
  courts: CourtWindow[], slotMinutes: number, baseStartMin: number,
): Promise<void> {
  const sched = scheduleBracketByWave(bracket, courts, slotMinutes, baseStartMin);
  for (const m of bracket) {
    const s = sched.get(m.matchId);
    await db.insert(tournamentMatches).values({
      id: crypto.randomUUID(), tournamentId, phaseTag: `ko:${m.matchId}`, round: m.round,
      courtId: s?.courtId ?? null,
      scheduledStart: s ? minToHHMM(s.startMin) : null, scheduledEnd: s ? minToHHMM(s.endMin) : null,
      status: 'pending', slotA1: slotJson(m.slotA), slotA2: null, slotB1: slotJson(m.slotB), slotB2: null,
    });
  }
  await autoCompleteByes(db, tournamentId);
}

async function autoCompleteByes(db: Db, tournamentId: string): Promise<void> {
  const rows = await loadTorneoMatches(db, tournamentId);
  for (const m of rows) {
    if (!m.phaseTag?.startsWith('ko:') || m.status === 'completed') continue;
    const a = parseSlotRef(m.slotA1); const b = parseSlotRef(m.slotB1);
    if (a?.type === 'pair' && b?.type === 'bye') {
      await db.update(tournamentMatches).set({ winner: 'A', status: 'completed' }).where(eq(tournamentMatches.id, m.id));
    } else if (b?.type === 'pair' && a?.type === 'bye') {
      await db.update(tournamentMatches).set({ winner: 'B', status: 'completed' }).where(eq(tournamentMatches.id, m.id));
    }
  }
}

export async function generateTorneo(db: Db, tournamentId: string, seed: number): Promise<void> {
  const ev = await loadEvent(db, tournamentId);
  if (ev.kind !== 'torneo') throw new Error('generateTorneo: solo torneo');
  const cfg = ev.config as TorneoConfig;
  const pairs = await loadPairs(db, tournamentId);
  if (pairs.length < 2) throw new Error('TOO_FEW_PAIRS');

  const courts = courtWindowsOf(ev);
  const slotMinutes = estimatedMatchMinutes(cfg.matchFormat);
  const baseStart = courts.length ? Math.min(...courts.map((c) => c.fromMin)) : 0;

  if (ev.format === 'single_elim') {
    const seeded = shuffleDeterministic(pairs.map((p) => p.id), seed);
    const bracket = generateBracket(seeded);
    await writeBracket(db, tournamentId, bracket, courts, slotMinutes, baseStart);
  } else if (ev.format === 'groups_elim') {
    await generateGroups(db, tournamentId, ev, cfg, pairs, seed);
  } else {
    throw new Error(`generateTorneo: formato no soportado (${ev.format})`);
  }

  await db.update(tournaments).set({ status: 'scheduled' }).where(eq(tournaments.id, tournamentId));
}

// Stub: se implementa en la Task 2 del plan. Lanza para que el módulo compile sin referenciar
// símbolos inexistentes; los tests de single_elim no llegan aquí.
async function generateGroups(
  _db: Db, _tournamentId: string, _ev: Awaited<ReturnType<typeof loadEvent>>, _cfg: TorneoConfig,
  _pairs: LoadedPair[], _seed: number,
): Promise<void> {
  throw new Error('groups_elim: pendiente (Task 2)');
}

export async function recordTorneoResult(db: Db, matchId: string, gamesA: number, gamesB: number): Promise<void> {
  const [match] = await db.select().from(tournamentMatches).where(eq(tournamentMatches.id, matchId));
  if (!match) throw new Error('NOT_FOUND');
  const winner = gamesA >= gamesB ? 'A' : 'B';
  await db.update(tournamentMatches).set({
    teamAScore: gamesA, teamBScore: gamesB, winner, status: 'completed',
  }).where(eq(tournamentMatches.id, matchId));

  if (match.phaseTag?.startsWith('group:')) {
    await maybeGenerateBracketFromGroups(db, match.tournamentId);
  }
}

// Stub: se implementa en la Task 2 del plan.
async function maybeGenerateBracketFromGroups(_db: Db, _tournamentId: string): Promise<void> {
  // no-op hasta Task 2
}
