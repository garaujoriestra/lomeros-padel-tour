import { describe, it, expect } from 'vitest';
import { createTestDb } from './test-db';
import { createEvent } from './event-store';
import { loadPairs, replacePairs } from './pair-store';
import type { PozoConfig } from './types';

type TestDb = Awaited<ReturnType<typeof createTestDb>>['db'];

const CFG: PozoConfig = { rounds: 3, matchFormat: { kind: 'timed', minutes: 12, tieRule: 'golden_point' } };

async function makeEvent(db: TestDb) {
  return createEvent(db, {
    name: 'P', date: '2026-07-01', location: null, kind: 'pozo', format: 'fixed_pairs',
    config: CFG, createdBy: null,
    courts: [{ label: 'C1', sortOrder: 1, availableFrom: '17:00', availableTo: '20:00' }],
    participantPlayerIds: ['p1', 'p2', 'p3', 'p4'],
  });
}

describe('pair-store', () => {
  it('replacePairs inserta y loadPairs devuelve las parejas', async () => {
    const { db } = await createTestDb();
    const id = await makeEvent(db);
    await replacePairs(db, id, [['p1', 'p2'], ['p3', 'p4']]);
    const pairs = await loadPairs(db, id);
    expect(pairs.length).toBe(2);
    expect(pairs.every((p) => typeof p.id === 'string' && p.id.length > 0)).toBe(true);
    const flat = pairs.flatMap((p) => [p.player1Id, p.player2Id]).sort();
    expect(flat).toEqual(['p1', 'p2', 'p3', 'p4']);
  });

  it('replacePairs reemplaza el set anterior (no acumula)', async () => {
    const { db } = await createTestDb();
    const id = await makeEvent(db);
    await replacePairs(db, id, [['p1', 'p2'], ['p3', 'p4']]);
    await replacePairs(db, id, [['p1', 'p3']]);
    const pairs = await loadPairs(db, id);
    expect(pairs.length).toBe(1);
    expect([pairs[0].player1Id, pairs[0].player2Id].sort()).toEqual(['p1', 'p3']);
  });
});
