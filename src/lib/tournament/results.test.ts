import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from './test-db';
import { tournamentMatches, tournamentCourts, tournamentBlocks } from '@/lib/db/schema';
import { recordResult, getPozoStandings, getGroupStandings } from './results';
import { createTournament, generateAndStore } from './store';

// Inserta un partido suelto con los slots dados. Devuelve el id.
async function insertMatch(
  db: Awaited<ReturnType<typeof createTestDb>>['db'],
  fields: Partial<typeof tournamentMatches.$inferInsert> = {},
): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(tournamentMatches).values({
    id,
    tournamentId: 't1',
    blockId: 'b1',
    round: 0,
    phaseTag: 'group:A',
    status: 'pending',
    slotA1: JSON.stringify({ type: 'pair', pairId: 'pA' }),
    slotB1: JSON.stringify({ type: 'pair', pairId: 'pB' }),
    ...fields,
  });
  return id;
}

describe('recordResult', () => {
  it('escribe marcador, deriva el ganador y marca completed', async () => {
    const { db } = await createTestDb();
    const id = await insertMatch(db);

    await recordResult(db, id, { teamAScore: 6, teamBScore: 3 });

    const [m] = await db.select().from(tournamentMatches).where(eq(tournamentMatches.id, id));
    expect(m.teamAScore).toBe(6);
    expect(m.teamBScore).toBe(3);
    expect(m.winner).toBe('A');
    expect(m.status).toBe('completed');
  });

  it('respeta el ganador explícito (formato a tiempo con empate en juegos)', async () => {
    const { db } = await createTestDb();
    const id = await insertMatch(db);
    await recordResult(db, id, { teamAScore: 5, teamBScore: 5, winner: 'B' });
    const [m] = await db.select().from(tournamentMatches).where(eq(tournamentMatches.id, id));
    expect(m.winner).toBe('B');
  });

  it('rechaza si un slot sigue sin resolver (placeholder)', async () => {
    const { db } = await createTestDb();
    const id = await insertMatch(db, {
      phaseTag: 'ko:r0',
      slotA1: JSON.stringify({ type: 'placeholder', desc: '1º A' }),
      slotB1: JSON.stringify({ type: 'pair', pairId: 'pB' }),
    });
    await expect(recordResult(db, id, { teamAScore: 6, teamBScore: 0 }))
      .rejects.toThrow(/sin resolver/);
  });

  it('rechaza si una ronda de pozo aún está vacía (slots NULL)', async () => {
    const { db } = await createTestDb();
    const id = await insertMatch(db, {
      phaseTag: 'pozo', round: 1,
      slotA1: null, slotA2: null, slotB1: null, slotB2: null,
    });
    await expect(recordResult(db, id, { teamAScore: 6, teamBScore: 0 }))
      .rejects.toThrow(/sin resolver/);
  });

  it('lanza si el partido no existe', async () => {
    const { db } = await createTestDb();
    await expect(recordResult(db, 'nope', { teamAScore: 1, teamBScore: 0 }))
      .rejects.toThrow(/no encontrado/);
  });
});

describe('recordResult — progresión del pozo', () => {
  it('al cerrar la ronda 0 (2 pistas) rellena la ronda 1 con el movimiento', async () => {
    // 8 jugadores, 2 pistas → 2 partidos por ronda. roundMinutes=15, 90 min → 6 rondas.
    const { db } = await createTestDb();
    const id = await createTournament(db, {
      name: 'Pozo', date: '2026-06-15',
      courts: [
        { label: 'P1', order: 1, availableFrom: '17:00', availableTo: '20:00' },
        { label: 'P2', order: 2, availableFrom: '17:00', availableTo: '20:00' },
      ],
      participantPlayerIds: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'],
      blocks: [{
        order: 1, type: 'pozo', name: 'Pozo', durationMinutes: 90,
        config: {
          matchFormat: { kind: 'timed', minutes: 15, tieRule: 'golden_point' },
          bufferMinutes: 0, roundMinutes: 15,
          participantOrder: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'],
        },
      }],
    });
    await generateAndStore(db, id);

    const all = await db.select().from(tournamentMatches).where(eq(tournamentMatches.tournamentId, id));
    const courts = await db.select().from(tournamentCourts).where(eq(tournamentCourts.tournamentId, id));
    const orderOf = new Map(courts.map((c) => [c.id, c.order]));
    const r0 = all.filter((m) => m.round === 0).sort((a, b) => orderOf.get(a.courtId!)! - orderOf.get(b.courtId!)!);
    expect(r0).toHaveLength(2);

    // Ronda 1 está vacía antes de cerrar la 0.
    const r1before = all.filter((m) => m.round === 1);
    expect(r1before.every((m) => m.slotA1 === null)).toBe(true);

    // Pista 1 = [p1,p2,p3,p4] → A=[p1,p2] B=[p3,p4]; gana A → p1,p2 se quedan, p3,p4 bajan.
    // Pista 2 = [p5,p6,p7,p8] → A=[p5,p6] B=[p7,p8]; gana A → p5,p6 suben, p7,p8 se quedan.
    await recordResult(db, r0[0].id, { teamAScore: 6, teamBScore: 2 }); // gana A en pista 1
    await recordResult(db, r0[1].id, { teamAScore: 6, teamBScore: 1 }); // gana A en pista 2

    const after = await db.select().from(tournamentMatches).where(eq(tournamentMatches.tournamentId, id));
    const r1 = after.filter((m) => m.round === 1).sort((a, b) => orderOf.get(a.courtId!)! - orderOf.get(b.courtId!)!);

    for (const m of r1) {
      for (const col of ['slotA1', 'slotA2', 'slotB1', 'slotB2'] as const) {
        expect(m[col]).not.toBeNull();
        expect(JSON.parse(m[col]!).type).toBe('participant');
      }
    }

    const topPlayers = new Set(
      ['slotA1', 'slotA2', 'slotB1', 'slotB2'].map((c) => JSON.parse((r1[0] as unknown as Record<string, string>)[c]).participantId),
    );
    expect(topPlayers).toEqual(new Set(['p1', 'p2', 'p5', 'p6']));

    const bottomPlayers = new Set(
      ['slotA1', 'slotA2', 'slotB1', 'slotB2'].map((c) => JSON.parse((r1[1] as unknown as Record<string, string>)[c]).participantId),
    );
    expect(bottomPlayers).toEqual(new Set(['p3', 'p4', 'p7', 'p8']));

    // La ronda 2 sigue vacía (solo se rellena una ronda por delante).
    expect(after.filter((m) => m.round === 2).every((m) => m.slotA1 === null)).toBe(true);
  });

  it('no rellena la ronda siguiente si la actual no está cerrada del todo', async () => {
    const { db } = await createTestDb();
    const id = await createTournament(db, {
      name: 'Pozo', date: '2026-06-15',
      courts: [
        { label: 'P1', order: 1, availableFrom: '17:00', availableTo: '20:00' },
        { label: 'P2', order: 2, availableFrom: '17:00', availableTo: '20:00' },
      ],
      participantPlayerIds: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'],
      blocks: [{
        order: 1, type: 'pozo', name: 'Pozo', durationMinutes: 90,
        config: {
          matchFormat: { kind: 'timed', minutes: 15, tieRule: 'golden_point' },
          bufferMinutes: 0, roundMinutes: 15,
          participantOrder: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'],
        },
      }],
    });
    await generateAndStore(db, id);
    const all = await db.select().from(tournamentMatches).where(eq(tournamentMatches.tournamentId, id));
    const r0 = all.filter((m) => m.round === 0);

    await recordResult(db, r0[0].id, { teamAScore: 6, teamBScore: 2 }); // solo 1 de las 2 pistas

    const after = await db.select().from(tournamentMatches).where(eq(tournamentMatches.tournamentId, id));
    expect(after.filter((m) => m.round === 1).every((m) => m.slotA1 === null)).toBe(true);
  });
});

describe('recordResult — clasificados de grupo al cuadro', () => {
  function groupsInput() {
    return {
      name: 'KO Groups', date: '2026-06-15',
      courts: [
        { label: 'P1', order: 1, availableFrom: '10:00', availableTo: '14:00' },
        { label: 'P2', order: 2, availableFrom: '10:00', availableTo: '14:00' },
      ],
      participantPlayerIds: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
      blocks: [{
        order: 1, type: 'fixed_pairs' as const, name: 'Torneo', durationMinutes: 240,
        config: { matchFormat: { kind: 'timed' as const, minutes: 30, tieRule: 'golden_point' as const }, bufferMinutes: 5, knockout: true, advancePerGroup: 1 },
        groupNames: ['A', 'B'],
        pairs: [
          { player1Id: 'a', player2Id: 'b', seed: 1, groupName: 'A' },
          { player1Id: 'c', player2Id: 'd', seed: 2, groupName: 'A' },
          { player1Id: 'e', player2Id: 'f', seed: 3, groupName: 'B' },
          { player1Id: 'g', player2Id: 'h', seed: 4, groupName: 'B' },
        ],
      }],
    };
  }

  it('al cerrar la liguilla rellena los placeholders del cuadro con los ganadores de grupo', async () => {
    const { db } = await createTestDb();
    const id = await createTournament(db, groupsInput());
    await generateAndStore(db, id);

    const all = await db.select().from(tournamentMatches).where(eq(tournamentMatches.tournamentId, id));
    const groupA = all.find((m) => m.phaseTag === 'group:A')!;
    const groupB = all.find((m) => m.phaseTag === 'group:B')!;

    const winnerA = JSON.parse(groupA.slotA1!).pairId as string; // gana A en grupo A
    const winnerB = JSON.parse(groupB.slotB1!).pairId as string; // gana B en grupo B

    await recordResult(db, groupA.id, { teamAScore: 6, teamBScore: 1 }); // gana A
    await recordResult(db, groupB.id, { teamAScore: 1, teamBScore: 6 }); // gana B

    const after = await db.select().from(tournamentMatches).where(eq(tournamentMatches.tournamentId, id));
    const ko = after.find((m) => (m.phaseTag ?? '').startsWith('ko'))!;
    expect(JSON.parse(ko.slotA1!)).toEqual({ type: 'pair', pairId: winnerA });
    expect(JSON.parse(ko.slotB1!)).toEqual({ type: 'pair', pairId: winnerB });
    expect(ko.status).toBe('pending');
  });

  it('no resuelve nada mientras quede liguilla sin cerrar', async () => {
    const { db } = await createTestDb();
    const id = await createTournament(db, groupsInput());
    await generateAndStore(db, id);
    const all = await db.select().from(tournamentMatches).where(eq(tournamentMatches.tournamentId, id));
    const groupA = all.find((m) => m.phaseTag === 'group:A')!;

    await recordResult(db, groupA.id, { teamAScore: 6, teamBScore: 1 }); // falta el grupo B

    const after = await db.select().from(tournamentMatches).where(eq(tournamentMatches.tournamentId, id));
    const ko = after.find((m) => (m.phaseTag ?? '').startsWith('ko'))!;
    expect(JSON.parse(ko.slotA1!).type).toBe('placeholder');
    expect(JSON.parse(ko.slotB1!).type).toBe('placeholder');
  });
});

describe('recordResult — propagación del cuadro', () => {
  it('cuadro de 4 parejas: las semifinales propagan ganadores a la final', async () => {
    const { db } = await createTestDb();
    const id = await createTournament(db, {
      name: 'KO', date: '2026-06-15',
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
    await generateAndStore(db, id);

    const all = await db.select().from(tournamentMatches).where(eq(tournamentMatches.tournamentId, id));
    const semis = all.filter((m) => m.phaseTag === 'ko:r0').sort((a, b) => a.id.localeCompare(b.id));
    const final = all.find((m) => m.phaseTag === 'ko:r1')!;
    expect(semis).toHaveLength(2);

    expect(JSON.parse(final.slotA1!).type).toBe('matchWinner');
    expect(JSON.parse(final.slotB1!).type).toBe('matchWinner');

    const semiWinner = (m: typeof semis[number]) => JSON.parse(m.slotA1!).pairId as string;
    await recordResult(db, semis[0].id, { teamAScore: 6, teamBScore: 4 });
    await recordResult(db, semis[1].id, { teamAScore: 6, teamBScore: 2 });

    const after = await db.select().from(tournamentMatches).where(eq(tournamentMatches.tournamentId, id));
    const finalAfter = after.find((m) => m.phaseTag === 'ko:r1')!;
    const expectedPairs = new Set(semis.map(semiWinner));
    const gotPairs = new Set([
      JSON.parse(finalAfter.slotA1!).pairId,
      JSON.parse(finalAfter.slotB1!).pairId,
    ]);
    expect(JSON.parse(finalAfter.slotA1!).type).toBe('pair');
    expect(JSON.parse(finalAfter.slotB1!).type).toBe('pair');
    expect(gotPairs).toEqual(expectedPairs);

    await recordResult(db, finalAfter.id, { teamAScore: 6, teamBScore: 3 });
    const [champMatch] = await db.select().from(tournamentMatches).where(eq(tournamentMatches.id, finalAfter.id));
    expect(champMatch.winner).toBe('A');
    expect(champMatch.status).toBe('completed');
  });
});

describe('clasificaciones', () => {
  it('getPozoStandings ordena por juegos y desempata por victorias', async () => {
    const { db } = await createTestDb();
    const id = await createTournament(db, {
      name: 'Pozo', date: '2026-06-15',
      courts: [{ label: 'P1', order: 1, availableFrom: '17:00', availableTo: '18:00' }],
      participantPlayerIds: ['p1', 'p2', 'p3', 'p4'],
      blocks: [{
        order: 1, type: 'pozo', name: 'Pozo', durationMinutes: 30,
        config: {
          matchFormat: { kind: 'timed', minutes: 15, tieRule: 'golden_point' },
          bufferMinutes: 0, roundMinutes: 15,
          participantOrder: ['p1', 'p2', 'p3', 'p4'],
        },
      }],
    });
    await generateAndStore(db, id);
    const [block] = await db.select().from(tournamentBlocks).where(eq(tournamentBlocks.tournamentId, id));
    const all = await db.select().from(tournamentMatches).where(eq(tournamentMatches.tournamentId, id));

    const r0 = all.find((m) => m.round === 0)!;
    await recordResult(db, r0.id, { teamAScore: 6, teamBScore: 2 });

    const standings = await getPozoStandings(db, block.id);
    expect(standings).toHaveLength(4);
    expect(standings[0].games).toBe(6);
    expect(standings.find((s) => s.participantId === 'p1')!.wins).toBe(1);
    expect(standings.find((s) => s.participantId === 'p3')!.wins).toBe(0);
    expect(standings[0].rank).toBe(1);
  });

  it('getGroupStandings devuelve la tabla por grupo', async () => {
    const { db } = await createTestDb();
    const id = await createTournament(db, {
      name: 'Grupos', date: '2026-06-15',
      courts: [{ label: 'P1', order: 1, availableFrom: '10:00', availableTo: '14:00' }],
      participantPlayerIds: ['a', 'b', 'c', 'd'],
      blocks: [{
        order: 1, type: 'fixed_pairs', name: 'Liguilla', durationMinutes: 240,
        config: { matchFormat: { kind: 'best_of_3' }, bufferMinutes: 0, knockout: false },
        groupNames: ['A'],
        pairs: [
          { player1Id: 'a', player2Id: 'b', seed: 1, groupName: 'A' },
          { player1Id: 'c', player2Id: 'd', seed: 2, groupName: 'A' },
        ],
      }],
    });
    await generateAndStore(db, id);
    const [block] = await db.select().from(tournamentBlocks).where(eq(tournamentBlocks.tournamentId, id));
    const all = await db.select().from(tournamentMatches).where(eq(tournamentMatches.tournamentId, id));
    const match = all.find((m) => m.phaseTag === 'group:A')!;
    const winnerPair = JSON.parse(match.slotA1!).pairId as string;
    await recordResult(db, match.id, { teamAScore: 2, teamBScore: 0 });

    const tables = await getGroupStandings(db, block.id);
    expect(Object.keys(tables)).toEqual(['A']);
    expect(tables.A).toHaveLength(2);
    expect(tables.A[0].pairId).toBe(winnerPair);
    expect(tables.A[0].points).toBe(3);
    expect(tables.A[0].rank).toBe(1);
  });
});
