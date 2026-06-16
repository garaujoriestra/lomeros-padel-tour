import type { PozoMatchRow } from './pozo-run';
import { matchTeamLabels, isMatchPlayable, nextMatchForPlayer, type DisplayContext, type MatchSlots } from './display';
import { matchSlots } from './pozo-view';
import { groupStandings, resolveBracket, type BracketMatch, type PairMatchResult } from './fixed-pairs';
import type { SlotRef } from './types';

export interface MatchCell {
  matchId: string;
  teamA: string; teamB: string;
  teamAScore: number | null; teamBScore: number | null;
  winner: string | null; status: string; playable: boolean;
  scheduledStart: string | null; courtLabel: string | null;
}
export interface StandingRow {
  pairId: string; label: string;
  played: number; wins: number; draws: number; losses: number; gameDiff: number; points: number; rank: number;
}
export interface GroupView { name: string; standings: StandingRow[]; matches: MatchCell[] }
export interface BracketRound { round: number; matches: MatchCell[] }
export interface BracketView { rounds: BracketRound[] }

function pairIdOf(slot: string | null): string | undefined {
  const s = slot ? (JSON.parse(slot) as SlotRef) : null;
  return s && s.type === 'pair' ? s.pairId : undefined;
}
function cellFrom(m: PozoMatchRow, slots: MatchSlots, ctx: DisplayContext, courtLabelById: Map<string, string>): MatchCell {
  const { teamA, teamB } = matchTeamLabels(slots, ctx);
  return {
    matchId: m.id, teamA, teamB, teamAScore: m.teamAScore, teamBScore: m.teamBScore,
    winner: m.winner, status: m.status, playable: isMatchPlayable(slots) && m.status !== 'completed',
    scheduledStart: m.scheduledStart, courtLabel: m.courtId ? (courtLabelById.get(m.courtId) ?? null) : null,
  };
}

export function buildGroupsView(
  groups: { id: string; name: string }[],
  pairs: { id: string; player1Id: string; player2Id: string; groupId: string | null }[],
  matches: PozoMatchRow[],
  ctx: DisplayContext,
  courtLabelById: Map<string, string>,
): GroupView[] {
  return groups.slice().sort((a, b) => a.name.localeCompare(b.name)).map((g) => {
    const groupPairIds = pairs.filter((p) => p.groupId === g.id).map((p) => p.id);
    const groupMatches = matches.filter((m) => m.phaseTag === `group:${g.name}`);
    const results: PairMatchResult[] = groupMatches
      .filter((m) => m.status === 'completed')
      .map((m) => ({
        pairA: pairIdOf(m.slotA1)!, pairB: pairIdOf(m.slotB1)!,
        gamesA: m.teamAScore ?? 0, gamesB: m.teamBScore ?? 0,
        winner: m.winner === 'A' || m.winner === 'B' ? m.winner : 'draw',
      }));
    const standings: StandingRow[] = groupStandings(groupPairIds, results).map((s) => ({
      pairId: s.pairId, label: ctx.pairLabel.get(s.pairId) ?? '—',
      played: s.played, wins: s.wins, draws: s.draws, losses: s.losses, gameDiff: s.gameDiff, points: s.points, rank: s.rank,
    }));
    const cells = groupMatches.map((m) => cellFrom(m, matchSlots(m), ctx, courtLabelById));
    return { name: g.name, standings, matches: cells };
  });
}

function resolvedBracketCells(matches: PozoMatchRow[]): { resolvedSlots: Map<string, MatchSlots>; rowByEngine: Map<string, PozoMatchRow> } {
  const koRows = matches.filter((m) => m.phaseTag?.startsWith('ko:'));
  const rowByEngine = new Map<string, PozoMatchRow>();
  const bracket: BracketMatch[] = koRows.map((m) => {
    const engineId = m.phaseTag!.slice(3);
    rowByEngine.set(engineId, m);
    return {
      matchId: engineId, round: m.round,
      slotA: JSON.parse(m.slotA1 ?? '{}') as SlotRef, slotB: JSON.parse(m.slotB1 ?? '{}') as SlotRef,
    };
  });
  const results = new Map<string, 'A' | 'B'>();
  for (const m of koRows) {
    if (m.status === 'completed' && (m.winner === 'A' || m.winner === 'B')) results.set(m.phaseTag!.slice(3), m.winner);
  }
  const resolved = resolveBracket(bracket, results);
  const resolvedSlots = new Map<string, MatchSlots>();
  for (const r of resolved) resolvedSlots.set(r.matchId, { slotA1: r.slotA, slotA2: null, slotB1: r.slotB, slotB2: null });
  return { resolvedSlots, rowByEngine };
}

export function buildBracketView(
  matches: PozoMatchRow[], ctx: DisplayContext, courtLabelById: Map<string, string>,
): BracketView {
  const { resolvedSlots, rowByEngine } = resolvedBracketCells(matches);
  const byRound = new Map<number, MatchCell[]>();
  for (const [engineId, slots] of resolvedSlots) {
    const m = rowByEngine.get(engineId)!;
    const cell = cellFrom(m, slots, ctx, courtLabelById);
    const arr = byRound.get(m.round) ?? []; arr.push(cell); byRound.set(m.round, arr);
  }
  const rounds = [...byRound.keys()].sort((a, b) => a - b).map((round) => ({ round, matches: byRound.get(round)! }));
  return { rounds };
}

export interface NextMatchInfo { teamA: string; teamB: string; courtLabel: string | null; scheduledStart: string | null }

export function torneoNextMatch(
  matches: PozoMatchRow[],
  ctx: DisplayContext,
  courtLabelById: Map<string, string>,
  playerId: string,
  myPairIds: string[],
): NextMatchInfo | null {
  type Sched = MatchSlots & { scheduledStart: string | null; status: string; courtId: string | null };
  const groupSched: Sched[] = matches
    .filter((m) => m.phaseTag?.startsWith('group:'))
    .map((m) => ({ ...matchSlots(m), scheduledStart: m.scheduledStart, status: m.status, courtId: m.courtId }));
  const { resolvedSlots, rowByEngine } = resolvedBracketCells(matches);
  const koSched: Sched[] = [...resolvedSlots].map(([engineId, slots]) => {
    const m = rowByEngine.get(engineId)!;
    return { ...slots, scheduledStart: m.scheduledStart, status: m.status, courtId: m.courtId };
  });
  const next = nextMatchForPlayer<Sched>([...groupSched, ...koSched], playerId, new Set(myPairIds));
  if (!next) return null;
  const { teamA, teamB } = matchTeamLabels(next, ctx);
  return { teamA, teamB, courtLabel: next.courtId ? (courtLabelById.get(next.courtId) ?? null) : null, scheduledStart: next.scheduledStart };
}
