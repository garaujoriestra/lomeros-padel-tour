import { createClient } from '@libsql/client';
import { test, expect } from '@playwright/test';
import { TEST_ENV } from '../playwright.config';

test('seed-staging crea el Grupo Demo y es idempotente', async ({ request }) => {
  const res1 = await request.post('/api/dev/seed-staging');
  expect(res1.status()).toBe(200);
  const j1 = await res1.json();
  expect(j1.ok).toBe(true);
  expect(j1.demoGroup).toBe('grupo-demo');

  // 2ª pasada no rompe.
  const res2 = await request.post('/api/dev/seed-staging');
  expect(res2.status()).toBe(200);

  // Verificación directa en la DB de fichero.
  const db = createClient({ url: TEST_ENV.DB_URL });
  const g = await db.execute({ sql: 'SELECT name FROM groups WHERE id = ?', args: ['grupo-demo'] });
  expect(g.rows.length).toBe(1);
  const pls = await db.execute({
    sql: 'SELECT COUNT(*) AS c FROM players WHERE group_id = ?',
    args: ['grupo-demo'],
  });
  expect(Number(pls.rows[0].c)).toBe(4);
});
