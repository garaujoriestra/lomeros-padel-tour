import { describe, it, expect } from 'vitest';
import { createTestDb } from './test-db';

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
  });
});
