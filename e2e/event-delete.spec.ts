import { test, expect } from '@playwright/test';

test.use({ storageState: 'e2e/.auth/admin.json' });

test('admin elimina un pozo desde el panel y desaparece de la lista', async ({ page }) => {
  // Monta el estado vía API (rápido y estable).
  const create = await page.request.post('/api/tournaments', {
    data: {
      name: 'E2E Pozo A Borrar', date: '2026-08-01', location: null, kind: 'pozo', format: 'americano',
      config: { rounds: 3, matchFormat: { kind: 'timed', minutes: 12, tieRule: 'golden_point' } },
      courts: [{ label: 'Central', order: 1, availableFrom: '17:00', availableTo: '20:00' }],
      participantPlayerIds: ['pl1', 'pl2', 'pl3', 'pl4'],
    },
  });
  expect(create.ok()).toBeTruthy();
  const { id } = await create.json();

  await page.goto(`/admin/pozos/${id}`);
  await expect(page.getByRole('heading', { name: 'E2E Pozo A Borrar' }).first()).toBeVisible();

  // El botón de compartir enlace es visible.
  await expect(page.getByRole('button', { name: 'Compartir enlace' }).first()).toBeVisible();

  // El confirm() del navegador se acepta automáticamente.
  page.on('dialog', (d) => d.accept());

  await page.getByRole('button', { name: 'Eliminar pozo' }).first().click();

  // Navega a la lista de pozos y el evento ya no aparece.
  await expect(page).toHaveURL(/\/admin\/pozos$/);
  await expect(page.getByText('E2E Pozo A Borrar')).toHaveCount(0);

  // La API confirma que el evento ya no existe (GET ya no responde OK).
  const after = await page.request.get(`/api/tournaments/${id}`);
  expect(after.ok()).toBeFalsy();
});
