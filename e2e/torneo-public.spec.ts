import { test, expect } from '@playwright/test';

test('vista pública del torneo: solo lectura + tu próximo partido', async ({ browser }) => {
  const adminCtx = await browser.newContext({ storageState: 'e2e/.auth/admin.json' });
  const adminPage = await adminCtx.newPage();
  const create = await adminPage.request.post('/api/tournaments', {
    data: {
      name: 'E2E Torneo Público', date: '2026-08-03', location: null, kind: 'torneo', format: 'single_elim',
      config: { matchFormat: { kind: 'best_of_3' }, thirdPlace: false },
      courts: [{ label: 'Central', order: 1, availableFrom: '17:00', availableTo: '23:00' }],
      participantPlayerIds: ['pl1', 'pl2', 'pl3', 'pl4', 'pl5', 'pl6', 'pl7', 'pl8'],
    },
  });
  const { id } = await create.json();
  await adminPage.request.put(`/api/tournaments/${id}/pairs`, {
    data: { pairs: [['pl1', 'pl2'], ['pl3', 'pl4'], ['pl5', 'pl6'], ['pl7', 'pl8']] },
  });
  await adminPage.request.post(`/api/tournaments/${id}/generate`, { data: { seed: 1 } });
  await adminCtx.close();

  const playerCtx = await browser.newContext({ storageState: 'e2e/.auth/player.json' });
  const page = await playerCtx.newPage();
  await page.goto(`/torneos/${id}`);

  await expect(page.getByRole('heading', { name: 'E2E Torneo Público' }).first()).toBeVisible();
  await expect(page.getByText('Cuadro').first()).toBeVisible();
  await expect(page.getByText('Tu próximo partido').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Guardar' })).toHaveCount(0);

  await playerCtx.close();
});
