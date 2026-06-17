import type { PozoMatchRow } from './pozo-run';
import { isMatchPlayable, type DisplayContext, type MatchSlots } from './display';
import type { SlotRef } from './types';

// Etiqueta legible del formato de un evento (pozo o torneo).
export function formatLabel(format: string): string {
  switch (format) {
    case 'fixed_pairs': return 'Parejas fijas';
    case 'americano': return 'Americano';
    case 'single_elim': return 'Eliminación directa';
    case 'groups_elim': return 'Grupos → eliminación';
    default: return format;
  }
}

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

// La clasificación usa entityId que puede ser playerId (americano) o pairId (parejas fijas).
export function standingLabel(entityId: string, ctx: DisplayContext): string {
  return ctx.playerName.get(entityId) ?? ctx.pairLabel.get(entityId) ?? '—';
}

export interface EscaleraMember { entityId: string; label: string; }
export interface EscaleraSide { members: EscaleraMember[]; score: number | null; isWinner: boolean; }
export interface EscaleraLane {
  courtIndex: number; courtLabel: string; isTop: boolean; isBottom: boolean;
  matchId: string; status: string; playable: boolean; scheduledStart: string | null;
  sideA: EscaleraSide; sideB: EscaleraSide;
}
export interface EscaleraRound { round: number; lanes: EscaleraLane[]; restingLabels: string[]; }
export interface EscaleraView { rounds: number[]; latestRound: number; byRound: Record<number, EscaleraRound>; }

function slotMember(slot: SlotRef | null, ctx: DisplayContext): EscaleraMember | null {
  if (!slot) return null;
  if (slot.type === 'participant') return { entityId: slot.participantId, label: ctx.playerName.get(slot.participantId) ?? '—' };
  if (slot.type === 'pair') return { entityId: slot.pairId, label: ctx.pairLabel.get(slot.pairId) ?? '—' };
  return null; // bye/placeholder no son miembros con clasificación
}

// Transforma los partidos del pozo en carriles por ronda (pista top primero).
// `allEntityIds`: todas las entidades que clasifican (playerIds en americano, pairIds en parejas fijas),
// para deducir quién descansa cada ronda. `restingLabels` preserva el orden de `allEntityIds`,
// por lo que el llamador debe pasarlo en el orden de presentación deseado.
export function buildEscaleraView(
  matches: PozoMatchRow[],
  courtsByOrder: { id: string; label: string }[],
  ctx: DisplayContext,
  allEntityIds: string[],
): EscaleraView {
  const courtIndexById = new Map(courtsByOrder.map((c, i) => [c.id, i] as const));
  const lastCourtIdx = Math.max(0, courtsByOrder.length - 1);
  const rounds = [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b);
  const byRound: Record<number, EscaleraRound> = {};

  for (const round of rounds) {
    // Dedupe defensivo: si por datos legados existieran filas duplicadas (mismo courtId en la
    // misma ronda), renderizamos un único carril por pista — protege la UI de "Pista duplicada".
    const seenCourtIds = new Set<string>();
    const lanes: EscaleraLane[] = matches
      .filter((m) => {
        if (m.round !== round) return false;
        if (m.courtId && seenCourtIds.has(m.courtId)) return false;
        if (m.courtId) seenCourtIds.add(m.courtId);
        return true;
      })
      .map((m) => {
        const slots = matchSlots(m);
        const sideA = [slotMember(slots.slotA1, ctx), slotMember(slots.slotA2, ctx)].filter(Boolean) as EscaleraMember[];
        const sideB = [slotMember(slots.slotB1, ctx), slotMember(slots.slotB2, ctx)].filter(Boolean) as EscaleraMember[];
        // courtId desconocido o ausente → cae a la pista 0 (no debería pasar en datos válidos)
        const courtIndex = m.courtId ? (courtIndexById.get(m.courtId) ?? 0) : 0;
        return {
          courtIndex,
          courtLabel: courtsByOrder[courtIndex]?.label ?? `Pista ${courtIndex + 1}`,
          isTop: courtIndex === 0,
          isBottom: courtIndex === lastCourtIdx,
          matchId: m.id, status: m.status, playable: isMatchPlayable(slots),
          scheduledStart: m.scheduledStart,
          sideA: { members: sideA, score: m.teamAScore, isWinner: m.winner === 'A' },
          sideB: { members: sideB, score: m.teamBScore, isWinner: m.winner === 'B' },
        };
      })
      .sort((a, b) => a.courtIndex - b.courtIndex);

    const playing = new Set<string>();
    for (const lane of lanes) for (const side of [lane.sideA, lane.sideB]) for (const mem of side.members) playing.add(mem.entityId);
    const restingLabels = allEntityIds
      .filter((id) => !playing.has(id))
      .map((id) => ctx.playerName.get(id) ?? ctx.pairLabel.get(id) ?? '—');

    byRound[round] = { round, lanes, restingLabels };
  }

  return { rounds, latestRound: rounds.length ? rounds[rounds.length - 1] : 0, byRound };
}
