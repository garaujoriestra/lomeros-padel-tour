import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from '@/lib/db/schema';
import {
  tournaments, tournamentCourts, tournamentParticipants,
  tournamentBlocks, tournamentGroups, tournamentPairs,
} from '@/lib/db/schema';
import type { MatchFormat } from './types';

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
