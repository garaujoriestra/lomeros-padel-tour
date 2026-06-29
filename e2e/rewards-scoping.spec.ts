import { test, expect } from '@playwright/test';

type R = { id: string; title: string };

test.describe('paso B2 · rewards · lecturas públicas con ?g=', () => {
  test('GET /api/rewards?g=grupo-test → 200, incluye "Premio GT"', async ({ request }) => {
    const res = await request.get('/api/rewards?g=grupo-test');
    expect(res.ok()).toBeTruthy();
    const titles = ((await res.json()) as R[]).map((r) => r.title);
    expect(titles).toContain('Premio GT');
  });

  test('GET /api/rewards (sin g) → no incluye "Premio GT" (Lomeros por defecto)', async ({ request }) => {
    const res = await request.get('/api/rewards');
    expect(res.ok()).toBeTruthy();
    const ids = ((await res.json()) as R[]).map((r) => r.id);
    expect(ids).not.toContain('gt-reward1');
  });
});

test.describe('paso B2 · rankings · smoke con ?g=', () => {
  test('GET /api/rankings?g=grupo-test → 200', async ({ request }) => {
    const res = await request.get('/api/rankings?g=grupo-test');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('individual');
    expect(body).toHaveProperty('pairs');
  });
});

test.describe('paso B2 · rewards · authz como admin de Lomeros', () => {
  test.use({ storageState: 'e2e/.auth/admin.json' });

  test('NO puede crear premio en grupo-test (403)', async ({ request }) => {
    const res = await request.post('/api/rewards', {
      data: { g: 'grupo-test', title: 'Intruso', cost: 50 },
    });
    expect(res.status()).toBe(403);
  });
});

test.describe('paso B2 · rewards · authz como admin de grupo-test', () => {
  test.use({ storageState: 'e2e/.auth/gt-admin.json' });

  test('crea premio en grupo-test → 201', async ({ request }) => {
    const res = await request.post('/api/rewards', {
      data: { g: 'grupo-test', title: 'Premio Nuevo GT', cost: 50 },
    });
    expect(res.status()).toBe(201);
    const body = await res.json() as R;
    expect(body.title).toBe('Premio Nuevo GT');
  });
});
