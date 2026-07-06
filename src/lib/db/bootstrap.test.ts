import { createClient } from '@libsql/client';
import { describe, expect, it } from 'vitest';
import { ensureAuxTables } from './bootstrap';

describe('ensureAuxTables', () => {
  it('crea las tablas auxiliares y es idempotente', async () => {
    const client = createClient({ url: ':memory:' });
    // Tablas base mínimas que ensureAuxTables asume existentes (las crea init-db en real).
    await client.execute('CREATE TABLE players (id TEXT PRIMARY KEY, name TEXT)');
    await client.execute('CREATE TABLE matches (id TEXT PRIMARY KEY)');

    await ensureAuxTables(client);
    await ensureAuxTables(client); // 2ª pasada no debe romper

    const t = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN " +
        "('bets','token_ledger','rewards','redemptions','penalties','push_subscriptions','player_achievements','courts','planner_slots')",
    );
    expect(t.rows.length).toBe(9);

    const cols = await client.execute('PRAGMA table_info(players)');
    const names = cols.rows.map((r) => r.name as string);
    expect(names).toContain('juega_padel');
    expect(names).toContain('token_balance');
  });
});
