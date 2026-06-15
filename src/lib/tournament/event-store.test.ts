import { describe, it, expect } from 'vitest';
import { createTestDb } from './test-db';
import { createEvent, loadEvent, listEvents, updateEvent } from './event-store';
import type { PozoConfig } from './types';

describe('schema nuevo (event)', () => {
  it('tournaments tiene kind/format/config y no existe tournament_blocks', async () => {
    const { client } = await createTestDb();
    const cols = await client.execute(`PRAGMA table_info(tournaments)`);
    const names = cols.rows.map((r) => r.name as string);
    expect(names).toContain('kind');
    expect(names).toContain('format');
    expect(names).toContain('config');

    const blocks = await client.execute(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='tournament_blocks'`,
    );
    expect(blocks.rows.length).toBe(0);

    const pairs = await client.execute(`PRAGMA table_info(tournament_pairs)`);
    expect(pairs.rows.map((r) => r.name as string)).toContain('tournament_id');

    const groups = await client.execute(`PRAGMA table_info(tournament_groups)`);
    expect(groups.rows.map((r) => r.name as string)).toContain('tournament_id');
  });
});

async function seedPlayers(client: import('@libsql/client').Client, ids: string[]) {
  for (const id of ids) {
    await client.execute({ sql: 'INSERT OR IGNORE INTO players (id, name) VALUES (?, ?)', args: [id, id.toUpperCase()] });
  }
}

describe('event-store', () => {
  it('crea un pozo y lo recarga con pistas, participantes y config', async () => {
    const { db, client } = await createTestDb();
    await seedPlayers(client, ['p1', 'p2', 'p3', 'p4']);

    const id = await createEvent(db, {
      name: 'Pozo del jueves', date: '2026-07-01', location: 'Club',
      kind: 'pozo', format: 'americano',
      config: { rounds: 4, matchFormat: { kind: 'timed', minutes: 12, tieRule: 'golden_point' } } as PozoConfig,
      createdBy: null,
      courts: [
        { label: 'Central', sortOrder: 1, availableFrom: '17:00', availableTo: '20:00' },
        { label: 'Pista 8', sortOrder: 2, availableFrom: '17:00', availableTo: '20:00' },
      ],
      participantPlayerIds: ['p1', 'p2', 'p3', 'p4'],
    });

    const loaded = await loadEvent(db, id);
    expect(loaded.kind).toBe('pozo');
    expect(loaded.format).toBe('americano');
    expect((loaded.config as PozoConfig).rounds).toBe(4);
    expect(loaded.courts.map((c) => c.label)).toEqual(['Central', 'Pista 8']);
    expect(loaded.participantPlayerIds.sort()).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(loaded.status).toBe('draft');
  });

  it('lista eventos filtrando por kind', async () => {
    const { db, client } = await createTestDb();
    await seedPlayers(client, ['p1', 'p2']);
    function baseInput(name: string, kind: 'pozo' | 'torneo', format: string) {
      return {
        name, date: '2026-07-01', location: null, kind, format,
        config: kind === 'pozo'
          ? { rounds: 3, matchFormat: { kind: 'timed', minutes: 12, tieRule: 'golden_point' } }
          : { matchFormat: { kind: 'best_of_3' }, thirdPlace: false },
        createdBy: null,
        courts: [{ label: 'C1', sortOrder: 1, availableFrom: '17:00', availableTo: '20:00' }],
        participantPlayerIds: ['p1', 'p2'],
      } as Parameters<typeof createEvent>[1];
    }
    await createEvent(db, baseInput('A', 'pozo', 'americano'));
    await createEvent(db, baseInput('B', 'torneo', 'single_elim'));
    const pozos = await listEvents(db, 'pozo');
    expect(pozos.map((e) => e.name)).toEqual(['A']);
    const torneos = await listEvents(db, 'torneo');
    expect(torneos.map((e) => e.name)).toEqual(['B']);
  });

  it('updateEvent reemplaza meta, pistas y participantes (no toca kind/format)', async () => {
    const { db, client } = await createTestDb();
    await seedPlayers(client, ['p1', 'p2', 'p3']);
    const id = await createEvent(db, {
      name: 'X', date: '2026-07-01', location: null, kind: 'pozo', format: 'americano',
      config: { rounds: 3, matchFormat: { kind: 'timed', minutes: 12, tieRule: 'golden_point' } },
      createdBy: null,
      courts: [{ label: 'C1', sortOrder: 1, availableFrom: '17:00', availableTo: '20:00' }],
      participantPlayerIds: ['p1', 'p2'],
    });
    await updateEvent(db, id, {
      name: 'X2', date: '2026-07-02', location: 'Sitio',
      config: { rounds: 5, matchFormat: { kind: 'timed', minutes: 10, tieRule: 'golden_point' } },
      courts: [{ label: 'C1', sortOrder: 1, availableFrom: '18:00', availableTo: '21:00' }],
      participantPlayerIds: ['p1', 'p2', 'p3'],
    });
    const loaded = await loadEvent(db, id);
    expect(loaded.name).toBe('X2');
    expect((loaded.config as PozoConfig).rounds).toBe(5);
    expect(loaded.participantPlayerIds.length).toBe(3);
    expect(loaded.courts[0].availableFrom).toBe('18:00');
  });
});
