import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';

// createGroupWithAdmin usa el `db` global de @/lib/db, que crea su cliente libsql
// a partir de TURSO_DATABASE_URL AL IMPORTARSE. Lo apuntamos a un fichero temporal
// ANTES del import dinámico (mismo patrón que bank.test.ts, pero aquí sí usamos el
// cliente global porque el DAL no acepta tx externa).
const dbPath = join(tmpdir(), `create-group-test-${process.pid}-${Date.now()}.db`);
process.env.TURSO_DATABASE_URL = `file:${dbPath}`;
const { client } = await import('@/lib/db');
const { createGroupWithAdmin } = await import('./queries');

describe('createGroupWithAdmin', () => {
  beforeAll(async () => {
    // Esquema mínimo (sin FKs: libsql no las fuerza por defecto y aquí no aportan).
    await client.batch([
      `CREATE TABLE groups (
         id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
         created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
      `CREATE TABLE memberships (
         id TEXT PRIMARY KEY, user_id TEXT NOT NULL, group_id TEXT NOT NULL,
         role TEXT NOT NULL DEFAULT 'player', player_id TEXT,
         created_at TEXT NOT NULL DEFAULT (datetime('now')),
         UNIQUE (user_id, group_id))`,
    ], 'write');
  });

  beforeEach(async () => {
    await client.batch([`DELETE FROM memberships`, `DELETE FROM groups`], 'write');
  });

  afterAll(() => {
    client.close();
    for (const suffix of ['', '-wal', '-shm']) {
      try { rmSync(dbPath + suffix); } catch { /* puede no existir */ }
    }
  });

  async function rows(sql: string) {
    return (await client.execute(sql)).rows;
  }

  it('crea el grupo (id = slug) y su membership de admin', async () => {
    const res = await createGroupWithAdmin({ slug: 'panteras', name: 'Panteras', userId: 'u1' });
    expect(res).toEqual({ ok: true });

    const [g] = await rows(`SELECT id, slug, name FROM groups`);
    expect(g).toMatchObject({ id: 'panteras', slug: 'panteras', name: 'Panteras' });
    const [m] = await rows(`SELECT user_id, group_id, role, player_id FROM memberships`);
    expect(m).toMatchObject({ user_id: 'u1', group_id: 'panteras', role: 'admin', player_id: null });
  });

  it('slug ya cogido → error legible (rama del check previo)', async () => {
    await createGroupWithAdmin({ slug: 'panteras', name: 'Panteras', userId: 'u1' });
    const res = await createGroupWithAdmin({ slug: 'panteras', name: 'Otras Panteras', userId: 'u2' });
    expect(res).toEqual({ ok: false, error: 'Ese nombre corto ya está cogido' });
    expect(await rows(`SELECT id FROM groups`)).toHaveLength(1);
    expect(await rows(`SELECT id FROM memberships`)).toHaveLength(1);
  });

  it('carrera: el check pasa pero el INSERT choca con UNIQUE → error legible, no 500', async () => {
    // Grupo preexistente cuyo id colisiona con el slug nuevo pero cuyo slug NO
    // (el check por slug no lo ve): el INSERT falla por UNIQUE del PK.
    await client.execute(`INSERT INTO groups (id, slug, name) VALUES ('panteras', 'panteras-viejas', 'Legacy')`);
    const res = await createGroupWithAdmin({ slug: 'panteras', name: 'Panteras', userId: 'u1' });
    expect(res).toEqual({ ok: false, error: 'Ese nombre corto ya está cogido' });
    expect(await rows(`SELECT id FROM memberships`)).toHaveLength(0);
  });

  it('si la membership falla, la transacción deshace el grupo (sin grupo huérfano sin admin)', async () => {
    // Membership preexistente (user, grupo) que viola UNIQUE(user_id, group_id)
    // al insertar la de admin — sin FKs el grupo puede no existir aún.
    await client.execute(
      `INSERT INTO memberships (id, user_id, group_id, role) VALUES ('m0', 'u1', 'panteras', 'player')`,
    );
    const res = await createGroupWithAdmin({ slug: 'panteras', name: 'Panteras', userId: 'u1' });
    expect(res).toEqual({ ok: false, error: 'Ese nombre corto ya está cogido' });
    // La clave del fix: el INSERT del grupo se revierte, no queda huérfano.
    expect(await rows(`SELECT id FROM groups`)).toHaveLength(0);
  });
});
