import { test, expect } from '@playwright/test';

// Aislamiento entre grupos para La Timba. El global-setup crea en "Grupo Test" un
// partido `gt-match1`, una apuesta abierta `gt-bet1` de `gt-pl1`, y una penalización
// pendiente suya. Lomeros (grupo por defecto) nunca debe verlos ni tocarlos.
test.describe('no-fuga · timba (público)', () => {
  test('las apuestas de un partido de otro grupo no se exponen (404)', async ({ request }) => {
    const res = await request.get('/api/bets?matchId=gt-match1');
    expect(res.status()).toBe(404);
  });
});

test.describe('no-fuga · timba (admin de Lomeros)', () => {
  test.use({ storageState: 'e2e/.auth/admin.json' });

  test('un admin de Lomeros no puede dar entrada a un jugador de otro grupo (404)', async ({ request }) => {
    const res = await request.post('/api/timba/entry', { data: { playerId: 'gt-pl1' } });
    expect(res.status()).toBe(404);
  });
});

test.describe('no-fuga · timba (jugador de Lomeros)', () => {
  test.use({ storageState: 'e2e/.auth/player.json' });

  test('un jugador de Lomeros no puede apostar en un partido de otro grupo (404)', async ({ request }) => {
    const res = await request.post('/api/bets', {
      data: { matchId: 'gt-match1', market: 'winner', predictedTeam: 1, amount: 20 },
    });
    expect(res.status()).toBe(404);
  });
});
