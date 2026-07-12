import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';
import { extendedPaidUntil } from '@/lib/billing/pass';

// Mismo patrón file-SQLite que create-group-with-admin.test.ts: apuntamos el `db`
// global a un fichero temporal ANTES del import dinámico del DAL.
const dbPath = join(tmpdir(), `queries-test-${process.pid}-${Date.now()}.db`);
process.env.TURSO_DATABASE_URL = `file:${dbPath}`;
const { client } = await import('@/lib/db');
const { extendGroupPass } = await import('./queries');

const NOW = new Date('2026-07-12T10:00:00.000Z');

describe('extendGroupPass (UPDATE atómica)', () => {
  beforeAll(async () => {
    await client.execute(
      `CREATE TABLE groups (
         id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
         logo_url TEXT, accent_color TEXT, paid_until TEXT,
         created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
    );
  });

  beforeEach(async () => {
    await client.execute(`DELETE FROM groups`);
  });

  afterAll(() => {
    client.close();
    for (const suffix of ['', '-wal', '-shm']) {
      try { rmSync(dbPath + suffix); } catch { /* puede no existir */ }
    }
  });

  async function seed(paidUntil: string | null) {
    await client.execute({
      sql: `INSERT INTO groups (id, slug, name, paid_until) VALUES ('g', 'g', 'G', ?)`,
      args: [paidUntil],
    });
  }
  async function readPaidUntil(): Promise<string | null> {
    const { rows } = await client.execute(`SELECT paid_until FROM groups WHERE id = 'g'`);
    return (rows[0]?.paid_until as string | null) ?? null;
  }

  // La UPDATE en SQLite debe producir EXACTAMENTE el mismo string que extendedPaidUntil
  // (toISOString) — misma fuente de verdad, cero divergencia de formato.
  const cases: Array<[string, string | null]> = [
    ['sin pase (null) → +1 año desde hoy', null],
    ['caducado → +1 año desde hoy', '2026-01-01T00:00:00.000Z'],
    ['vigente → +1 año desde su fin', '2026-12-31T00:00:00.000Z'],
    ['base en año bisiesto (29-feb) → normaliza como JS', '2028-02-29T00:00:00.000Z'],
  ];

  for (const [label, prev] of cases) {
    it(`${label} == extendedPaidUntil`, async () => {
      await seed(prev);
      await extendGroupPass('g', NOW);
      expect(await readPaidUntil()).toBe(extendedPaidUntil(prev, NOW));
    });
  }
});
