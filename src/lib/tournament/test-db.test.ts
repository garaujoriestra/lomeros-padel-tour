import { describe, it, expect } from 'vitest';
import { createTestDb } from './test-db';
import { tournaments } from '@/lib/db/schema';

describe('createTestDb', () => {
  it('crea las tablas del torneo y permite insertar y leer', async () => {
    const { db } = await createTestDb();
    const [t] = await db.insert(tournaments).values({ name: 'Cumple', date: '2026-06-13' }).returning();
    expect(t.id).toBeTruthy();
    expect(t.status).toBe('draft');
    const all = await db.select().from(tournaments);
    expect(all).toHaveLength(1);
  });
});
