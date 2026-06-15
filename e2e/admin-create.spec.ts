import { test, expect } from '@playwright/test';

test.use({ storageState: 'e2e/.auth/admin.json' });

test('admin crea un torneo desde el formulario', async ({ page }) => {
  await page.goto('/admin/tournaments/new');

  await page.getByLabel('Nombre').fill('E2E Crear UI');
  await page.getByLabel('Fecha').fill('2026-07-01');

  // Selecciona 4 participantes (sembrados en global-setup: "Jugador 1".."Jugador 8").
  for (const n of ['Jugador 1', 'Jugador 2', 'Jugador 3', 'Jugador 4']) {
    await page.getByRole('checkbox', { name: n }).check();
  }

  await page.getByRole('button', { name: 'Crear torneo' }).click();

  // Vuelve al listado y el torneo aparece.
  await expect(page).toHaveURL(/\/admin\/tournaments$/);
  await expect(page.getByRole('link', { name: 'E2E Crear UI' })).toBeVisible();

  // El panel muestra que aún no hay bloques.
  await page.getByRole('link', { name: 'E2E Crear UI' }).click();
  await expect(page).toHaveURL(/\/admin\/tournaments\/[0-9a-f-]+$/);
  await expect(page.getByText('Sin bloques.')).toBeVisible();
});
