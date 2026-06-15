import { test, expect } from '@playwright/test';
import { newAdminRequest, setupGeneratedTournament } from './helpers';

test.use({ storageState: 'e2e/.auth/admin.json' });

test('admin registra un resultado en la parrilla y se ve el marcador', async ({ page, playwright }) => {
  const admin = await newAdminRequest(playwright);
  const id = await setupGeneratedTournament(admin, 'E2E Resultado');
  await admin.dispose();

  await page.goto(`/admin/tournaments/${id}/schedule`);

  // Abre el primer partido jugable y mete 6–2.
  await page.getByRole('button', { name: 'Resultado' }).first().click();
  await page.getByLabel('Marcador equipo A').fill('6');
  await page.getByLabel('Marcador equipo B').fill('2');
  await page.getByRole('button', { name: 'Guardar' }).click();

  // Tras refrescar, el marcador aparece como badge (guion largo U+2013).
  await expect(page.getByText('6–2')).toBeVisible();
  // Y la clasificación del pozo ya está presente.
  await expect(page.getByText('Clasificación')).toBeVisible();
});
