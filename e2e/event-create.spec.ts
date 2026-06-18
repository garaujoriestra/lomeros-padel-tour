import { test, expect } from '@playwright/test';

test.use({ storageState: 'e2e/.auth/admin.json' });

test('admin crea un POZO americano desde el formulario', async ({ page }) => {
  await page.goto('/admin/pozos/new');
  await page.getByLabel('Nombre *').fill('E2E Pozo');
  await page.getByLabel('Fecha *').fill('2026-07-01');
  await page.getByLabel('Formato').selectOption('americano');
  await page.getByLabel('Nº de rondas').fill('4');
  await page.getByLabel('Nombre de la pista').first().fill('Central');
  for (const n of ['Jugador 1', 'Jugador 2', 'Jugador 3', 'Jugador 4']) {
    await page.getByRole('checkbox', { name: n }).check();
  }
  await page.getByRole('button', { name: 'Crear pozo' }).click();
  await expect(page).toHaveURL(/\/admin\/pozos$/);
  await expect(page.getByRole('link', { name: /E2E Pozo/ })).toBeVisible();
});

test('admin crea un TORNEO grupos→eliminación', async ({ page }) => {
  await page.goto('/admin/torneos/new');
  await page.getByLabel('Nombre *').fill('E2E Torneo');
  await page.getByLabel('Fecha *').fill('2026-07-02');
  await page.getByLabel('Formato').selectOption('groups_elim');
  await page.getByLabel('Nº de grupos').fill('2');
  await page.getByLabel('Pasan por grupo').fill('2');
  await page.getByLabel('Nombre de la pista').first().fill('Central');
  for (const n of ['Jugador 1', 'Jugador 2', 'Jugador 3', 'Jugador 4']) {
    await page.getByRole('checkbox', { name: n }).check();
  }
  await page.getByRole('button', { name: 'Crear torneo' }).click();
  await expect(page).toHaveURL(/\/admin\/torneos$/);
  await expect(page.getByRole('link', { name: /E2E Torneo/ })).toBeVisible();
});

test('admin puede añadir y quitar una pista en el formulario', async ({ page }) => {
  await page.goto('/admin/torneos/new');
  // Empieza con 1 pista y sin botón de quitar (no se puede quedar en cero).
  await expect(page.getByLabel('Nombre de la pista')).toHaveCount(1);
  await expect(page.getByRole('button', { name: /Quitar pista/ })).toHaveCount(0);

  // Añadir una segunda pista → aparecen los botones de quitar.
  await page.getByRole('button', { name: 'Añadir pista' }).click();
  await expect(page.getByLabel('Nombre de la pista')).toHaveCount(2);
  await page.getByLabel('Nombre de la pista').nth(1).fill('Pista 2');

  // Quitar la segunda pista → vuelve a 1 y desaparecen los botones de quitar.
  await page.getByRole('button', { name: 'Quitar pista 2' }).click();
  await expect(page.getByLabel('Nombre de la pista')).toHaveCount(1);
  await expect(page.getByRole('button', { name: /Quitar pista/ })).toHaveCount(0);
});
