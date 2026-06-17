import { test, expect } from '@playwright/test';

test('vista pública del pozo: solo lectura + tu próximo partido', async ({ browser }) => {
  const adminCtx = await browser.newContext({ storageState: 'e2e/.auth/admin.json' });
  const adminPage = await adminCtx.newPage();
  const create = await adminPage.request.post('/api/tournaments', {
    data: {
      name: 'E2E Pozo Público', date: '2026-07-12', location: null, kind: 'pozo', format: 'fixed_pairs',
      config: { rounds: 2, matchFormat: { kind: 'timed', minutes: 12, tieRule: 'golden_point' } },
      courts: [
        { label: 'Central', order: 1, availableFrom: '17:00', availableTo: '20:00' },
        { label: 'Pista 2', order: 2, availableFrom: '17:00', availableTo: '20:00' },
      ],
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
  await page.goto(`/pozos/${id}`);

  await expect(page.getByRole('heading', { name: 'E2E Pozo Público' }).first()).toBeVisible();
  // La escalera pública (solo lectura): scrubber de rondas + carril de cabeza 👑.
  await expect(page.getByText('Ronda').first()).toBeVisible();
  await expect(page.getByRole('group', { name: 'Selector de ronda' })).toBeVisible();
  await expect(page.getByText('👑', { exact: false }).first()).toBeVisible();
  // Banda "Tu próximo" del jugador logueado.
  await expect(page.getByText('Tu próximo').first()).toBeVisible();
  // Solo lectura: no hay botones de guardar resultado.
  await expect(page.getByRole('button', { name: 'Guardar' })).toHaveCount(0);

  await playerCtx.close();
});
