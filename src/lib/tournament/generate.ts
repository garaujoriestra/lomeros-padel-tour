import type { MatchFormat, SlotRef } from './types';
import { seedPozoCourts, courtPairing } from './pozo';

export interface GenCourt {
  courtId: string;
  order: number;   // 1 = pista más alta
  fromMin: number; // minutos desde medianoche
  toMin: number;
}

interface GenBlockBase {
  blockId: string;
  startMin: number;          // inicio del bloque (minutos desde medianoche)
  durationMinutes: number;
  matchFormat: MatchFormat;
  bufferMinutes: number;
}

export interface GenPozoBlock extends GenBlockBase {
  type: 'pozo';
  roundMinutes: number;
  participantIds: string[];  // orden de sembrado en las pistas
}

export interface GenFixedPairsBlock extends GenBlockBase {
  type: 'fixed_pairs';
  groups: { groupId: string; name: string; pairIds: string[] }[]; // vacío si solo cuadro
  knockout: boolean;
  advancePerGroup: number;   // cuántos pasan por grupo (si hay grupos)
  knockoutSeeds: string[];   // parejas sembradas (si NO hay grupos)
}

export type GenBlock = GenPozoBlock | GenFixedPairsBlock;

export interface GenMatch {
  blockId: string;
  courtId: string | null;
  round: number;
  phaseTag: string;
  startMin: number | null;
  endMin: number | null;
  slotA1: SlotRef | null;
  slotA2: SlotRef | null;
  slotB1: SlotRef | null;
  slotB2: SlotRef | null;
}

export interface GenResult {
  matches: GenMatch[];
  warnings: string[];
}

// Pre-dibuja todas las rondas del pozo. Ronda 0 con participantes concretos; rondas
// siguientes con huecos null (se rellenan en vivo al cerrar cada ronda). Todas las pistas
// juegan a la vez por ronda.
export function layoutPozo(block: GenPozoBlock, courts: GenCourt[]): GenMatch[] {
  const sortedCourts = [...courts].sort((a, b) => a.order - b.order);
  // v1: el pozo usa las pistas por `order` y asume que están libres durante todo el bloque
  // (no comprueba fromMin/toMin de cada pista). Refinamiento futuro si hay pistas que cierran antes.
  // nº de pistas activas = grupos completos de 4 (los sobrantes descansan, ver seedPozoCourts)
  const numCourts = Math.min(sortedCourts.length, Math.floor(block.participantIds.length / 4));
  const numRounds = Math.floor(block.durationMinutes / block.roundMinutes);
  if (numCourts < 1 || numRounds < 1) return [];

  const seeded = seedPozoCourts(block.participantIds, numCourts);
  const matches: GenMatch[] = [];

  for (let round = 0; round < numRounds; round++) {
    const startMin = block.startMin + round * block.roundMinutes;
    const endMin = startMin + block.roundMinutes;
    for (let courtIdx = 0; courtIdx < numCourts; courtIdx++) {
      const courtId = sortedCourts[courtIdx].courtId;
      if (round === 0) {
        const { teamA, teamB } = courtPairing(seeded.courts[courtIdx], 0);
        matches.push({
          blockId: block.blockId, courtId, round, phaseTag: 'pozo', startMin, endMin,
          slotA1: { type: 'participant', participantId: teamA[0] },
          slotA2: { type: 'participant', participantId: teamA[1] },
          slotB1: { type: 'participant', participantId: teamB[0] },
          slotB2: { type: 'participant', participantId: teamB[1] },
        });
      } else {
        matches.push({
          blockId: block.blockId, courtId, round, phaseTag: 'pozo', startMin, endMin,
          slotA1: null, slotA2: null, slotB1: null, slotB2: null,
        });
      }
    }
  }
  return matches;
}

// Precondición: advancePerGroup <= nº de parejas del grupo más pequeño (si no, genera
// placeholders "Nº Grupo" que nunca podrán rellenarse).
// Hojas del cuadro (en orden de siembra) cuando los clasificados salen de grupos.
// Intercala por posición: 1º de cada grupo, luego 2º de cada grupo, etc.
export function qualifierSeeds(
  groups: { groupId: string; name: string; pairIds: string[] }[],
  advancePerGroup: number,
): SlotRef[] {
  const leaves: SlotRef[] = [];
  for (let pos = 1; pos <= advancePerGroup; pos++) {
    for (const group of groups) {
      leaves.push({ type: 'placeholder', desc: `${pos}º ${group.name}` });
    }
  }
  return leaves;
}
