import { test, expect } from '@playwright/test';

test.use({ storageState: 'e2e/.auth/admin.json' });

const BASE = {
  date: '2026-08-01', location: null, kind: 'torneo', format: 'single_elim',
  config: { matchFormat: { kind: 'best_of_3' }, thirdPlace: false },
  courts: [
    { label: 'Central', order: 1, availableFrom: '17:00', availableTo: '23:00' },
    { label: 'Pista 2', order: 2, availableFrom: '17:00', availableTo: '23:00' },
  ],
  participantPlayerIds: ['pl1', 'pl2', 'pl3', 'pl4', 'pl5', 'pl6', 'pl7', 'pl8'],
};

test('torneo eliminación directa: parejas → generar → cuadro → resultados → final jugable', async ({ page }) => {
  const create = await page.request.post('/api/tournaments', { data: { ...BASE, name: 'E2E KO' } });
  expect(create.ok()).toBeTruthy();
  const { id } = await create.json();
  await page.request.put(`/api/tournaments/${id}/pairs`, {
    data: { pairs: [['pl1', 'pl2'], ['pl3', 'pl4'], ['pl5', 'pl6'], ['pl7', 'pl8']] },
  });

  await page.goto(`/admin/torneos/${id}`);
  await page.getByRole('button', { name: 'Generar' }).click();

  await expect(page.getByText('Semifinales')).toBeVisible();
  await expect(page.getByText('Final', { exact: true })).toBeVisible();

  // Registrar las 2 semifinales (los Guardar visibles del cuadro).
  for (let i = 0; i < 2; i++) {
    const btn = page.getByRole('button', { name: 'Guardar' }).first();
    if (!(await btn.isVisible().catch(() => false))) break;
    await page.getByLabel('Juegos equipo A').first().fill('2');
    await page.getByLabel('Juegos equipo B').first().fill('0');
    await btn.click();
    await page.waitForTimeout(250);
  }

  // Tras las semis, la final queda jugable (resolveBracket rellena sus parejas) → aparece su Guardar.
  await expect(page.getByRole('button', { name: 'Guardar' })).toBeVisible();

  // Registrar la final: el campeón abre la vista con su banda a ancho completo
  // (peak-end: la corona ya no queda escondida al final del scroll horizontal).
  await page.getByLabel('Juegos equipo A').first().fill('2');
  await page.getByLabel('Juegos equipo B').first().fill('0');
  await page.getByRole('button', { name: 'Guardar' }).first().click();
  await expect(page.locator('.podium-gold').first()).toBeVisible();
  await expect(page.getByText('Campeón').first()).toBeVisible();
});
