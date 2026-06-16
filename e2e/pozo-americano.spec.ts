import { test, expect } from '@playwright/test';

test.use({ storageState: 'e2e/.auth/admin.json' });

test('pozo americano: generar → resultado → clasificación', async ({ page }) => {
  const create = await page.request.post('/api/tournaments', {
    data: {
      name: 'E2E Pozo Am', date: '2026-07-11', location: null, kind: 'pozo', format: 'americano',
      config: { rounds: 2, matchFormat: { kind: 'timed', minutes: 12, tieRule: 'golden_point' } },
      courts: [
        { label: 'Central', order: 1, availableFrom: '17:00', availableTo: '20:00' },
        { label: 'Pista 2', order: 2, availableFrom: '17:00', availableTo: '20:00' },
      ],
      participantPlayerIds: ['pl1', 'pl2', 'pl3', 'pl4', 'pl5', 'pl6', 'pl7', 'pl8'],
    },
  });
  const { id } = await create.json();

  await page.goto(`/admin/pozos/${id}`);
  await page.getByRole('button', { name: 'Generar' }).click();
  await expect(page.getByText('Ronda 1')).toBeVisible();

  await page.getByLabel('Juegos equipo A').first().fill('4');
  await page.getByLabel('Juegos equipo B').first().fill('1');
  await page.getByRole('button', { name: 'Guardar' }).first().click();
  await expect(page.getByText(/4.1/).first()).toBeVisible();

  await expect(page.getByText('Clasificación')).toBeVisible();
});
