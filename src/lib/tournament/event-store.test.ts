import { describe, it, expect } from 'vitest';
import { createTestDb } from './test-db';
import { createEvent, loadEvent, listEvents, listEventSummaries, updateEvent, deleteEvent } from './event-store';
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
    // Invariante: updateEvent NO cambia kind/format.
    expect(loaded.kind).toBe('pozo');
    expect(loaded.format).toBe('americano');
  });

  it('listEventSummaries devuelve eventos ordenados por fecha DESC con conteo de partidos (sin N+1)', async () => {
    const { db, client } = await createTestDb();
    await seedPlayers(client, ['p1', 'p2', 'p3', 'p4']);

    // Evento más antiguo: con partidos (1 completado + 1 pendiente).
    const older = await createEvent(db, {
      name: 'Pozo viejo', date: '2026-07-01', location: 'Club', kind: 'pozo', format: 'americano',
      config: { rounds: 2, matchFormat: { kind: 'timed', minutes: 12, tieRule: 'golden_point' } },
      createdBy: null,
      courts: [{ label: 'C1', sortOrder: 1, availableFrom: '17:00', availableTo: '20:00' }],
      participantPlayerIds: ['p1', 'p2', 'p3', 'p4'],
    });
    // Evento más reciente: sin partidos generados.
    const newer = await createEvent(db, {
      name: 'Torneo nuevo', date: '2026-08-15', location: null, kind: 'torneo', format: 'single_elim',
      config: { matchFormat: { kind: 'best_of_3' }, thirdPlace: false },
      createdBy: null,
      courts: [{ label: 'C1', sortOrder: 1, availableFrom: '17:00', availableTo: '20:00' }],
      participantPlayerIds: ['p1', 'p2', 'p3', 'p4'],
    });

    // Sembramos partidos del evento viejo: uno completado, uno pendiente.
    await client.execute({ sql: 'INSERT INTO tournament_matches (id, tournament_id, round, status) VALUES (?, ?, ?, ?)', args: ['m1', older, 1, 'completed'] });
    await client.execute({ sql: 'INSERT INTO tournament_matches (id, tournament_id, round, status) VALUES (?, ?, ?, ?)', args: ['m2', older, 1, 'pending'] });

    const summaries = await listEventSummaries(db);
    // Orden por fecha DESC: el nuevo (agosto) primero.
    expect(summaries.map((s) => s.name)).toEqual(['Torneo nuevo', 'Pozo viejo']);

    const newerSummary = summaries.find((s) => s.id === newer)!;
    expect(newerSummary.kind).toBe('torneo');
    expect(newerSummary.format).toBe('single_elim');
    expect(newerSummary.status).toBe('draft');
    expect(newerSummary.totalMatches).toBe(0);
    expect(newerSummary.completedMatches).toBe(0);

    const olderSummary = summaries.find((s) => s.id === older)!;
    expect(olderSummary.kind).toBe('pozo');
    expect(olderSummary.location).toBe('Club');
    expect(olderSummary.totalMatches).toBe(2);
    expect(olderSummary.completedMatches).toBe(1);
  });

  it('loadEvent lanza si el evento no existe', async () => {
    const { db } = await createTestDb();
    await expect(loadEvent(db, 'no-existe')).rejects.toThrow('NOT_FOUND');
  });

  it('deleteEvent borra el evento y TODOS sus hijos (FK OFF → borrado explícito)', async () => {
    const { db, client } = await createTestDb();
    await seedPlayers(client, ['p1', 'p2', 'p3', 'p4']);
    const id = await createEvent(db, {
      name: 'A borrar', date: '2026-07-01', location: null, kind: 'pozo', format: 'fixed_pairs',
      config: { rounds: 3, matchFormat: { kind: 'timed', minutes: 12, tieRule: 'golden_point' } },
      createdBy: null,
      courts: [{ label: 'C1', sortOrder: 1, availableFrom: '17:00', availableTo: '20:00' }],
      participantPlayerIds: ['p1', 'p2', 'p3', 'p4'],
    });

    // Otro evento que NO debe verse afectado por el borrado.
    const other = await createEvent(db, {
      name: 'Intacto', date: '2026-07-02', location: null, kind: 'pozo', format: 'americano',
      config: { rounds: 3, matchFormat: { kind: 'timed', minutes: 12, tieRule: 'golden_point' } },
      createdBy: null,
      courts: [{ label: 'C1', sortOrder: 1, availableFrom: '17:00', availableTo: '20:00' }],
      participantPlayerIds: ['p1', 'p2'],
    });

    // Sembramos grupo, pareja y partido directamente (no hay helper en el store para esto).
    await client.execute({ sql: 'INSERT INTO tournament_groups (id, tournament_id, name) VALUES (?, ?, ?)', args: ['g1', id, 'A'] });
    await client.execute({ sql: 'INSERT INTO tournament_pairs (id, tournament_id, player1_id, player2_id, group_id) VALUES (?, ?, ?, ?, ?)', args: ['pr1', id, 'p1', 'p2', 'g1'] });
    await client.execute({ sql: 'INSERT INTO tournament_matches (id, tournament_id, round) VALUES (?, ?, ?)', args: ['m1', id, 1] });

    async function count(table: string, tid: string): Promise<number> {
      const res = await client.execute({ sql: `SELECT COUNT(*) AS n FROM ${table} WHERE tournament_id = ?`, args: [tid] });
      return Number(res.rows[0].n);
    }

    // Precondición: el evento y sus hijos existen.
    expect(await count('tournament_courts', id)).toBe(1);
    expect(await count('tournament_participants', id)).toBe(4);
    expect(await count('tournament_groups', id)).toBe(1);
    expect(await count('tournament_pairs', id)).toBe(1);
    expect(await count('tournament_matches', id)).toBe(1);

    await deleteEvent(db, id);

    // El evento ya no existe.
    await expect(loadEvent(db, id)).rejects.toThrow('NOT_FOUND');
    const rows = await client.execute({ sql: 'SELECT COUNT(*) AS n FROM tournaments WHERE id = ?', args: [id] });
    expect(Number(rows.rows[0].n)).toBe(0);

    // Todos los hijos del evento borrado han desaparecido.
    expect(await count('tournament_courts', id)).toBe(0);
    expect(await count('tournament_participants', id)).toBe(0);
    expect(await count('tournament_groups', id)).toBe(0);
    expect(await count('tournament_pairs', id)).toBe(0);
    expect(await count('tournament_matches', id)).toBe(0);

    // El otro evento queda intacto.
    await expect(loadEvent(db, other)).resolves.toMatchObject({ name: 'Intacto' });
    expect(await count('tournament_courts', other)).toBe(1);
    expect(await count('tournament_participants', other)).toBe(2);
  });
});
