import { test, expect } from '@playwright/test';

test.use({ storageState: 'e2e/.auth/admin.json' });

const POZO = {
  name: 'E2E Pozo PF', date: '2026-07-10', location: null, kind: 'pozo', format: 'fixed_pairs',
  config: { rounds: 2, matchFormat: { kind: 'timed', minutes: 12, tieRule: 'golden_point' } },
  courts: [
    { label: 'Central', order: 1, availableFrom: '17:00', availableTo: '20:00' },
    { label: 'Pista 2', order: 2, availableFrom: '17:00', availableTo: '20:00' },
  ],
  participantPlayerIds: ['pl1', 'pl2', 'pl3', 'pl4', 'pl5', 'pl6', 'pl7', 'pl8'],
};

test('pozo parejas fijas: crear → parejas → generar → resultados → clasificación', async ({ page }) => {
  const create = await page.request.post('/api/tournaments', { data: POZO });
  expect(create.ok()).toBeTruthy();
  const { id } = await create.json();

  const putPairs = await page.request.put(`/api/tournaments/${id}/pairs`, {
    data: { pairs: [['pl1', 'pl2'], ['pl3', 'pl4'], ['pl5', 'pl6'], ['pl7', 'pl8']] },
  });
  expect(putPairs.ok()).toBeTruthy();

  await page.goto(`/admin/pozos/${id}`);
  await page.getByRole('button', { name: 'Generar' }).click();

  await expect(page.getByText('Ronda 1')).toBeVisible();

  // Registrar el resultado de los partidos de la ronda 0 (2 pistas → 2 partidos).
  for (let i = 0; i < 2; i++) {
    const btn = page.getByRole('button', { name: 'Guardar' }).first();
    if (!(await btn.isVisible())) break;
    await page.getByLabel('Juegos equipo A').first().fill('4');
    await page.getByLabel('Juegos equipo B').first().fill('2');
    await btn.click();
    await expect(page.getByText(/4.2/).first()).toBeVisible();
  }

  await expect(page.getByText('Clasificación')).toBeVisible();
  await expect(page.getByText('👑', { exact: false }).first()).toBeVisible();
});

test('el editor de parejas guarda desde la UI y habilita Generar', async ({ page }) => {
  const create = await page.request.post('/api/tournaments', {
    data: { ...POZO, name: 'E2E Pozo PF UI', participantPlayerIds: ['pl1', 'pl2', 'pl3', 'pl4'] },
  });
  const { id } = await create.json();
  await page.goto(`/admin/pozos/${id}`);

  await page.getByLabel('Jugador A').selectOption('pl1');
  await page.getByLabel('Jugador B').selectOption('pl2');
  await page.getByRole('button', { name: 'Añadir pareja' }).click();
  await page.getByLabel('Jugador A').selectOption('pl3');
  await page.getByLabel('Jugador B').selectOption('pl4');
  await page.getByRole('button', { name: 'Añadir pareja' }).click();
  await page.getByRole('button', { name: 'Guardar parejas' }).click();
  await expect(page.getByText('Guardado ✓')).toBeVisible();

  await expect(page.getByRole('button', { name: 'Generar' })).toBeEnabled();
});
