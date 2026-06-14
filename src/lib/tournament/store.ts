import { eq, asc } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from '@/lib/db/schema';
import {
  tournaments, tournamentCourts, tournamentParticipants,
  tournamentBlocks, tournamentGroups, tournamentPairs,
} from '@/lib/db/schema';
import type { MatchFormat } from './types';
import type { GenBlock, GenCourt } from './generate';
import { hhmmToMin } from './time';

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

// Inserta toda la configuración del torneo. Devuelve el id del torneo.
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
