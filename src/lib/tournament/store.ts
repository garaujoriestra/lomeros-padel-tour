import { eq, asc } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from '@/lib/db/schema';
import {
  tournaments, tournamentCourts, tournamentParticipants,
  tournamentBlocks, tournamentGroups, tournamentPairs, tournamentMatches,
} from '@/lib/db/schema';
import type { MatchFormat, SlotRef } from './types';
import type { GenBlock, GenCourt } from './generate';
import { generateTournament } from './generate';
import { hhmmToMin, minToHHMM } from './time';

type Db = LibSQLDatabase<typeof schema>;

export interface BlockConfig {
  matchFormat: MatchFormat;
  bufferMinutes: number;
  roundMinutes?: number;        // pozo: duración de cada ronda
  participantOrder?: string[];  // pozo: playerIds en orden de sembrado
  advancePerGroup?: number;     // fixed_pairs con grupos
  knockout?: boolean;           // fixed_pairs: ¿hay cuadro?
}

export interface CreateCourtInput {
  label: string; order: number; availableFrom: string; availableTo: string;
}
export interface CreatePairInput {
  player1Id: string; player2Id: string; seed?: number; groupName?: string;
}
export interface CreateBlockInput {
  order: number;
  type: 'pozo' | 'fixed_pairs';
  name: string;
  durationMinutes: number;
  config: BlockConfig;
  groupNames?: string[];        // fixed_pairs
  pairs?: CreatePairInput[];    // fixed_pairs
}
export interface CreateTournamentInput {
  name: string; date: string; location?: string; notes?: string; createdBy?: string;
  courts: CreateCourtInput[];
  participantPlayerIds: string[];
  blocks: CreateBlockInput[];
}

export interface UpdateShellInput {
  name: string;
  date: string;
  location: string | null;
  notes: string | null;
  courts: CreateCourtInput[];
  participantPlayerIds: string[];
}

// Inserta toda la configuración del torneo. Devuelve el id del torneo.
// NOTA: inserts secuenciales sin transacción. Envolver en db.transaction() sería
// lo ideal para atomicidad, pero el driver `:memory:` de @libsql/client recrea una
// DB vacía al commitear una transacción, lo que rompe el harness de test (única infra
// con la que verificamos esta función). Como es un alta admin puntual (sin lectores
// concurrentes; ante fallo el admin reintenta), se difiere hasta poder testear contra
// una DB de fichero o en el Plan 6 (capa API).
export async function createTournament(db: Db, input: CreateTournamentInput): Promise<string> {
  const [tournament] = await db.insert(tournaments).values({
    name: input.name,
    date: input.date,
    location: input.location ?? null,
    notes: input.notes ?? null,
    createdBy: input.createdBy ?? null,
    status: 'draft',
  }).returning();

  for (const c of input.courts) {
    await db.insert(tournamentCourts).values({
      tournamentId: tournament.id, label: c.label, order: c.order,
      availableFrom: c.availableFrom, availableTo: c.availableTo,
    });
  }

  for (const playerId of input.participantPlayerIds) {
    await db.insert(tournamentParticipants).values({ tournamentId: tournament.id, playerId });
  }

  for (const block of input.blocks) {
    const [blockRow] = await db.insert(tournamentBlocks).values({
      tournamentId: tournament.id, order: block.order, type: block.type,
      name: block.name, durationMinutes: block.durationMinutes,
      config: JSON.stringify(block.config),
    }).returning();

    if (block.type === 'fixed_pairs') {
      const groupIdByName = new Map<string, string>();
      for (const name of block.groupNames ?? []) {
        const [g] = await db.insert(tournamentGroups).values({ blockId: blockRow.id, name }).returning();
        groupIdByName.set(name, g.id);
      }
      for (const p of block.pairs ?? []) {
        await db.insert(tournamentPairs).values({
          blockId: blockRow.id, player1Id: p.player1Id, player2Id: p.player2Id,
          seed: p.seed ?? null,
          groupId: p.groupName ? (groupIdByName.get(p.groupName) ?? null) : null,
        });
      }
    }
  }

  return tournament.id;
}

// Edita el "cascarón" del torneo: meta + reemplazo completo de pistas y participantes.
// No toca bloques (eso es el Plan 7). No transaccional (misma razón que createTournament).
export async function updateTournamentShell(db: Db, id: string, input: UpdateShellInput): Promise<void> {
  await db.update(tournaments).set({
    name: input.name,
    date: input.date,
    location: input.location,
    notes: input.notes,
  }).where(eq(tournaments.id, id));

  await db.delete(tournamentCourts).where(eq(tournamentCourts.tournamentId, id));
  for (const c of input.courts) {
    await db.insert(tournamentCourts).values({
      tournamentId: id, label: c.label, order: c.order,
      availableFrom: c.availableFrom, availableTo: c.availableTo,
    });
  }

  await db.delete(tournamentParticipants).where(eq(tournamentParticipants.tournamentId, id));
  for (const playerId of input.participantPlayerIds) {
    await db.insert(tournamentParticipants).values({ tournamentId: id, playerId });
  }
}

export interface LoadedConfig {
  blocks: GenBlock[];
  courts: GenCourt[];
}

// Reconstruye la configuración en la forma que consume generateTournament.
// Timing de bloques: secuenciales y consecutivos desde el availableFrom más temprano.
export async function loadTournamentConfig(db: Db, tournamentId: string): Promise<LoadedConfig> {
  const courtRows = await db.select().from(tournamentCourts)
    .where(eq(tournamentCourts.tournamentId, tournamentId))
    .orderBy(asc(tournamentCourts.order));
  const courts: GenCourt[] = courtRows.map((c) => ({
    courtId: c.id, order: c.order,
    fromMin: hhmmToMin(c.availableFrom), toMin: hhmmToMin(c.availableTo),
  }));

  const tournamentStart = courts.length > 0 ? Math.min(...courts.map((c) => c.fromMin)) : 0;

  const blockRows = await db.select().from(tournamentBlocks)
    .where(eq(tournamentBlocks.tournamentId, tournamentId))
    .orderBy(asc(tournamentBlocks.order));

  const blocks: GenBlock[] = [];
  let cursor = tournamentStart;
  for (const b of blockRows) {
    // Cast seguro: createTournament es el único escritor de `config` (datos internos de confianza;
    // la validación de entrada se delega a la capa API en el Plan 6).
    const config = JSON.parse(b.config) as BlockConfig;
    const startMin = cursor;
    cursor += b.durationMinutes;

    if (b.type === 'pozo') {
      blocks.push({
        type: 'pozo', blockId: b.id, startMin, durationMinutes: b.durationMinutes,
        matchFormat: config.matchFormat, bufferMinutes: config.bufferMinutes,
        roundMinutes: config.roundMinutes ?? 0,
        participantIds: config.participantOrder ?? [],
      });
    } else {
      const groupRows = await db.select().from(tournamentGroups).where(eq(tournamentGroups.blockId, b.id));
      const pairRows = await db.select().from(tournamentPairs).where(eq(tournamentPairs.blockId, b.id));
      const groups = groupRows.map((g) => ({
        groupId: g.id, name: g.name,
        pairIds: pairRows.filter((p) => p.groupId === g.id).map((p) => p.id),
      }));
      const knockoutSeeds = groups.length === 0
        ? [...pairRows].sort((a, b2) => (a.seed ?? 0) - (b2.seed ?? 0)).map((p) => p.id)
        : [];
      blocks.push({
        type: 'fixed_pairs', blockId: b.id, startMin, durationMinutes: b.durationMinutes,
        matchFormat: config.matchFormat, bufferMinutes: config.bufferMinutes,
        groups, knockout: config.knockout ?? false,
        advancePerGroup: config.advancePerGroup ?? 0, knockoutSeeds,
      });
    }
  }

  return { blocks, courts };
}

export interface StoreResult {
  matchCount: number;
  warnings: string[];
}

// Genera la parrilla y la guarda. Pre-genera un UUID por partido, mapea engineMatchId->UUID
// por bloque, y reescribe los slots matchWinner antes de insertar (una sola pasada).
export async function generateAndStore(db: Db, tournamentId: string): Promise<StoreResult> {
  const { blocks, courts } = await loadTournamentConfig(db, tournamentId);
  const { matches, warnings: genWarnings } = generateTournament(blocks, courts);
  const warnings = [...genWarnings];

  const idByEngine = new Map<string, string>(); // `${blockId}:${engineMatchId}` -> uuid
  const rows = matches.map((m) => {
    const id = crypto.randomUUID();
    if (m.engineMatchId) idByEngine.set(`${m.blockId}:${m.engineMatchId}`, id);
    return { id, m };
  });

  const slotJson = (blockId: string, slot: SlotRef | null): string | null => {
    if (!slot) return null;
    if (slot.type === 'matchWinner') {
      const mapped = idByEngine.get(`${blockId}:${slot.matchId}`);
      if (!mapped) {
        // No debería ocurrir: todo matchWinner del motor referencia un partido del mismo
        // bloque ya mapeado. Si pasa, avisamos en vez de persistir una clave irresoluble
        // (el Plan 5 no podría propagar ese ganador).
        warnings.push(`Ref de cuadro sin mapear: ${blockId}:${slot.matchId}`);
        return JSON.stringify(slot);
      }
      return JSON.stringify({ type: 'matchWinner', matchId: mapped });
    }
    return JSON.stringify(slot);
  };

  for (const { id, m } of rows) {
    await db.insert(tournamentMatches).values({
      id,
      tournamentId,
      blockId: m.blockId,
      courtId: m.courtId,
      round: m.round,
      phaseTag: m.phaseTag,
      scheduledStart: m.startMin !== null ? minToHHMM(m.startMin) : null,
      scheduledEnd: m.endMin !== null ? minToHHMM(m.endMin) : null,
      status: 'pending',
      slotA1: slotJson(m.blockId, m.slotA1),
      slotA2: slotJson(m.blockId, m.slotA2),
      slotB1: slotJson(m.blockId, m.slotB1),
      slotB2: slotJson(m.blockId, m.slotB2),
    });
  }

  await db.update(tournaments).set({ status: 'scheduled' }).where(eq(tournaments.id, tournamentId));

  return { matchCount: rows.length, warnings };
}
