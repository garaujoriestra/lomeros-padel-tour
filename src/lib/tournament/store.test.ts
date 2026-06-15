import { describe, it, expect } from 'vitest';
import { createTestDb } from './test-db';
import { createTournament, loadTournamentConfig, generateAndStore, updateTournamentShell, replaceBlocks } from './store';
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

describe('replaceBlocks', () => {
  it('reemplaza los bloques, borra la parrilla previa y vuelve a draft', async () => {
    const db = await createTestDb();
    const id = await createTournament(db, sampleInput); // tiene 2 bloques
    await generateAndStore(db, id); // crea matches y pone status scheduled

    const before = await db.select().from(tournamentMatches).where(eq(tournamentMatches.tournamentId, id));
    expect(before.length).toBeGreaterThan(0);

    await replaceBlocks(db, id, [
      {
        order: 1, type: 'pozo', name: 'Solo pozo', durationMinutes: 60,
        config: {
          matchFormat: { kind: 'timed', minutes: 15, tieRule: 'golden_point' },
          bufferMinutes: 0, roundMinutes: 15, participantOrder: ['pl1', 'pl2', 'pl3', 'pl4'],
        },
      },
    ]);

    const blocks = await db.select().from(tournamentBlocks).where(eq(tournamentBlocks.tournamentId, id));
    expect(blocks).toHaveLength(1);
    expect(blocks[0].name).toBe('Solo pozo');

    const after = await db.select().from(tournamentMatches).where(eq(tournamentMatches.tournamentId, id));
    expect(after).toHaveLength(0);

    const [t] = await db.select().from(tournaments).where(eq(tournaments.id, id));
    expect(t.status).toBe('draft');
  });
});

describe('updateTournamentShell', () => {
  it('actualiza meta y reemplaza pistas y participantes', async () => {
    const db = await createTestDb();
    const id = await createTournament(db, sampleInput);

    await updateTournamentShell(db, id, {
      name: 'Cumple 2026 (editado)',
      date: '2026-06-20',
      location: 'Nuevo Club',
      notes: null,
      courts: [
        { label: 'Central', order: 1, availableFrom: '18:00', availableTo: '21:00' },
      ],
      participantPlayerIds: ['pl1', 'pl2', 'pl3'],
    });

    const [t] = await db.select().from(tournaments).where(eq(tournaments.id, id));
    expect(t.name).toBe('Cumple 2026 (editado)');
    expect(t.date).toBe('2026-06-20');
    expect(t.location).toBe('Nuevo Club');

    const courts = await db.select().from(tournamentCourts).where(eq(tournamentCourts.tournamentId, id));
    expect(courts).toHaveLength(1);
    expect(courts[0].label).toBe('Central');

    const parts = await db.select().from(tournamentParticipants).where(eq(tournamentParticipants.tournamentId, id));
    expect(parts).toHaveLength(3);
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

  it('multi-bloque round-trip: pozo 6 rondas + liguilla grupo A (sin cuadro por 1 clasificado)', async () => {
    // sampleInput: 4 participantes, pista 1 (17:00-20:00) + pista 2 (17:00-18:30).
    // Bloque pozo 90min, roundMinutes=15 → 6 rondas × 1 pista (4 jugadores caben en 1 pista) = 6 partidos.
    // Bloque fixed_pairs 90min, grupo A con 2 parejas, advancePerGroup=1, knockout=true.
    //   Liguilla: 1 partido (round-robin de 2 parejas = 1 partido).
    //   KO: qualifierSeeds([grupoA], 1) = [{type:'placeholder','1º A'}] → buildBracket con 1 hoja devuelve [] → 0 partidos de cuadro.
    // Total: 6 + 1 = 7 partidos, 2 blockIds distintos.
    const db = await createTestDb();
    const id = await createTournament(db, sampleInput);

    const res = await generateAndStore(db, id);
    expect(res.matchCount).toBe(7);
    expect(res.warnings).toEqual([]);

    const rows = await db.select().from(tournamentMatches).where(eq(tournamentMatches.tournamentId, id));
    expect(rows).toHaveLength(7);

    // Dos blockIds distintos: uno para el pozo y otro para el fixed_pairs.
    const blockIds = new Set(rows.map((r) => r.blockId));
    expect(blockIds.size).toBe(2);

    // Partidos del pozo: 6, todos con phaseTag 'pozo'.
    const pozoRows = rows.filter((r) => r.phaseTag === 'pozo');
    expect(pozoRows).toHaveLength(6);

    // Ronda 0 del pozo: slots concretos (participant).
    const pozoR0 = pozoRows.filter((r) => r.round === 0);
    expect(pozoR0).toHaveLength(1);
    expect(JSON.parse(pozoR0[0].slotA1!).type).toBe('participant');
    expect(JSON.parse(pozoR0[0].slotA2!).type).toBe('participant');
    expect(JSON.parse(pozoR0[0].slotB1!).type).toBe('participant');
    expect(JSON.parse(pozoR0[0].slotB2!).type).toBe('participant');

    // Rondas 1-5 del pozo: slots son SQL NULL (no la cadena "null").
    const pozoLaterRounds = pozoRows.filter((r) => r.round > 0);
    expect(pozoLaterRounds).toHaveLength(5);
    for (const r of pozoLaterRounds) {
      expect(r.slotA1).toBeNull();
      expect(r.slotA2).toBeNull();
      expect(r.slotB1).toBeNull();
      expect(r.slotB2).toBeNull();
    }

    // Partidos del fixed_pairs: 1 partido de liguilla (grupo A, 2 parejas → 1 partido round-robin).
    // No hay cuadro porque solo 1 clasificado por grupo no alcanza el mínimo de 2 hojas para buildBracket.
    const groupRows = rows.filter((r) => r.phaseTag === 'group:A');
    expect(groupRows).toHaveLength(1);
    expect(JSON.parse(groupRows[0].slotA1!).type).toBe('pair');
    expect(JSON.parse(groupRows[0].slotB1!).type).toBe('pair');
    expect(groupRows[0].slotA2).toBeNull();
    expect(groupRows[0].slotB2).toBeNull();

    // Ningún slot en ninguna fila contiene la cadena literal "null".
    const slotCols = ['slotA1', 'slotA2', 'slotB1', 'slotB2'] as const;
    for (const r of rows) {
      for (const col of slotCols) {
        expect(r[col]).not.toBe('null');
      }
    }

    // Estado del torneo = 'scheduled'.
    const [t] = await db.select().from(tournaments).where(eq(tournaments.id, id));
    expect(t.status).toBe('scheduled');
  });

  it('grupos + cuadro round-trip: 2 grupos (A+B), 2 parejas cada uno, advancePerGroup=1 → final con placeholders', async () => {
    // 2 grupos de 2 parejas, advancePerGroup=1 → qualifierSeeds devuelve [1ºA, 1ºB] (2 hojas).
    // buildBracket con 2 hojas → 1 partido de cuadro (la final), phaseTag 'ko:r0'.
    // Los slots del partido KO son placeholders (los clasificados aún no se conocen).
    // No hay matchWinner refs porque la final es el único partido de cuadro (no hay semifinales previas).
    // Total: 2 partidos de liguilla (1 por grupo) + 1 partido de cuadro = 3.
    const db = await createTestDb();
    const id = await createTournament(db, {
      name: 'KO Groups', date: '2026-06-13',
      courts: [
        { label: 'P1', order: 1, availableFrom: '10:00', availableTo: '14:00' },
        { label: 'P2', order: 2, availableFrom: '10:00', availableTo: '14:00' },
      ],
      participantPlayerIds: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
      blocks: [{
        order: 1, type: 'fixed_pairs', name: 'Torneo', durationMinutes: 240,
        config: { matchFormat: { kind: 'timed', minutes: 30, tieRule: 'golden_point' }, bufferMinutes: 5, knockout: true, advancePerGroup: 1 },
        groupNames: ['A', 'B'],
        pairs: [
          { player1Id: 'a', player2Id: 'b', seed: 1, groupName: 'A' },
          { player1Id: 'c', player2Id: 'd', seed: 2, groupName: 'A' },
          { player1Id: 'e', player2Id: 'f', seed: 3, groupName: 'B' },
          { player1Id: 'g', player2Id: 'h', seed: 4, groupName: 'B' },
        ],
      }],
    });

    const res = await generateAndStore(db, id);
    expect(res.matchCount).toBe(3); // 1 partido grupo A + 1 partido grupo B + 1 final KO
    expect(res.warnings).toEqual([]);

    const rows = await db.select().from(tournamentMatches).where(eq(tournamentMatches.tournamentId, id));
    expect(rows).toHaveLength(3);

    // Fases presentes: 'group:A', 'group:B', 'ko:r0'.
    const phaseTags = new Set(rows.map((r) => r.phaseTag));
    expect(phaseTags).toContain('group:A');
    expect(phaseTags).toContain('group:B');
    expect(phaseTags).toContain('ko:r0');
    expect(phaseTags.size).toBe(3);

    // Partidos de liguilla: slots tipo 'pair' (refs de parejas concretas).
    const groupRows = rows.filter((r) => r.phaseTag === 'group:A' || r.phaseTag === 'group:B');
    expect(groupRows).toHaveLength(2);
    for (const r of groupRows) {
      expect(JSON.parse(r.slotA1!).type).toBe('pair');
      expect(JSON.parse(r.slotB1!).type).toBe('pair');
      expect(r.slotA2).toBeNull();
      expect(r.slotB2).toBeNull();
    }

    // Partido KO (la final): los clasificados aún no se conocen → placeholders '1º A' / '1º B'.
    // (buildBracket con 2 hojas genera un solo partido en ronda 0; no hay rondas previas,
    //  así que los slots son placeholders directos, no matchWinner.)
    const koRows = rows.filter((r) => r.phaseTag === 'ko:r0');
    expect(koRows).toHaveLength(1);
    const koFinal = koRows[0];
    const koSlotA = JSON.parse(koFinal.slotA1!);
    const koSlotB = JSON.parse(koFinal.slotB1!);
    expect(koSlotA.type).toBe('placeholder');
    expect(koSlotB.type).toBe('placeholder');
    expect(koSlotA.desc).toBe('1º A');
    expect(koSlotB.desc).toBe('1º B');
    expect(koFinal.slotA2).toBeNull();
    expect(koFinal.slotB2).toBeNull();

    // Ningún slot en ninguna fila contiene la cadena literal "null".
    const slotCols = ['slotA1', 'slotA2', 'slotB1', 'slotB2'] as const;
    for (const r of rows) {
      for (const col of slotCols) {
        expect(r[col]).not.toBe('null');
      }
    }

    // Estado del torneo = 'scheduled'.
    const [t] = await db.select().from(tournaments).where(eq(tournaments.id, id));
    expect(t.status).toBe('scheduled');
  });
});
