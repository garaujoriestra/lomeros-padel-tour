import { test, expect } from '@playwright/test';

type P = { id: string; name: string };

test.describe('paso B · players · lecturas públicas con ?g=', () => {
  test('GET /api/players?g=grupo-test devuelve jugadores de grupo-test, no de Lomeros', async ({ request }) => {
    const res = await request.get('/api/players?g=grupo-test');
    expect(res.ok()).toBeTruthy();
    const names = ((await res.json()) as P[]).map((p) => p.name);
    expect(names).toContain('Jugador GT');
    expect(names).not.toContain('Jugador 1');
  });

  test('GET /api/players (sin g) sigue devolviendo Lomeros', async ({ request }) => {
    const res = await request.get('/api/players');
    const names = ((await res.json()) as P[]).map((p) => p.name);
    expect(names).toContain('Jugador 1');
    expect(names).not.toContain('Jugador GT');
  });

  test('GET /api/players/gt-pl1?g=grupo-test → 200 (público del grupo)', async ({ request }) => {
    const res = await request.get('/api/players/gt-pl1?g=grupo-test');
    expect(res.status()).toBe(200);
  });
});

test.describe('paso B · players · authz como admin de Lomeros', () => {
  test.use({ storageState: 'e2e/.auth/admin.json' });

  test('NO puede crear jugador en grupo-test (403)', async ({ request }) => {
    const res = await request.post('/api/players', { data: { g: 'grupo-test', name: 'Intruso' } });
    expect(res.status()).toBe(403);
  });

  test('crea jugador en SU grupo (sin g) → 201', async ({ request }) => {
    const res = await request.post('/api/players', { data: { name: 'Nuevo Lomeros' } });
    expect(res.status()).toBe(201);
  });

  test('NO puede borrar un jugador de grupo-test (403)', async ({ request }) => {
    const res = await request.delete('/api/players/gt-pl1?g=grupo-test');
    expect(res.status()).toBe(403);
  });
});

test.describe('paso B · players · authz como admin de grupo-test', () => {
  test.use({ storageState: 'e2e/.auth/gt-admin.json' });

  test('crea jugador en grupo-test (g) → 201', async ({ request }) => {
    const res = await request.post('/api/players', { data: { g: 'grupo-test', name: 'Nuevo GT' } });
    expect(res.status()).toBe(201);
  });
});
