import { test, expect } from '@playwright/test';

// Verifica que las rutas de jugador (me, bets, redemptions) sean group-aware:
// - lecturas públicas con ?g= quedan dentro del grupo correcto
// - un jugador de Lomeros NO puede acceder a datos de grupo-test (403)
// - un admin de grupo-test sin ficha recibe 403 en rutas que requieren ficha
// - un jugador de grupo-test con ficha puede leer sus propios datos en grupo-test
// - el comportamiento de Lomeros sin ?g= queda intacto

test.describe('paso B2 · bets · lecturas públicas con ?g=', () => {
  test('GET /api/bets?matchId=gt-match1&g=grupo-test → 200 (partido en ese grupo)', async ({ request }) => {
    const res = await request.get('/api/bets?matchId=gt-match1&g=grupo-test');
    expect(res.status()).toBe(200);
  });

  test('GET /api/bets?matchId=gt-match1 (sin g) → 404 (partido no está en Lomeros)', async ({ request }) => {
    const res = await request.get('/api/bets?matchId=gt-match1');
    expect(res.status()).toBe(404);
  });
});

test.describe('paso B2 · bets · cross-group 403 (Lomeros player → grupo-test)', () => {
  test.use({ storageState: 'e2e/.auth/player.json' });

  test('GET /api/bets?mine=1&g=grupo-test → 403 (jugador de Lomeros sin membership en grupo-test)', async ({ request }) => {
    const res = await request.get('/api/bets?mine=1&g=grupo-test');
    expect(res.status()).toBe(403);
  });
});

test.describe('paso B2 · me · no-ficha 403 (admin de grupo-test sin ficha)', () => {
  test.use({ storageState: 'e2e/.auth/gt-admin.json' });

  test('PATCH /api/me con g=grupo-test → 403 (admin sin ficha vinculada)', async ({ request }) => {
    const res = await request.patch('/api/me', {
      data: { g: 'grupo-test', nickname: 'IntentoCambioNick' },
    });
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('Sin jugador vinculado');
  });
});

test.describe('paso B2 · player positivo (grupo-test player con ficha gt-pl1)', () => {
  test.use({ storageState: 'e2e/.auth/gt-player.json' });

  test('GET /api/redemptions?g=grupo-test → 200 con canjes de gt-pl1', async ({ request }) => {
    const res = await request.get('/api/redemptions?g=grupo-test');
    expect(res.status()).toBe(200);
    const rows = await res.json();
    expect(Array.isArray(rows)).toBeTruthy();
    // gt-redemption1 fue sembrado en global-setup para gt-pl1
    const ids = rows.map((r: { id: string }) => r.id);
    expect(ids).toContain('gt-redemption1');
  });

  test('GET /api/bets?mine=1&g=grupo-test → 200 con apuestas de gt-pl1', async ({ request }) => {
    const res = await request.get('/api/bets?mine=1&g=grupo-test');
    expect(res.status()).toBe(200);
    const rows = await res.json();
    expect(Array.isArray(rows)).toBeTruthy();
    // gt-bet1 fue sembrado en global-setup para gt-pl1
    const ids = rows.map((b: { id: string }) => b.id);
    expect(ids).toContain('gt-bet1');
  });
});

test.describe('paso B2 · behavior-preserving (Lomeros player sin ?g)', () => {
  test.use({ storageState: 'e2e/.auth/player.json' });

  test('GET /api/bets?mine=1 (sin g) → 200 (Lomeros player, comportamiento inalterado)', async ({ request }) => {
    const res = await request.get('/api/bets?mine=1');
    expect(res.status()).toBe(200);
    expect(Array.isArray(await res.json())).toBeTruthy();
  });
});
