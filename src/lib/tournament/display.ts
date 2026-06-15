import type { SlotRef } from './types';

export interface DisplayContext {
  playerName: Map<string, string>;   // playerId -> nombre
  pairLabel: Map<string, string>;    // pairId -> "N1 / N2"
}

export function slotLabel(slot: SlotRef | null, ctx: DisplayContext): string {
  if (!slot) return 'Por determinar';
  switch (slot.type) {
    case 'participant': return ctx.playerName.get(slot.participantId) ?? '—';
    case 'pair': return ctx.pairLabel.get(slot.pairId) ?? '—';
    case 'placeholder': return slot.desc;
    case 'matchWinner': return 'Ganador (pdte.)';
    case 'matchLoser': return 'Perdedor (pdte.)';
    case 'bye': return 'BYE';
  }
}

export interface MatchSlots {
  slotA1: SlotRef | null;
  slotA2: SlotRef | null;
  slotB1: SlotRef | null;
  slotB2: SlotRef | null;
}

export function matchTeamLabels(m: MatchSlots, ctx: DisplayContext): { teamA: string; teamB: string } {
  const side = (s1: SlotRef | null, s2: SlotRef | null) => {
    const a = slotLabel(s1, ctx);
    return s2 ? `${a} / ${slotLabel(s2, ctx)}` : a;
  };
  return { teamA: side(m.slotA1, m.slotA2), teamB: side(m.slotB1, m.slotB2) };
}

// Un partido es jugable (se puede meter resultado) si ambos equipos están resueltos.
// Espeja la regla de recordResult: participant/pair/bye resueltos; placeholder/matchWinner/null no.
export function isMatchPlayable(m: MatchSlots): boolean {
  const resolved = (s: SlotRef | null) => !!s && (s.type === 'participant' || s.type === 'pair' || s.type === 'bye');
  if (!resolved(m.slotA1) || !resolved(m.slotB1)) return false;
  if (m.slotA2 && !resolved(m.slotA2)) return false;
  if (m.slotB2 && !resolved(m.slotB2)) return false;
  return true;
}
