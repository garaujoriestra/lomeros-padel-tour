import { and, eq } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from '@/lib/db/schema';
import {
  tournamentMatches, tournamentCourts, tournamentBlocks,
  tournamentGroups, tournamentPairs,
} from '@/lib/db/schema';
import type { SlotRef } from './types';
import {
  seedPozoCourts, courtPairing, nextPozoRoundWithRest, pozoStandings,
  type PozoRound, type CourtResult, type PozoMatchResult, type PozoStanding,
} from './pozo';
import {
  groupStandings, resolveBracket,
  type PairMatchResult, type GroupStanding, type BracketMatch,
} from './fixed-pairs';

type Db = LibSQLDatabase<typeof schema>;

function parseSlot(raw: string | null): SlotRef | null {
  return raw ? (JSON.parse(raw) as SlotRef) : null;
}

// Un slot está resuelto si referencia a un participante/pareja concretos (o es un bye).
// placeholder/matchWinner y null (ronda TBD del pozo) no están resueltos.
function isResolved(slot: SlotRef | null): boolean {
  return !!slot && (slot.type === 'participant' || slot.type === 'pair' || slot.type === 'bye');
}

// El partido es jugable si ambos equipos tienen su hueco principal resuelto y ningún
// hueco presente está sin resolver. slotA2/slotB2 a null es válido (partidos de pareja).
function matchReady(a1: SlotRef | null, a2: SlotRef | null, b1: SlotRef | null, b2: SlotRef | null): boolean {
  if (!isResolved(a1) || !isResolved(b1)) return false;
  if (a2 && !isResolved(a2)) return false;
  if (b2 && !isResolved(b2)) return false;
  return true;
}

export interface MatchResultInput {
  teamAScore: number;
  teamBScore: number;
  winner?: 'A' | 'B' | null;   // por defecto se deriva del marcador
  setsJson?: string | null;
}

// Registra el resultado de un partido y dispara la progresión de su fase.
export async function recordResult(db: Db, matchId: string, input: MatchResultInput): Promise<void> {
  const [match] = await db.select().from(tournamentMatches).where(eq(tournamentMatches.id, matchId));
  if (!match) throw new Error(`Partido no encontrado: ${matchId}`);

  const a1 = parseSlot(match.slotA1), a2 = parseSlot(match.slotA2);
  const b1 = parseSlot(match.slotB1), b2 = parseSlot(match.slotB2);
  if (!matchReady(a1, a2, b1, b2)) {
    throw new Error(`No se puede registrar resultado: el partido ${matchId} tiene participantes sin resolver`);
  }

  const winner = input.winner !== undefined
    ? input.winner
    : input.teamAScore > input.teamBScore ? 'A'
      : input.teamBScore > input.teamAScore ? 'B'
        : null;

  await db.update(tournamentMatches).set({
    teamAScore: input.teamAScore,
    teamBScore: input.teamBScore,
    winner,
    setsJson: input.setsJson ?? null,
    status: 'completed',
  }).where(eq(tournamentMatches.id, matchId));

  const tag = match.phaseTag ?? '';
  if (tag === 'pozo') {
    await advancePozoRound(db, match.blockId);
  } else if (tag.startsWith('group:')) {
    await resolveGroupQualifiers(db, match.blockId);
  } else if (tag.startsWith('ko')) {
    await propagateBracket(db, match.blockId);
  }
}

// Rellena la ronda siguiente del pozo cuando la actual está cerrada, replayando el estado
// desde la ronda 0 con el motor puro. Idempotente: recalcula desde cero y solo escribe
// rondas todavía vacías.
async function advancePozoRound(db: Db, blockId: string): Promise<void> {
  const [block] = await db.select().from(tournamentBlocks).where(eq(tournamentBlocks.id, blockId));
  if (!block) return;
  const config = JSON.parse(block.config) as { participantOrder?: string[] };
  const participantIds = config.participantOrder ?? [];

  const matches = await db.select().from(tournamentMatches)
    .where(and(eq(tournamentMatches.blockId, blockId), eq(tournamentMatches.phaseTag, 'pozo')));
  if (matches.length === 0) return;

  const courts = await db.select().from(tournamentCourts)
    .where(eq(tournamentCourts.tournamentId, block.tournamentId));
  const orderOf = new Map(courts.map((c) => [c.id, c.order]));
  const sortByCourt = (arr: typeof matches) =>
    [...arr].sort((a, b) => (orderOf.get(a.courtId ?? '') ?? 0) - (orderOf.get(b.courtId ?? '') ?? 0));

  const byRound = new Map<number, typeof matches>();
  for (const m of matches) {
    const arr = byRound.get(m.round) ?? [];
    arr.push(m);
    byRound.set(m.round, arr);
  }
  const rounds = [...byRound.keys()].sort((a, b) => a - b);
  const numCourts = (byRound.get(0) ?? []).length;
  if (numCourts === 0) return;

  // Estado en la ronda 0; se va avanzando ronda a ronda.
  let state: PozoRound = seedPozoCourts(participantIds, numCourts);

  for (const round of rounds) {
    const roundMatches = sortByCourt(byRound.get(round) ?? []);
    const closed = roundMatches.length === numCourts
      && roundMatches.every((m) => m.status === 'completed' && (m.winner === 'A' || m.winner === 'B'));
    if (!closed) return; // ronda no cerrada → no hay nada más que propagar

    const results: CourtResult[] = roundMatches.map((m) => {
      const a1 = (parseSlot(m.slotA1) as Extract<SlotRef, { type: 'participant' }>).participantId;
      const a2 = (parseSlot(m.slotA2) as Extract<SlotRef, { type: 'participant' }>).participantId;
      const b1 = (parseSlot(m.slotB1) as Extract<SlotRef, { type: 'participant' }>).participantId;
      const b2 = (parseSlot(m.slotB2) as Extract<SlotRef, { type: 'participant' }>).participantId;
      const winners: [string, string] = m.winner === 'A' ? [a1, a2] : [b1, b2];
      const losers: [string, string] = m.winner === 'A' ? [b1, b2] : [a1, a2];
      return { winners, losers };
    });

    const nextState = nextPozoRoundWithRest(state, results);
    const nextRound = round + 1;
    const nextMatches = sortByCourt(byRound.get(nextRound) ?? []);

    // Solo rellena si la ronda siguiente existe y aún está vacía (idempotencia).
    if (nextMatches.length > 0 && nextMatches.every((m) => m.slotA1 === null)) {
      for (let courtIdx = 0; courtIdx < nextMatches.length; courtIdx++) {
        const occupants = nextState.courts[courtIdx];
        if (!occupants || occupants.length < 4) continue;
        const { teamA, teamB } = courtPairing(occupants, nextRound);
        await db.update(tournamentMatches).set({
          slotA1: JSON.stringify({ type: 'participant', participantId: teamA[0] }),
          slotA2: JSON.stringify({ type: 'participant', participantId: teamA[1] }),
          slotB1: JSON.stringify({ type: 'participant', participantId: teamB[0] }),
          slotB2: JSON.stringify({ type: 'participant', participantId: teamB[1] }),
        }).where(eq(tournamentMatches.id, nextMatches[courtIdx].id));
      }
    }

    state = nextState;
  }
}

// Cuando toda la liguilla del bloque está cerrada, calcula los clasificados de cada grupo
// y sustituye los placeholders ("1º A") de los partidos de cuadro por refs de pareja.
async function resolveGroupQualifiers(db: Db, blockId: string): Promise<void> {
  const [block] = await db.select().from(tournamentBlocks).where(eq(tournamentBlocks.id, blockId));
  if (!block) return;
  const config = JSON.parse(block.config) as { advancePerGroup?: number; knockout?: boolean };
  const advancePerGroup = config.advancePerGroup ?? 0;
  if (!config.knockout || advancePerGroup < 1) return;

  const groups = await db.select().from(tournamentGroups).where(eq(tournamentGroups.blockId, blockId));
  if (groups.length === 0) return;
  const pairs = await db.select().from(tournamentPairs).where(eq(tournamentPairs.blockId, blockId));

  const matches = await db.select().from(tournamentMatches).where(eq(tournamentMatches.blockId, blockId));
  const groupMatches = matches.filter((m) => (m.phaseTag ?? '').startsWith('group:'));
  if (groupMatches.length === 0 || groupMatches.some((m) => m.status !== 'completed')) return;

  // "1º A" → pairId clasificado, replicando las etiquetas de qualifierSeeds.
  const descToPair = new Map<string, string>();
  for (const group of groups) {
    const groupPairIds = pairs.filter((p) => p.groupId === group.id).map((p) => p.id);
    const results: PairMatchResult[] = groupMatches
      .filter((m) => m.phaseTag === `group:${group.name}`)
      .map((m) => ({
        pairA: (parseSlot(m.slotA1) as Extract<SlotRef, { type: 'pair' }>).pairId,
        pairB: (parseSlot(m.slotB1) as Extract<SlotRef, { type: 'pair' }>).pairId,
        gamesA: m.teamAScore ?? 0,
        gamesB: m.teamBScore ?? 0,
        winner: (m.winner ?? 'draw') as 'A' | 'B' | 'draw',
      }));
    const standings = groupStandings(groupPairIds, results);
    for (let pos = 1; pos <= advancePerGroup; pos++) {
      const qualifier = standings[pos - 1];
      if (qualifier) descToPair.set(`${pos}º ${group.name}`, qualifier.pairId);
    }
  }

  const koMatches = matches.filter((m) => (m.phaseTag ?? '').startsWith('ko'));
  for (const m of koMatches) {
    const updates: Partial<typeof tournamentMatches.$inferInsert> = {};
    for (const col of ['slotA1', 'slotB1'] as const) {
      const slot = parseSlot(m[col]);
      if (slot && slot.type === 'placeholder') {
        const pairId = descToPair.get(slot.desc);
        if (pairId) updates[col] = JSON.stringify({ type: 'pair', pairId });
      }
    }
    if (Object.keys(updates).length > 0) {
      await db.update(tournamentMatches).set(updates).where(eq(tournamentMatches.id, m.id));
    }
  }
}

// Propaga los ganadores del cuadro: reconstruye el bracket desde DB, lo resuelve con los
// resultados conocidos y reescribe los slots que pasan de matchWinner a pair (los byes se
// avanzan automáticamente). Idempotente.
async function propagateBracket(db: Db, blockId: string): Promise<void> {
  const matches = await db.select().from(tournamentMatches).where(eq(tournamentMatches.blockId, blockId));
  const koMatches = matches.filter((m) => (m.phaseTag ?? '').startsWith('ko'));
  if (koMatches.length === 0) return;

  const bracket: BracketMatch[] = koMatches.map((m) => ({
    matchId: m.id,
    round: m.round,
    slotA: parseSlot(m.slotA1) ?? { type: 'placeholder', desc: '?' },
    slotB: parseSlot(m.slotB1) ?? { type: 'placeholder', desc: '?' },
  }));

  const results = new Map<string, 'A' | 'B'>();
  for (const m of koMatches) {
    if (m.status === 'completed' && (m.winner === 'A' || m.winner === 'B')) {
      results.set(m.id, m.winner);
    }
  }

  const resolved = resolveBracket(bracket, results);
  const byId = new Map(koMatches.map((m) => [m.id, m]));

  for (const r of resolved) {
    const m = byId.get(r.matchId);
    if (!m) continue;
    const updates: Partial<typeof tournamentMatches.$inferInsert> = {};
    if (r.slotA.type === 'pair' && parseSlot(m.slotA1)?.type === 'matchWinner') {
      updates.slotA1 = JSON.stringify(r.slotA);
    }
    if (r.slotB.type === 'pair' && parseSlot(m.slotB1)?.type === 'matchWinner') {
      updates.slotB1 = JSON.stringify(r.slotB);
    }
    if (Object.keys(updates).length > 0) {
      await db.update(tournamentMatches).set(updates).where(eq(tournamentMatches.id, m.id));
    }
  }
}

// Clasificación del pozo del bloque a partir de sus partidos completados.
export async function getPozoStandings(db: Db, blockId: string): Promise<PozoStanding[]> {
  const [block] = await db.select().from(tournamentBlocks).where(eq(tournamentBlocks.id, blockId));
  if (!block) return [];
  const config = JSON.parse(block.config) as { participantOrder?: string[] };
  const participantIds = config.participantOrder ?? [];

  const matches = await db.select().from(tournamentMatches)
    .where(and(eq(tournamentMatches.blockId, blockId), eq(tournamentMatches.phaseTag, 'pozo')));

  const results: PozoMatchResult[] = matches
    .filter((m) => m.status === 'completed' && (m.winner === 'A' || m.winner === 'B'))
    .map((m) => {
      const a1 = (parseSlot(m.slotA1) as Extract<SlotRef, { type: 'participant' }>).participantId;
      const a2 = (parseSlot(m.slotA2) as Extract<SlotRef, { type: 'participant' }>).participantId;
      const b1 = (parseSlot(m.slotB1) as Extract<SlotRef, { type: 'participant' }>).participantId;
      const b2 = (parseSlot(m.slotB2) as Extract<SlotRef, { type: 'participant' }>).participantId;
      return {
        teamA: [a1, a2] as [string, string],
        teamB: [b1, b2] as [string, string],
        gamesA: m.teamAScore ?? 0,
        gamesB: m.teamBScore ?? 0,
        winner: m.winner as 'A' | 'B',
      };
    });

  return pozoStandings(participantIds, results);
}

// Clasificación de cada grupo del bloque (nombre de grupo → tabla).
export async function getGroupStandings(db: Db, blockId: string): Promise<Record<string, GroupStanding[]>> {
  const groups = await db.select().from(tournamentGroups).where(eq(tournamentGroups.blockId, blockId));
  const pairs = await db.select().from(tournamentPairs).where(eq(tournamentPairs.blockId, blockId));
  const matches = await db.select().from(tournamentMatches).where(eq(tournamentMatches.blockId, blockId));

  const out: Record<string, GroupStanding[]> = {};
  for (const group of groups) {
    const groupPairIds = pairs.filter((p) => p.groupId === group.id).map((p) => p.id);
    const results: PairMatchResult[] = matches
      .filter((m) => m.phaseTag === `group:${group.name}` && m.status === 'completed')
      .map((m) => ({
        pairA: (parseSlot(m.slotA1) as Extract<SlotRef, { type: 'pair' }>).pairId,
        pairB: (parseSlot(m.slotB1) as Extract<SlotRef, { type: 'pair' }>).pairId,
        gamesA: m.teamAScore ?? 0,
        gamesB: m.teamBScore ?? 0,
        winner: (m.winner ?? 'draw') as 'A' | 'B' | 'draw',
      }));
    out[group.name] = groupStandings(groupPairIds, results);
  }
  return out;
}
