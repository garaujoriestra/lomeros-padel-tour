import { describe, it, expect, beforeEach } from 'vitest';
import { createClient, type Client } from '@libsql/client';
import { migrateMultitenant } from './multitenant';
import { LOMEROS_GROUP_ID, LOMEROS_GROUP_SLUG } from '@/lib/groups/constants';

// Crea un esquema pre-migración mínimo y lo siembra con datos sin group_id.
async function seedPreMigration(client: Client) {
  await client.execute(`CREATE TABLE players (id TEXT PRIMARY KEY, name TEXT NOT NULL)`);
  await client.execute(`CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, role TEXT NOT NULL DEFAULT 'player', player_id TEXT)`);
  await client.execute(`CREATE TABLE matches (id TEXT PRIMARY KEY, date TEXT NOT NULL)`);
  await client.execute(`CREATE TABLE rewards (id TEXT PRIMARY KEY, title TEXT NOT NULL)`);
  await client.execute(`CREATE TABLE tournaments (id TEXT PRIMARY KEY, name TEXT NOT NULL)`);

  await client.execute(`INSERT INTO players (id, name) VALUES ('p1','Ana'), ('p2','Bea')`);
  await client.execute(`INSERT INTO users (id, email, role, player_id) VALUES ('u1','admin@x.com','admin','p1'), ('u2','bea@x.com','player','p2')`);
  await client.execute(`INSERT INTO matches (id, date) VALUES ('m1','2026-01-01')`);
  await client.execute(`INSERT INTO rewards (id, title) VALUES ('r1','Cerveza')`);
  await client.execute(`INSERT INTO tournaments (id, name) VALUES ('t1','Open')`);
}

describe('migrateMultitenant', () => {
  let client: Client;
  beforeEach(async () => {
    client = createClient({ url: ':memory:' });
    await seedPreMigration(client);
  });

  it('crea el grupo Lomeros como grupo #1', async () => {
    await migrateMultitenant(client);
    const res = await client.execute(`SELECT id, slug FROM groups`);
    expect(res.rows.length).toBe(1);
    expect(res.rows[0][0]).toBe(LOMEROS_GROUP_ID);
    expect(res.rows[0][1]).toBe(LOMEROS_GROUP_SLUG);
  });

  it('backfilla una membership en Lomeros por cada user, preservando role y player_id', async () => {
    await migrateMultitenant(client);
    const res = await client.execute(`SELECT user_id, group_id, role, player_id FROM memberships ORDER BY user_id`);
    expect(res.rows.length).toBe(2);
    expect(res.rows[0][0]).toBe('u1');
    expect(res.rows[0][1]).toBe(LOMEROS_GROUP_ID);
    expect(res.rows[0][2]).toBe('admin');
    expect(res.rows[0][3]).toBe('p1');
    expect(res.rows[1][0]).toBe('u2');
    expect(res.rows[1][2]).toBe('player');
    expect(res.rows[1][3]).toBe('p2');
  });

  it('añade group_id=Lomeros a todas las filas de las tablas raíz tenant', async () => {
    await migrateMultitenant(client);
    for (const table of ['players', 'matches', 'rewards', 'tournaments']) {
      const withGroup = await client.execute(`SELECT count(*) FROM ${table} WHERE group_id = '${LOMEROS_GROUP_ID}'`);
      const all = await client.execute(`SELECT count(*) FROM ${table}`);
      expect(Number(all.rows[0][0])).toBeGreaterThan(0);
      expect(Number(withGroup.rows[0][0])).toBe(Number(all.rows[0][0]));
    }
  });

  it('aplica group_id=Lomeros por DEFAULT a inserts que lo omiten (red de seguridad)', async () => {
    await migrateMultitenant(client);
    await client.execute(`INSERT INTO players (id, name) VALUES ('p3','Caro')`);
    const res = await client.execute(`SELECT group_id FROM players WHERE id = 'p3'`);
    expect(res.rows[0][0]).toBe(LOMEROS_GROUP_ID);
  });

  it('NO cuela en Lomeros a users que ya son miembros de OTRO grupo (re-run multi-grupo)', async () => {
    await migrateMultitenant(client);
    // Simula un mundo multi-grupo posterior: user nuevo que solo pertenece a otro grupo.
    await client.execute(`INSERT INTO groups (id, slug, name) VALUES ('otro','otro','Otro Grupo')`);
    await client.execute(`INSERT INTO users (id, email) VALUES ('u3','ana@otro.com')`);
    await client.execute(`INSERT INTO memberships (id, user_id, group_id, role) VALUES ('mb3','u3','otro','admin')`);

    await migrateMultitenant(client);
    const res = await client.execute(`SELECT group_id FROM memberships WHERE user_id = 'u3'`);
    expect(res.rows.map((r) => r[0])).toEqual(['otro']);
  });

  it('es idempotente: ejecutarla dos veces no duplica ni falla', async () => {
    await migrateMultitenant(client);
    const report = await migrateMultitenant(client);
    expect(report.groupsTotal).toBe(1);
    expect(report.usersTotal).toBe(2);
    expect(report.membershipsTotal).toBe(2);
    expect(report.tables.players).toEqual({ total: 2, withGroup: 2 });
  });
});
