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
const { grantSeasonPass } = await import('./queries');

const NOW = new Date('2026-07-12T10:00:00.000Z');

describe('grantSeasonPass (registro + concesión atómica)', () => {
  beforeAll(async () => {
    await client.batch([
      `CREATE TABLE groups (
         id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
         logo_url TEXT, accent_color TEXT, paid_until TEXT,
         created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
      `CREATE TABLE billing_events (
         id TEXT PRIMARY KEY, group_id TEXT NOT NULL, type TEXT NOT NULL,
         created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
    ], 'write');
  });

  beforeEach(async () => {
    await client.batch([`DELETE FROM billing_events`, `DELETE FROM groups`], 'write');
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
  async function countEvents(): Promise<number> {
    const { rows } = await client.execute(`SELECT COUNT(*) AS n FROM billing_events`);
    return Number(rows[0]?.n ?? 0);
  }

  // El paid_until que escribe SQLite debe ser EXACTAMENTE el que produce extendedPaidUntil
  // (toISOString) — misma fuente de verdad, cero divergencia de formato (ms incluidos).
  const cases: Array<[string, string | null]> = [
    ['sin pase (null) → +1 año desde hoy', null],
    ['caducado → +1 año desde hoy', '2026-01-01T00:00:00.000Z'],
    ['vigente → +1 año desde su fin', '2026-12-31T00:00:00.000Z'],
    ['base en año bisiesto (29-feb) → normaliza como JS', '2028-02-29T00:00:00.000Z'],
    ['vigente con ms reales → strftime %f los preserva', '2026-12-31T00:00:00.123Z'],
  ];

  for (const [label, prev] of cases) {
    it(`${label} == extendedPaidUntil`, async () => {
      await seed(prev);
      const granted = await grantSeasonPass('evt_1', 'g', 'checkout.session.completed', NOW);
      expect(granted).toBe(true);
      expect(await readPaidUntil()).toBe(extendedPaidUntil(prev, NOW));
      expect(await countEvents()).toBe(1);
    });
  }

  it('idempotente: el mismo event.id dos veces → 2º false, sin doble extensión', async () => {
    await seed('2026-12-31T00:00:00.000Z');
    const first = await grantSeasonPass('evt_dup', 'g', 'checkout.session.completed', NOW);
    const after1 = await readPaidUntil();
    const second = await grantSeasonPass('evt_dup', 'g', 'checkout.session.completed', NOW);
    const after2 = await readPaidUntil();

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(after1).toBe('2027-12-31T00:00:00.000Z');
    expect(after2).toBe(after1); // no se re-extiende
    expect(await countEvents()).toBe(1); // solo un registro pese a los dos intentos
  });
});
