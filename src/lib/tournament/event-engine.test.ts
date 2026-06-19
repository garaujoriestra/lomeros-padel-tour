import { describe, it, expect } from 'vitest';
import { createTestDb } from './test-db';
import { createEvent } from './event-store';
import { replacePairs } from './pair-store';
import { generateEvent, recordResult, listEventMatches } from './event-engine';
import type { TorneoConfig, PozoConfig } from './types';

type TestClient = Awaited<ReturnType<typeof createTestDb>>['client'];
async function seedPlayers(client: TestClient, ids: string[]) {
  for (const id of ids) await client.execute({ sql: 'INSERT OR IGNORE INTO players (id, name) VALUES (?, ?)', args: [id, id] });
}

describe('event-engine dispatch', () => {
  it('pozo: genera y lista vía la fachada', async () => {
    const { db, client } = await createTestDb();
    const players = Array.from({ length: 8 }, (_, i) => `a${i + 1}`);
    await seedPlayers(client, players);
    const cfg: PozoConfig = { rounds: 2, matchFormat: { kind: 'timed', minutes: 12, tieRule: 'golden_point' } };
    const id = await createEvent(db, 'lomeros', {
      name: 'P', date: '2026-07-01', location: null, kind: 'pozo', format: 'americano',
      config: cfg, createdBy: null,
      courts: [{ label: 'C1', sortOrder: 1, availableFrom: '17:00', availableTo: '20:00' },
               { label: 'C2', sortOrder: 2, availableFrom: '17:00', availableTo: '20:00' }],
      participantPlayerIds: players,
    });
    await generateEvent(db, id, 1);
    expect((await listEventMatches(db, id)).length).toBe(2);
  });

  it('torneo: genera el cuadro y registra resultado vía la fachada', async () => {
    const { db, client } = await createTestDb();
    const players = Array.from({ length: 8 }, (_, i) => `b${i + 1}`);
    await seedPlayers(client, players);
    const cfg: TorneoConfig = { matchFormat: { kind: 'best_of_3' }, thirdPlace: false };
    const id = await createEvent(db, 'lomeros', {
      name: 'T', date: '2026-07-01', location: null, kind: 'torneo', format: 'single_elim',
      config: cfg, createdBy: null,
      courts: [{ label: 'C1', sortOrder: 1, availableFrom: '17:00', availableTo: '23:00' }],
      participantPlayerIds: players,
    });
    const pairs: [string, string][] = [];
    for (let i = 0; i < players.length; i += 2) pairs.push([players[i], players[i + 1]]);
    await replacePairs(db, id, pairs);

    await generateEvent(db, id, 1);
    const ko = (await listEventMatches(db, id)).filter((m) => m.phaseTag?.startsWith('ko:'));
    expect(ko.length).toBeGreaterThanOrEqual(3);
    const semi = ko.find((m) => m.round === 0 && JSON.parse(m.slotA1!).type === 'pair' && JSON.parse(m.slotB1!).type === 'pair')!;
    await recordResult(db, semi.id, 2, 0);
    expect((await listEventMatches(db, id)).find((m) => m.id === semi.id)!.status).toBe('completed');
  });
});
