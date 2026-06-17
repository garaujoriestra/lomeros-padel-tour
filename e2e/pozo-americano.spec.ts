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

  // La UI nueva es la "escalera": cabecera de sección + scrubber de rondas.
  await expect(page.getByText('Escalera').first()).toBeVisible();
  await expect(page.getByRole('group', { name: 'Selector de ronda' })).toBeVisible();

  await page.getByLabel('Juegos equipo A').first().fill('4');
  await page.getByLabel('Juegos equipo B').first().fill('1');
  await page.getByRole('button', { name: 'Guardar' }).first().click();

  // Tras guardar, el carril pasa a "Final" y la escalera muestra el carril de cabeza 👑.
  await expect(page.getByText('Final').first()).toBeVisible();
  await expect(page.getByText('👑', { exact: false }).first()).toBeVisible();
});
