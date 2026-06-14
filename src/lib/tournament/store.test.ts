import { describe, it, expect } from 'vitest';
import { createTestDb } from './test-db';
import { createTournament, loadTournamentConfig, generateAndStore } from './store';
import type { CreateTournamentInput } from './store';
import type { GenPozoBlock, GenFixedPairsBlock } from './generate';
import { tournamentCourts, tournamentParticipants, tournamentBlocks, tournamentGroups, tournamentPairs, tournamentMatches, tournaments } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const sampleInput: CreateTournamentInput = {
  name: 'Cumple 2026', date: '2026-06-13',
  courts: [
    { label: 'Pista 1', order: 1, availableFrom: '17:00', availableTo: '20:00' },
    { label: 'Pista 2', order: 2, availableFrom: '17:00', availableTo: '18:30' },
  ],
  participantPlayerIds: ['pl1', 'pl2', 'pl3', 'pl4'],
  blocks: [
    {
      order: 1, type: 'pozo', name: 'Pozo', durationMinutes: 90,
      config: { matchFormat: { kind: 'timed', minutes: 15, tieRule: 'golden_point' }, bufferMinutes: 0, roundMinutes: 15, participantOrder: ['pl1', 'pl2', 'pl3', 'pl4'] },
    },
    {
      order: 2, type: 'fixed_pairs', name: 'Torneo', durationMinutes: 90,
      config: { matchFormat: { kind: 'best_of_3' }, bufferMinutes: 5, advancePerGroup: 1, knockout: true },
      groupNames: ['A'],
      pairs: [
        { player1Id: 'pl1', player2Id: 'pl2', seed: 1, groupName: 'A' },
        { player1Id: 'pl3', player2Id: 'pl4', seed: 2, groupName: 'A' },
      ],
    },
  ],
};

describe('createTournament', () => {
  it('inserta torneo, pistas, participantes, bloques, grupos y parejas', async () => {
    const db = await createTestDb();
    const id = await createTournament(db, sampleInput);
    expect(id).toBeTruthy();

    const courts = await db.select().from(tournamentCourts).where(eq(tournamentCourts.tournamentId, id));
    expect(courts).toHaveLength(2);

    const participants = await db.select().from(tournamentParticipants).where(eq(tournamentParticipants.tournamentId, id));
    expect(participants).toHaveLength(4);

    const blocks = await db.select().from(tournamentBlocks).where(eq(tournamentBlocks.tournamentId, id));
    expect(blocks).toHaveLength(2);
    const pozo = blocks.find((b) => b.type === 'pozo')!;
    expect(JSON.parse(pozo.config).participantOrder).toEqual(['pl1', 'pl2', 'pl3', 'pl4']);

    const fixedBlock = blocks.find((b) => b.type === 'fixed_pairs')!;
    const groups = await db.select().from(tournamentGroups).where(eq(tournamentGroups.blockId, fixedBlock.id));
    expect(groups).toHaveLength(1);
    const pairs = await db.select().from(tournamentPairs).where(eq(tournamentPairs.blockId, fixedBlock.id));
    expect(pairs).toHaveLength(2);
    expect(pairs.every((p) => p.groupId === groups[0].id)).toBe(true);
  });
});

describe('loadTournamentConfig', () => {
  it('reconstruye GenBlock[]/GenCourt[] con timing de bloques secuencial', async () => {
    const db = await createTestDb();
    const id = await createTournament(db, sampleInput);
    const { blocks, courts } = await loadTournamentConfig(db, id);

    expect(courts).toHaveLength(2);
    expect(courts[0]).toMatchObject({ order: 1, fromMin: 17 * 60, toMin: 20 * 60 });

    expect(blocks).toHaveLength(2);
    const pozo = blocks.find((b) => b.type === 'pozo') as GenPozoBlock;
    expect(pozo.startMin).toBe(17 * 60);
    expect(pozo.participantIds).toEqual(['pl1', 'pl2', 'pl3', 'pl4']);
    expect(pozo.roundMinutes).toBe(15);

    const fixed = blocks.find((b) => b.type === 'fixed_pairs') as GenFixedPairsBlock;
    expect(fixed.startMin).toBe(17 * 60 + 90); // 18:30
    expect(fixed.knockout).toBe(true);
    expect(fixed.advancePerGroup).toBe(1);
    expect(fixed.groups).toHaveLength(1);
    expect(fixed.groups[0].name).toBe('A');
    expect(fixed.groups[0].pairIds).toHaveLength(2);
    expect(fixed.knockoutSeeds).toEqual([]);
  });

  it('cuadro sin grupos: knockoutSeeds = parejas ordenadas por seed', async () => {
    const db = await createTestDb();
    const id = await createTournament(db, {
      name: 'KO', date: '2026-06-13',
      courts: [{ label: 'P1', order: 1, availableFrom: '10:00', availableTo: '12:00' }],
      participantPlayerIds: ['a', 'b', 'c', 'd'],
      blocks: [{
        order: 1, type: 'fixed_pairs', name: 'Cuadro', durationMinutes: 60,
        config: { matchFormat: { kind: 'best_of_3' }, bufferMinutes: 0, knockout: true },
        pairs: [
          { player1Id: 'c', player2Id: 'd', seed: 2 },
          { player1Id: 'a', player2Id: 'b', seed: 1 },
        ],
      }],
    });
    const { blocks } = await loadTournamentConfig(db, id);
    const fixed = blocks[0] as GenFixedPairsBlock;
    expect(fixed.groups).toEqual([]);
    expect(fixed.knockoutSeeds).toHaveLength(2);
    expect(fixed.knockoutSeeds.length).toBe(2);
  });
});

describe('generateAndStore', () => {
  it('guarda la parrilla y remapea las refs del cuadro a UUIDs reales', async () => {
    const db = await createTestDb();
    const id = await createTournament(db, {
      name: 'KO', date: '2026-06-13',
      courts: [
        { label: 'P1', order: 1, availableFrom: '10:00', availableTo: '13:00' },
        { label: 'P2', order: 2, availableFrom: '10:00', availableTo: '13:00' },
      ],
      participantPlayerIds: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
      blocks: [{
        order: 1, type: 'fixed_pairs', name: 'Cuadro', durationMinutes: 180,
        config: { matchFormat: { kind: 'timed', minutes: 30, tieRule: 'golden_point' }, bufferMinutes: 0, knockout: true },
        pairs: [
          { player1Id: 'a', player2Id: 'b', seed: 1 },
          { player1Id: 'c', player2Id: 'd', seed: 2 },
          { player1Id: 'e', player2Id: 'f', seed: 3 },
          { player1Id: 'g', player2Id: 'h', seed: 4 },
        ],
      }],
    });

    const res = await generateAndStore(db, id);
    expect(res.matchCount).toBe(3); // 2 de ronda 0 + final
    expect(res.warnings).toEqual([]);

    const rows = await db.select().from(tournamentMatches).where(eq(tournamentMatches.tournamentId, id));
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.scheduledStart && /^\d{2}:\d{2}$/.test(r.scheduledStart))).toBe(true);

    const r0Ids = new Set(rows.filter((r) => r.phaseTag === 'ko:r0').map((r) => r.id));
    expect(r0Ids.size).toBe(2);
    const final = rows.find((r) => r.phaseTag === 'ko:r1')!;
    const slotA = JSON.parse(final.slotA1!);
    const slotB = JSON.parse(final.slotB1!);
    expect(slotA.type).toBe('matchWinner');
    expect(r0Ids.has(slotA.matchId)).toBe(true);
    expect(r0Ids.has(slotB.matchId)).toBe(true);
    expect(slotA.matchId).not.toBe(slotB.matchId);

    const [t] = await db.select().from(tournaments).where(eq(tournaments.id, id));
    expect(t.status).toBe('scheduled');
  });
});
