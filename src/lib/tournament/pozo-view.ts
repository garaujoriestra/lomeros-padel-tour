import type { PozoMatchRow } from './pozo-run';
import { matchTeamLabels, isMatchPlayable, type DisplayContext, type MatchSlots } from './display';
import type { SlotRef } from './types';

function parseSlot(s: string | null): SlotRef | null {
  if (!s) return null;
  try { return JSON.parse(s) as SlotRef; } catch { return null; }
}
export function matchSlots(m: PozoMatchRow): MatchSlots {
  return {
    slotA1: parseSlot(m.slotA1), slotA2: parseSlot(m.slotA2),
    slotB1: parseSlot(m.slotB1), slotB2: parseSlot(m.slotB2),
  };
}

export function buildDisplayContext(
  players: { id: string; name: string }[],
  pairs: { id: string; player1Id: string; player2Id: string }[],
): DisplayContext {
  const playerName = new Map(players.map((p) => [p.id, p.name]));
  const pairLabel = new Map(pairs.map((pr) =>
    [pr.id, `${playerName.get(pr.player1Id) ?? '—'} / ${playerName.get(pr.player2Id) ?? '—'}`] as const));
  return { playerName, pairLabel };
}

export interface GridCell {
  matchId: string; round: number; courtId: string | null; scheduledStart: string | null;
  teamA: string; teamB: string;
  teamAScore: number | null; teamBScore: number | null;
  winner: string | null; status: string; playable: boolean;
}
export interface PozoGridView {
  rounds: number[];
  rows: { court: { id: string; label: string }; cells: (GridCell | null)[] }[];
}

export function buildPozoGrid(
  matches: PozoMatchRow[],
  courtsByOrder: { id: string; label: string }[],
  ctx: DisplayContext,
): PozoGridView {
  const rounds = [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b);
  const toCell = (m: PozoMatchRow): GridCell => {
    const ms = matchSlots(m);
    const { teamA, teamB } = matchTeamLabels(ms, ctx);
    return {
      matchId: m.id, round: m.round, courtId: m.courtId, scheduledStart: m.scheduledStart,
      teamA, teamB, teamAScore: m.teamAScore, teamBScore: m.teamBScore,
      winner: m.winner, status: m.status, playable: isMatchPlayable(ms),
    };
  };
  const rows = courtsByOrder.map((court) => ({
    court,
    cells: rounds.map((r) => {
      const m = matches.find((mm) => mm.courtId === court.id && mm.round === r);
      return m ? toCell(m) : null;
    }),
  }));
  return { rounds, rows };
}

// La clasificación usa entityId que puede ser playerId (americano) o pairId (parejas fijas).
export function standingLabel(entityId: string, ctx: DisplayContext): string {
  return ctx.playerName.get(entityId) ?? ctx.pairLabel.get(entityId) ?? '—';
}
