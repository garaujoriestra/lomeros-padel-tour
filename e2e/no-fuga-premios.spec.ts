import { test, expect } from '@playwright/test';

// Aislamiento entre grupos para premios y canjes. El global-setup crea `gt-reward1`
// (premio de "Grupo Test") y `gt-redemption1` (canje de gt-pl1). Lomeros nunca debe
// verlos ni tocarlos.
test.describe('no-fuga · premios (público)', () => {
  test('el catálogo público no incluye premios de otro grupo', async ({ request }) => {
    const res = await request.get('/api/rewards');
    expect(res.ok()).toBeTruthy();
    const list = (await res.json()) as Array<{ id: string }>;
    expect(list.map((r) => r.id)).not.toContain('gt-reward1');
  });
});

test.describe('no-fuga · premios (admin de Lomeros)', () => {
  test.use({ storageState: 'e2e/.auth/admin.json' });

  test('un admin de Lomeros no puede editar un premio de otro grupo (404)', async ({ request }) => {
    const res = await request.put('/api/rewards/gt-reward1', { data: { cost: 1 } });
    expect(res.status()).toBe(404);
  });

  test('un admin de Lomeros no puede desactivar un premio de otro grupo (404)', async ({ request }) => {
    const res = await request.delete('/api/rewards/gt-reward1');
    expect(res.status()).toBe(404);
  });

  test('la lista de canjes (admin) no incluye canjes de otro grupo', async ({ request }) => {
    const res = await request.get('/api/redemptions?all=1');
    expect(res.ok()).toBeTruthy();
    const list = (await res.json()) as Array<{ id: string }>;
    expect(list.map((r) => r.id)).not.toContain('gt-redemption1');
  });

  test('un admin de Lomeros no puede resolver un canje de otro grupo (404)', async ({ request }) => {
    const res = await request.put('/api/redemptions/gt-redemption1', { data: { status: 'cancelled' } });
    expect(res.status()).toBe(404);
  });
});

test.describe('no-fuga · premios (jugador de Lomeros)', () => {
  test.use({ storageState: 'e2e/.auth/player.json' });

  test('un jugador de Lomeros no puede canjear un premio de otro grupo (404)', async ({ request }) => {
    const res = await request.post('/api/redemptions', { data: { rewardId: 'gt-reward1' } });
    expect(res.status()).toBe(404);
  });
});
