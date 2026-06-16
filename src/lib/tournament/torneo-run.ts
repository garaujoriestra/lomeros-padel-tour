import { eq, asc } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from '@/lib/db/schema';
import { tournaments, tournamentMatches, tournamentGroups, tournamentPairs } from '@/lib/db/schema';
import { loadEvent } from './event-store';
import { loadPairs, type LoadedPair } from './pair-store';
import { shuffleDeterministic } from './seeding';
import { generateBracket, buildBracket, roundRobinSchedule, groupStandings, type BracketMatch, type PairMatchResult } from './fixed-pairs';
import { estimatedMatchMinutes, scheduleMatches, type CourtWindow, type ScheduleItem } from './scheduler';
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

function splitIntoGroups(shuffledPairIds: string[], numGroups: number): string[][] {
  const groups: string[][] = Array.from({ length: numGroups }, () => []);
  shuffledPairIds.forEach((pid, i) => groups[i % numGroups].push(pid));
  return groups;
}

function groupName(index: number): string {
  return String.fromCharCode(65 + index); // 0->A, 1->B, ...
}

async function generateGroups(
  db: Db, tournamentId: string, _ev: Awaited<ReturnType<typeof loadEvent>>, cfg: TorneoConfig,
  pairs: LoadedPair[], seed: number,
): Promise<void> {
  const numGroups = cfg.numGroups ?? 2;
  const shuffled = shuffleDeterministic(pairs.map((p) => p.id), seed);
  const groups = splitIntoGroups(shuffled, numGroups);
  for (const g of groups) if (g.length < 2) throw new Error('GROUP_TOO_SMALL');

  const ev = await loadEvent(db, tournamentId);
  const courts = courtWindowsOf(ev);
  const slotMinutes = estimatedMatchMinutes(cfg.matchFormat);
  const playersOfPair = new Map<string, string[]>(pairs.map((p) => [p.id, [p.player1Id, p.player2Id]]));

  const items: ScheduleItem[] = [];
  const toWrite: { phaseTag: string; round: number; pairA: string; pairB: string; key: string }[] = [];
  for (let gi = 0; gi < numGroups; gi++) {
    const name = groupName(gi);
    const groupId = crypto.randomUUID();
    await db.insert(tournamentGroups).values({ id: groupId, tournamentId, name });
    for (const pid of groups[gi]) {
      await db.update(tournamentPairs).set({ groupId }).where(eq(tournamentPairs.id, pid));
    }
    roundRobinSchedule(groups[gi]).forEach((m, i) => {
      const key = `g${gi}r${m.round}m${i}`;
      toWrite.push({ phaseTag: `group:${name}`, round: m.round, pairA: m.pairA, pairB: m.pairB, key });
      items.push({ matchId: key, players: [...(playersOfPair.get(m.pairA) ?? []), ...(playersOfPair.get(m.pairB) ?? [])] });
    });
  }
  const sched = scheduleMatches(items, courts, slotMinutes);
  const schedByKey = new Map(sched.scheduled.map((s) => [s.matchId, s]));
  for (const w of toWrite) {
    const s = schedByKey.get(w.key);
    await db.insert(tournamentMatches).values({
      id: crypto.randomUUID(), tournamentId, phaseTag: w.phaseTag, round: w.round,
      courtId: s?.courtId ?? null,
      scheduledStart: s ? minToHHMM(s.startMin) : null, scheduledEnd: s ? minToHHMM(s.endMin) : null,
      status: 'pending', slotA1: JSON.stringify({ type: 'pair', pairId: w.pairA } as SlotRef), slotA2: null,
      slotB1: JSON.stringify({ type: 'pair', pairId: w.pairB } as SlotRef), slotB2: null,
    });
  }
}

function toPairMatchResult(m: PozoMatchRow): PairMatchResult {
  return {
    pairA: (parseSlotRef(m.slotA1) as { pairId: string }).pairId,
    pairB: (parseSlotRef(m.slotB1) as { pairId: string }).pairId,
    gamesA: m.teamAScore ?? 0, gamesB: m.teamBScore ?? 0,
    winner: m.winner === 'A' || m.winner === 'B' ? m.winner : 'draw',
  };
}

// Cruces estándar: lista sembrada rank-major (todos los 1ºs por orden de grupo, luego 2ºs…).
// Para 2 grupos × 2 → [1ºA,1ºB,2ºA,2ºB], que con seedOrder produce 1ºA-2ºB y 1ºB-2ºA.
function crossSeed(qualifiersByGroup: string[][]): string[] {
  const maxRank = Math.max(0, ...qualifiersByGroup.map((q) => q.length));
  const out: string[] = [];
  for (let r = 0; r < maxRank; r++) for (const g of qualifiersByGroup) if (g[r]) out.push(g[r]);
  return out;
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

async function maybeGenerateBracketFromGroups(db: Db, tournamentId: string): Promise<void> {
  const rows = await loadTorneoMatches(db, tournamentId);
  const groupMatches = rows.filter((m) => m.phaseTag?.startsWith('group:'));
  if (groupMatches.length === 0) return;
  if (!groupMatches.every((m) => m.status === 'completed')) return;
  if (rows.some((m) => m.phaseTag?.startsWith('ko:'))) return;

  const ev = await loadEvent(db, tournamentId);
  const cfg = ev.config as TorneoConfig;
  const advance = cfg.advancePerGroup ?? 2;
  const pairRows = await db.select().from(tournamentPairs).where(eq(tournamentPairs.tournamentId, tournamentId));
  const groupsRows = await db.select().from(tournamentGroups)
    .where(eq(tournamentGroups.tournamentId, tournamentId)).orderBy(asc(tournamentGroups.name));

  const qualifiersByGroup: string[][] = [];
  for (const g of groupsRows) {
    const groupPairIds = pairRows.filter((p) => p.groupId === g.id).map((p) => p.id);
    const results = groupMatches.filter((m) => m.phaseTag === `group:${g.name}`).map(toPairMatchResult);
    const standings = groupStandings(groupPairIds, results);
    qualifiersByGroup.push(standings.slice(0, advance).map((s) => s.pairId));
  }

  const seededLeaves = crossSeed(qualifiersByGroup);
  const bracket = buildBracket(seededLeaves.map((pid) => ({ type: 'pair', pairId: pid } as SlotRef)));
  const courts = courtWindowsOf(ev);
  const slotMinutes = estimatedMatchMinutes(cfg.matchFormat);
  const groupEnds = groupMatches.map((m) => (m.scheduledEnd ? hhmmToMin(m.scheduledEnd) : 0));
  const baseStart = Math.max(courts.length ? Math.min(...courts.map((c) => c.fromMin)) : 0, ...groupEnds, 0);
  await writeBracket(db, tournamentId, bracket, courts, slotMinutes, baseStart);
}
