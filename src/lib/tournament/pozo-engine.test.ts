import { describe, it, expect } from 'vitest';
import { createTestDb } from './test-db';
import { createEvent } from './event-store';
import { replacePairs } from './pair-store';
import { generatePozo, recordPozoResult, listPozoMatches, pozoStandingsLive } from './pozo-engine';
import type { PozoConfig, TorneoConfig } from './types';
import { tournamentMatches } from '@/lib/db/schema';

type TestClient = Awaited<ReturnType<typeof createTestDb>>['client'];

const CFG: PozoConfig = { rounds: 2, matchFormat: { kind: 'timed', minutes: 15, tieRule: 'golden_point' } };

async function seedPlayers(client: TestClient, ids: string[]) {
  for (const id of ids) await client.execute({ sql: 'INSERT OR IGNORE INTO players (id, name) VALUES (?, ?)', args: [id, id] });
}

describe('pozo-engine dispatch', () => {
  it('americano: genera con slots de participante y registra resultado', async () => {
    const { db, client } = await createTestDb();
    const players = Array.from({ length: 8 }, (_, i) => `a${i + 1}`);
    await seedPlayers(client, players);
    const id = await createEvent(db, 'lomeros', {
      name: 'A', date: '2026-07-01', location: null, kind: 'pozo', format: 'americano',
      config: CFG, createdBy: null,
      courts: [{ label: 'C1', sortOrder: 1, availableFrom: '17:00', availableTo: '20:00' },
               { label: 'C2', sortOrder: 2, availableFrom: '17:00', availableTo: '20:00' }],
      participantPlayerIds: players,
    });
    await generatePozo(db, id, 1);
    const r0 = await listPozoMatches(db, id, 0);
    expect(r0.length).toBe(2);
    expect(JSON.parse(r0[0].slotA1!).type).toBe('participant');
    await recordPozoResult(db, r0[0].id, 4, 2);
    expect((await listPozoMatches(db, id, 0))[0].status).toBe('completed');
    expect((await pozoStandingsLive(db, id)).length).toBe(8);
  });

  it('recordPozoResult rechaza un partido cuyo evento no es un pozo', async () => {
    const { db, client } = await createTestDb();
    await seedPlayers(client, ['t1', 't2', 't3', 't4']);
    const torneoCfg: TorneoConfig = { matchFormat: { kind: 'best_of_3' }, thirdPlace: false };
    const id = await createEvent(db, 'lomeros', {
      name: 'T', date: '2026-07-01', location: null, kind: 'torneo', format: 'single_elim',
      config: torneoCfg, createdBy: null,
      courts: [{ label: 'C1', sortOrder: 1, availableFrom: '17:00', availableTo: '20:00' }],
      participantPlayerIds: ['t1', 't2', 't3', 't4'],
    });
    const matchId = crypto.randomUUID();
    await db.insert(tournamentMatches).values({
      id: matchId, tournamentId: id, courtId: null, round: 0, phaseTag: 'ko:r1', status: 'pending',
    });
    await expect(recordPozoResult(db, matchId, 4, 2)).rejects.toThrow(/NOT_POZO/);
  });

  it('parejas fijas: genera con slots de pareja y registra resultado', async () => {
    const { db, client } = await createTestDb();
    const players = Array.from({ length: 8 }, (_, i) => `b${i + 1}`);
    await seedPlayers(client, players);
    const id = await createEvent(db, 'lomeros', {
      name: 'B', date: '2026-07-01', location: null, kind: 'pozo', format: 'fixed_pairs',
      config: CFG, createdBy: null,
      courts: [{ label: 'C1', sortOrder: 1, availableFrom: '17:00', availableTo: '20:00' },
               { label: 'C2', sortOrder: 2, availableFrom: '17:00', availableTo: '20:00' }],
      participantPlayerIds: players,
    });
    const pairs: [string, string][] = [];
    for (let i = 0; i < players.length; i += 2) pairs.push([players[i], players[i + 1]]);
    await replacePairs(db, id, pairs);

    await generatePozo(db, id, 1);
    const r0 = await listPozoMatches(db, id, 0);
    expect(JSON.parse(r0[0].slotA1!).type).toBe('pair');
    await recordPozoResult(db, r0[0].id, 4, 2);
    expect((await listPozoMatches(db, id, 0))[0].status).toBe('completed');
    expect((await pozoStandingsLive(db, id)).length).toBe(4); // por parejas
  });
});
